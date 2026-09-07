// src/modules/sales/sales.repository.js
import { db } from "../../config/postgres.js";
import {
  sales,
  saleItems,
  salePayments,
  customers,
  retailPrices,
  productVariants,
  products,
  inventory,
} from "../../db/schema.js";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

const SalesRepo = {
  async createSale(tx, values) {
    const [row] = await tx.insert(sales).values(values).returning();
    return row;
  },

  async insertItems(tx, rows) {
    if (!rows.length) return [];
    return tx.insert(saleItems).values(rows).returning();
  },

  async insertPayments(tx, rows) {
    if (!rows.length) return [];
    return tx.insert(salePayments).values(rows).returning();
  },

  /**
   * What the retailer sells this variant for: their own price if set, else the
   * printed MRP. distributor_inventory.selling_price is what they *pay*, not
   * what they charge, so it is deliberately not a fallback here.
   */
  async resolvePrices(retailerId, variantIds) {
    if (!variantIds.length) return {};
    const rows = await db
      .select({
        variantId: productVariants.id,
        name: productVariants.name,
        sku: productVariants.sku,
        unit: productVariants.unit,
        gstRate: productVariants.gstRate,
        mrp: productVariants.mrp,
        retailPrice: retailPrices.price,
      })
      .from(productVariants)
      .leftJoin(
        retailPrices,
        and(
          eq(retailPrices.variantId, productVariants.id),
          eq(retailPrices.retailerId, retailerId)
        )
      )
      .where(inArray(productVariants.id, variantIds));

    return Object.fromEntries(rows.map((r) => [r.variantId, r]));
  },

  async nextBillNumber(tx, retailerId) {
    const [row] = await tx
      .select({ n: sql`count(*)` })
      .from(sales)
      .where(eq(sales.retailerId, retailerId));
    const seq = Number(row?.n || 0) + 1;
    return `BILL-${String(seq).padStart(5, "0")}`;
  },

  async listSales(retailerId, { limit = 50 } = {}) {
    return db
      .select()
      .from(sales)
      .where(eq(sales.retailerId, retailerId))
      .orderBy(desc(sales.soldAt))
      .limit(limit);
  },

  async getSaleWithItems(retailerId, saleId) {
    const [sale] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.retailerId, retailerId)));
    if (!sale) return null;

    const items = await db
      .select({
        id: saleItems.id,
        variantId: saleItems.variantId,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        unitCost: saleItems.unitCost,
        amount: saleItems.amount,
        variantName: productVariants.name,
        sku: productVariants.sku,
        productName: products.name,
      })
      .from(saleItems)
      .leftJoin(productVariants, eq(saleItems.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .where(eq(saleItems.saleId, saleId));

    const payments = await db
      .select()
      .from(salePayments)
      .where(eq(salePayments.saleId, saleId));

    return { ...sale, items, payments };
  },

  /** The retailer's sellable shelf: what they hold, and what they charge. */
  async listSellable(retailerId) {
    return db
      .select({
        variantId: productVariants.id,
        variantName: productVariants.name,
        sku: productVariants.sku,
        unit: productVariants.unit,
        gstRate: productVariants.gstRate,
        mrp: productVariants.mrp,
        retailPrice: retailPrices.price,
        qty: inventory.qty,
        productName: products.name,
        category: products.category,
        imageUrl: products.imageUrl,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(inventory.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(
        retailPrices,
        and(
          eq(retailPrices.variantId, productVariants.id),
          eq(retailPrices.retailerId, retailerId)
        )
      )
      .where(eq(inventory.retailerId, retailerId));
  },

  async upsertRetailPrice(retailerId, variantId, price) {
    const [row] = await db
      .insert(retailPrices)
      .values({ retailerId, variantId, price })
      .onConflictDoUpdate({
        target: [retailPrices.retailerId, retailPrices.variantId],
        set: { price, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  async findOrCreateCustomer(tx, retailerId, { name, phone }) {
    if (!phone && !name) return null;
    if (phone) {
      const [existing] = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.retailerId, retailerId), eq(customers.phone, phone)));
      if (existing) return existing;
    }
    const [row] = await tx
      .insert(customers)
      .values({ retailerId, name: name || null, phone: phone || null })
      .returning();
    return row;
  },
};

export default SalesRepo;
