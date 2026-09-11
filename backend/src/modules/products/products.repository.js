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
  productBills,
  inventory,
} from "../../db/schema.js";
import { eq, and, ilike, inArray, isNull, ne } from "drizzle-orm";

export default {
  // --------- GLOBAL CATALOG ---------
  async findProducts({ distributorshipId, search, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    // P5-4 soft delete: archived products/variants never surface in the
    // catalogue browse. Conditions are collected into one and(...) rather
    // than chained .where() calls, which REPLACE the predicate in Drizzle
    // instead of ANDing it (see connections.repository.js's note).
    const conditions = [isNull(products.archivedAt)];
    if (distributorshipId) {
      conditions.push(eq(products.distributorshipId, distributorshipId));
    }
    if (search) {
      conditions.push(ilike(products.name, `%${search}%`));
    }

    const rows = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(products.createdAt)
      .limit(limit)
      .offset(offset);

    const productIds = rows.map(r => r.id);
    let variants = [];
    if (productIds.length) {
      variants = await db
        .select()
        .from(productVariants)
        .where(
          and(
            inArray(productVariants.productId, productIds),
            isNull(productVariants.archivedAt)
          )
        );
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

  async createProductInCatalog(
    { distributorshipId, name, imageUrl, category, subcategory, variants, createdByDistributorId },
    txOrDb = db
  ) {
    const [createdProduct] = await txOrDb
      .insert(products)
      .values({
        distributorshipId,
        name,
        imageUrl: imageUrl || null,
        category: category || null,
        subcategory: subcategory || null,
        createdByDistributorId: createdByDistributorId || null,
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
      insertedVariants = await txOrDb
        .insert(productVariants)
        .values(variantsToInsert)
        .returning();
    }

    return { ...createdProduct, variants: insertedVariants };
  },

  /**
   * P5-4: this USED to DELETE every existing variant of the product and
   * re-insert payload.variants wholesale, which cascade-deleted any
   * distributor_inventory / product_bills / inventory row referencing the
   * deleted variant ids - i.e. it could silently destroy another tenant's
   * stock and billing history as a side effect of an unrelated edit.
   *
   * Now: reconcile by id (falling back to sku when a payload variant has no
   * id). A matched existing variant is UPDATEd in place; an unmatched one is
   * INSERTed as new. An existing variant that's no longer present in the
   * payload is only ever removed if it has ZERO referencing rows anywhere -
   * otherwise it is left untouched. No unconditional DELETE FROM
   * product_variants ever runs again.
   */
  async updateProductInCatalog(productId, payload) {
    return db.transaction(async (tx) => {
      const [updatedProduct] = await tx
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

      if (!payload.variants) {
        const variants = await tx
          .select()
          .from(productVariants)
          .where(eq(productVariants.productId, productId));
        return { ...updatedProduct, variants };
      }

      const existingVariants = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId));

      const existingById = new Map(existingVariants.map(v => [v.id, v]));
      const existingBySku = new Map(existingVariants.map(v => [v.sku, v]));
      const matchedIds = new Set();
      const toInsert = [];

      for (const v of payload.variants) {
        let existing = v.id ? existingById.get(v.id) : null;
        if (!existing && v.sku) existing = existingBySku.get(v.sku);

        const values = {
          name: v.name,
          sku: v.sku,
          mrp: v.mrp ?? "0",
          unit: v.unit || null,
          hsnCode: v.hsnCode || null,
          gstRate: v.gstRate ?? "0",
          isTaxInclusive: v.isTaxInclusive ?? false,
        };

        if (existing) {
          matchedIds.add(existing.id);
          await tx
            .update(productVariants)
            .set(values)
            .where(eq(productVariants.id, existing.id));
        } else {
          toInsert.push({ productId, ...values });
        }
      }

      if (toInsert.length) {
        await tx.insert(productVariants).values(toInsert);
      }

      // Existing variants no longer mentioned in the payload: only remove
      // them if nothing references them anywhere.
      const removalCandidates = existingVariants.filter(v => !matchedIds.has(v.id));
      const skippedRemovals = [];
      for (const v of removalCandidates) {
        const referenced = await variantHasAnyReference(v.id, tx);
        if (referenced) {
          skippedRemovals.push(v.id);
        } else {
          await tx.delete(productVariants).where(eq(productVariants.id, v.id));
        }
      }

      const finalVariants = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId));

      return {
        ...updatedProduct,
        variants: finalVariants,
        // Variants the caller asked (implicitly) to remove but which were
        // kept because something still references them.
        keptExistingVariantIds: skippedRemovals,
      };
    });
  },

  /**
   * P5-4: soft delete. A hard DELETE here cascades onto
   * distributor_inventory / product_bills / inventory rows via their FKs -
   * exactly the destruction this phase exists to stop. archivedAt hides the
   * product (and its variants) from catalogue reads without touching
   * anything that references them.
   */
  async deleteProductFromCatalog(productId) {
    const now = new Date();
    const [archived] = await db
      .update(products)
      .set({ archivedAt: now })
      .where(eq(products.id, productId))
      .returning();

    if (archived) {
      await db
        .update(productVariants)
        .set({ archivedAt: now })
        .where(eq(productVariants.productId, productId));
    }

    return archived || null;
  },

  // --------- Curation (Phase 2c) ---------

  /**
   * True once at least one variant of this product has a distributor_inventory
   * row from a distributor OTHER than the product's creator - the signal that
   * turns the product append-only. When createdByDistributorId is unknown
   * (null - a pre-existing/backfilled product), ANY stocking distributor
   * counts as "other", since there is no recorded creator to exempt.
   */
  async hasInventoryFromOtherDistributor(variantIds, createdByDistributorId) {
    if (!variantIds.length) return false;
    const conditions = [inArray(distributorInventory.variantId, variantIds)];
    if (createdByDistributorId) {
      conditions.push(ne(distributorInventory.distributorId, createdByDistributorId));
    }
    const [row] = await db
      .select({ id: distributorInventory.id })
      .from(distributorInventory)
      .where(and(...conditions))
      .limit(1);
    return !!row;
  },

  // --------- HELPERS FOR BULK IMPORT (Phase 2d) ---------

  async findDistributorshipByName(name, txOrDb = db) {
    const [row] = await txOrDb
      .select()
      .from(distributorships)
      .where(eq(distributorships.name, name));
    return row || null;
  },

  async createDistributorship(name, txOrDb = db) {
    const [row] = await txOrDb
      .insert(distributorships)
      .values({ name })
      .returning();
    return row;
  },

  async findProductByNameInDistributorship(name, distributorshipId, txOrDb = db) {
    const [row] = await txOrDb
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

  async findProductByIdRaw(productId, txOrDb = db) {
    const [row] = await txOrDb
      .select()
      .from(products)
      .where(eq(products.id, productId));
    return row || null;
  },

  async findVariantBySkuInProduct(sku, productId, txOrDb = db) {
    const [row] = await txOrDb
      .select()
      .from(productVariants)
      .where(
        and(eq(productVariants.sku, sku), eq(productVariants.productId, productId)),
      );
    return row || null;
  },

  /**
   * product_variants.sku is globally unique (schema.js), but the import used
   * to look it up scoped to one product row (findVariantBySkuInProduct). A
   * SKU that already existed under a DIFFERENT product row (another
   * distributor's catalogue entry) would then hit the unique constraint on
   * createVariant and throw mid-loop. Look up by the real (global) scope
   * first so the caller can attach to the existing variant instead.
   */
  async findVariantBySkuGlobal(sku, txOrDb = db) {
    const [row] = await txOrDb
      .select()
      .from(productVariants)
      .where(eq(productVariants.sku, sku));
    return row || null;
  },

  async createVariant(data, txOrDb = db) {
    const [row] = await txOrDb.insert(productVariants).values(data).returning();
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
   * never on product_variants. Deliberately UNCHANGED by the Phase 2b
   * membership model - a retailer reaches products through their own
   * distributor_inventory-based connection scope, not through
   * distributorship membership.
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
      .where(
        and(
          inArray(distributorInventory.distributorId, distributorIds),
          isNull(products.archivedAt),
          isNull(productVariants.archivedAt)
        )
      );
  },
};

/**
 * Does anything still reference this variant? Checked before a reconcile
 * (updateProductInCatalog) is allowed to actually remove a variant that
 * dropped out of the incoming payload. `txOrDb` so it can run inside the
 * same transaction as the reconcile itself.
 */
async function variantHasAnyReference(variantId, txOrDb = db) {
  const [invRow] = await txOrDb
    .select({ id: distributorInventory.id })
    .from(distributorInventory)
    .where(eq(distributorInventory.variantId, variantId))
    .limit(1);
  if (invRow) return true;

  const [billRow] = await txOrDb
    .select({ id: productBills.id })
    .from(productBills)
    .where(eq(productBills.variantId, variantId))
    .limit(1);
  if (billRow) return true;

  const [retailerInvRow] = await txOrDb
    .select({ id: inventory.id })
    .from(inventory)
    .where(eq(inventory.variantId, variantId))
    .limit(1);
  if (retailerInvRow) return true;

  return false;
}
