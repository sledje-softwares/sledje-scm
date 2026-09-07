// src/modules/products/products.repository.js
import { db } from "../../config/postgres.js";
import {
  products,
  productVariants,
  distributorships,
  distributorInventory,
  distributors,
  retailers,
  connections,
} from "../../db/schema.js";
import { eq, and, ilike, inArray } from "drizzle-orm";

export default {
  // --------- GLOBAL CATALOG ---------
  async findProducts({ distributorshipId, search, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    let q = db.select().from(products);

    if (distributorshipId) {
      q = q.where(eq(products.distributorshipId, distributorshipId));
    }
    if (search) {
      q = q.where(ilike(products.name, `%${search}%`));
    }

    const rows = await q
      .orderBy(products.createdAt)
      .limit(limit)
      .offset(offset);

    const productIds = rows.map(r => r.id);
    let variants = [];
    if (productIds.length) {
      variants = await db
        .select()
        .from(productVariants)
        .where(inArray(productVariants.productId, productIds));
    }

    const map = Object.fromEntries(productIds.map(id => [id, []]));
    for (const v of variants) {
      if (!map[v.productId]) map[v.productId] = [];
      map[v.productId].push(v);
    }

    return rows.map(p => ({
      ...p,
      variants: map[p.id] || [],
    }));
  },

  async findProductById(productId) {
    const [prod] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId));
    if (!prod) return null;

    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId));

    return { ...prod, variants };
  },

  async createProductInCatalog({ distributorshipId, name, imageUrl, category, subcategory, variants }) {
    const [createdProduct] = await db
      .insert(products)
      .values({
        distributorshipId,
        name,
        imageUrl: imageUrl || null,
        category: category || null,
        subcategory: subcategory || null,
      })
      .returning();

    const variantsToInsert = (variants || []).map(v => ({
      productId: createdProduct.id,
      name: v.name,
      sku: v.sku,
      mrp: v.mrp ?? "0",
      unit: v.unit || null,
      hsnCode: v.hsnCode || null,
      gstRate: v.gstRate ?? "0",
      isTaxInclusive: v.isTaxInclusive ?? false,
    }));

    let insertedVariants = [];
    if (variantsToInsert.length) {
      insertedVariants = await db
        .insert(productVariants)
        .values(variantsToInsert)
        .returning();
    }

    return { ...createdProduct, variants: insertedVariants };
  },

  async updateProductInCatalog(productId, payload) {
    const [updatedProduct] = await db
      .update(products)
      .set({
        name: payload.name,
        imageUrl: payload.imageUrl,
        category: payload.category,
        subcategory: payload.subcategory,
      })
      .where(eq(products.id, productId))
      .returning();

    if (!updatedProduct) return null;

    if (payload.variants) {
      // simplest: replace variants
      await db
        .delete(productVariants)
        .where(eq(productVariants.productId, productId));

      const toInsert = payload.variants.map(v => ({
        productId,
        name: v.name,
        sku: v.sku,
        mrp: v.mrp ?? "0",
        unit: v.unit || null,
        hsnCode: v.hsnCode || null,
        gstRate: v.gstRate ?? "0",
        isTaxInclusive: v.isTaxInclusive ?? false,
      }));

      const inserted = toInsert.length
        ? await db.insert(productVariants).values(toInsert).returning()
        : [];

      return { ...updatedProduct, variants: inserted };
    }

    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId));

    return { ...updatedProduct, variants };
  },

  async deleteProductFromCatalog(productId) {
    await db.delete(products).where(eq(products.id, productId));
  },

  // --------- HELPERS FOR BULK IMPORT ---------

  async findDistributorshipByName(name) {
    const [row] = await db
      .select()
      .from(distributorships)
      .where(eq(distributorships.name, name));
    return row || null;
  },

  async createDistributorship(name) {
    const [row] = await db
      .insert(distributorships)
      .values({ name })
      .returning();
    return row;
  },

  async findProductByNameInDistributorship(name, distributorshipId) {
    const [row] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.name, name),
          eq(products.distributorshipId, distributorshipId),
        ),
      );
    return row || null;
  },

  async findVariantBySkuInProduct(sku, productId) {
    const [row] = await db
      .select()
      .from(productVariants)
      .where(
        and(eq(productVariants.sku, sku), eq(productVariants.productId, productId)),
      );
    return row || null;
  },

  async createVariant(data) {
    const [row] = await db.insert(productVariants).values(data).returning();
    return row;
  },

  // --------- Distributor mapping helpers ---------

  async findDistributorByUserId(userId) {
    const [row] = await db
      .select()
      .from(distributors)
      .where(eq(distributors.userId, userId));
    return row || null;
  },

  async getConnectedDistributorIdsForRetailer(retailerId) {
    const rows = await db
      .select()
      .from(connections)
      .where(eq(connections.retailerId, retailerId));
    return rows.map(r => r.distributorId);
  },

  async findRetailerByUserId(userId) {
    const [row] = await db
      .select()
      .from(retailers)
      .where(eq(retailers.userId, userId));
    return row || null;
  },

  /**
   * What the given distributors actually sell: catalogue rows joined to the
   * distributor's own stock and pricing. Prices live on distributor_inventory,
   * never on product_variants.
   */
  async findSellableItemsForDistributors(distributorIds) {
    if (!distributorIds.length) return [];
    return db
      .select({
        distributorId: distributorInventory.distributorId,
        variantId: productVariants.id,
        variantName: productVariants.name,
        sku: productVariants.sku,
        unit: productVariants.unit,
        mrp: productVariants.mrp,
        gstRate: productVariants.gstRate,
        hsnCode: productVariants.hsnCode,
        productId: products.id,
        productName: products.name,
        imageUrl: products.imageUrl,
        category: products.category,
        subcategory: products.subcategory,
        distributorshipId: products.distributorshipId,
        stock: distributorInventory.stock,
        sellingPrice: distributorInventory.sellingPrice,
        lowStockThreshold: distributorInventory.lowStockThreshold,
        expiry: distributorInventory.expiry,
      })
      .from(distributorInventory)
      .innerJoin(productVariants, eq(distributorInventory.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(inArray(distributorInventory.distributorId, distributorIds));
  },
};
