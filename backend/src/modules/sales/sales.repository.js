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
import { eq, and, desc, sql, inArray, gt, or } from "drizzle-orm";
import { disambiguate, SERVER_DEVICE_CODE, formatBillNumber } from "./bill-number.js";

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

  /**
   * The bill number for a sale rung up through POST /sales rather than by a
   * device.
   *
   * The old implementation was `count(*) + 1` over ALL of the retailer's
   * sales, which is a lost-update race even online and is unrunnable offline
   * (see bill-number.js). Devices now allocate their own numbers; this path
   * only has to allocate under the reserved SERVER prefix, so it counts within
   * that prefix and then walks past anything already taken.
   */
  async nextServerBillNumber(tx, retailerId) {
    const [row] = await tx
      .select({ n: sql`count(*)` })
      .from(sales)
      .where(
        and(
          eq(sales.retailerId, retailerId),
          sql`${sales.billNumber} LIKE ${SERVER_DEVICE_CODE + "-%"}`
        )
      );

    const candidate = formatBillNumber(SERVER_DEVICE_CODE, Number(row?.n || 0) + 1);
    return this.claimBillNumber(tx, retailerId, candidate);
  },

  /**
   * Find a free bill number at or after `candidate`.
   *
   * uq_sale_bill(retailer_id, bill_number) is the real guarantee; this is the
   * path that keeps a collision from becoming a failed sale. A device's
   * six-character prefix makes a clash astronomically unlikely, but the money
   * path does not get to rely on "unlikely", and the op that carries the
   * original number is append-only and must not be rewritten. So the SERVER
   * resolves the clash and reports back what it assigned - a bill number is a
   * display label, and the ULID is the identity.
   */
  async claimBillNumber(tx, retailerId, candidate) {
    let attempt = 0;
    let value = candidate;

    // Bounded: six characters of entropy plus 32 suffixes is far past the
    // point where a real clash is possible. Looping forever on the money path
    // would be worse than failing loudly.
    while (attempt <= 32) {
      const [taken] = await tx
        .select({ id: sales.id })
        .from(sales)
        .where(and(eq(sales.retailerId, retailerId), eq(sales.billNumber, value)))
        .limit(1);

      if (!taken) return value;
      attempt += 1;
      value = disambiguate(candidate, attempt);
    }

    throw new Error(`Could not allocate a bill number near ${candidate}`);
  },

  async getSaleById(tx, retailerId, saleId) {
    const [row] = await (tx || db)
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.retailerId, retailerId)));
    return row || null;
  },

  async listItemsForSale(tx, saleId) {
    return (tx || db).select().from(saleItems).where(eq(saleItems.saleId, saleId));
  },

  async markVoided(tx, saleId, reason) {
    const [row] = await tx
      .update(sales)
      .set({ status: "voided", voidedAt: new Date(), voidReason: reason || null })
      .where(eq(sales.id, saleId))
      .returning();
    return row;
  },

  /**
   * Shelf rows this device has not seen yet.
   *
   * Cursor-based rather than a full snapshot: a shop coming back after four
   * hours should not have to re-download its whole catalogue over a weak
   * connection. A null cursor means "first sync", which does send everything.
   *
   * NOTE this is a SNAPSHOT of a mutable counter, and that is deliberate: the
   * client treats it as a cache to display, never as a value to write back.
   * Every write is a delta. See docs/16-offline-first.md.
   */
  async listSellableChangedSince(retailerId, since) {
    const base = db
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
        lastUpdated: inventory.lastUpdated,
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
      );

    if (!since) return base.where(eq(inventory.retailerId, retailerId));

    return base.where(
      and(
        eq(inventory.retailerId, retailerId),
        or(gt(inventory.lastUpdated, since), gt(retailPrices.updatedAt, since))
      )
    );
  },

  async listSalesChangedSince(retailerId, since, limit = 200) {
    const where = since
      ? and(eq(sales.retailerId, retailerId), gt(sales.syncedAt, since))
      : eq(sales.retailerId, retailerId);

    return db.select().from(sales).where(where).orderBy(desc(sales.syncedAt)).limit(limit);
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

  async upsertRetailPrice(retailerId, variantId, price, tx) {
    const [row] = await (tx || db)
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
