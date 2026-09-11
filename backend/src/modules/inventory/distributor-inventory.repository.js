// src/modules/inventory/distributor-inventory.repository.js
import { db } from "../../config/postgres.js";
import {
  distributorInventory,
  productVariants,
  products,
  distributors,
  distributorships,
} from "../../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

export default {
  /**
   * Decrement a distributor's on-hand stock for one variant, inside a
   * transaction. Used at delivery confirmation - see orders.service.js
   * applyDeliveryEffects(). Stock is allowed to go negative rather than
   * throwing: refusing to record a delivery that physically happened is
   * worse than a negative number (see docs/16-offline-first.md's stock
   * conflict policy, which applies here too).
   */
  /**
   * Commit stock to an accepted order. It stays in `stock` (the distributor
   * still physically holds it) but is counted in `out_for_delivery`, so
   * available-to-sell is (stock - out_for_delivery). Released at delivery.
   */
  async reserveForDelivery(tx, distributorId, variantId, qty) {
    await tx
      .update(distributorInventory)
      .set({ outForDelivery: sql`${distributorInventory.outForDelivery} + ${qty}` })
      .where(
        and(
          eq(distributorInventory.distributorId, distributorId),
          eq(distributorInventory.variantId, variantId)
        )
      );
  },

  /**
   * Release a reservation. GREATEST(...,0) guards against a double-release
   * stranding the counter below zero - a leak here would permanently hide
   * stock the distributor actually has.
   */
  async releaseReservation(tx, distributorId, variantId, qty) {
    await tx
      .update(distributorInventory)
      .set({
        outForDelivery: sql`GREATEST(${distributorInventory.outForDelivery} - ${qty}, 0)`,
      })
      .where(
        and(
          eq(distributorInventory.distributorId, distributorId),
          eq(distributorInventory.variantId, variantId)
        )
      );
  },

  async decrementStock(tx, distributorId, variantId, qty) {
    const [row] = await tx
      .update(distributorInventory)
      .set({ stock: sql`${distributorInventory.stock} - ${qty}` })
      .where(
        and(
          eq(distributorInventory.distributorId, distributorId),
          eq(distributorInventory.variantId, variantId)
        )
      )
      .returning();
    return row || null;
  },

  async upsertInventory(
    distributorId,
    variantId,
    { stock, costPrice, sellingPrice, expiry, lowStockThreshold },
    txOrDb = db
  ) {
    // check if exists
    const [existing] = await txOrDb
      .select()
      .from(distributorInventory)
      .where(
        and(
          eq(distributorInventory.distributorId, distributorId),
          eq(distributorInventory.variantId, variantId),
        ),
      );

    if (existing) {
      const [updated] = await txOrDb
        .update(distributorInventory)
        .set({
          stock: (stock ?? existing.stock) ?? 0,
          costPrice: costPrice ?? existing.costPrice,
          sellingPrice: sellingPrice ?? existing.sellingPrice,
          expiry: expiry ?? existing.expiry,
          lowStockThreshold: lowStockThreshold ?? existing.lowStockThreshold,
        })
        .where(eq(distributorInventory.id, existing.id))
        .returning();
      return updated;
    }

    const [row] = await txOrDb
      .insert(distributorInventory)
      .values({
        distributorId,
        variantId,
        stock: stock ?? 0,
        costPrice: costPrice ?? "0",
        sellingPrice: sellingPrice ?? "0",
        expiry: expiry ?? null,
        lowStockThreshold: lowStockThreshold ?? 5,
      })
      .returning();
    return row;
  },

  /**
   * Resolve a variant's owning product and distributorship, for the Phase 2b
   * membership check in importVariant() - a distributor may only import a
   * variant into their own inventory if they hold active membership in the
   * distributorship the variant's product belongs to.
   */
  async findVariantProductInfo(variantId) {
    const [row] = await db
      .select({
        variantId: productVariants.id,
        productId: products.id,
        distributorshipId: products.distributorshipId,
        createdByDistributorId: products.createdByDistributorId,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(eq(productVariants.id, variantId));
    return row || null;
  },

  async listForDistributor(distributorId) {
    // join to get variant + product info (for listing)
    const rows = await db
      .select({
        inv: distributorInventory,
        variant: productVariants,
        product: products,
        distributorship: distributorships,
      })
      .from(distributorInventory)
      .leftJoin(
        productVariants,
        eq(distributorInventory.variantId, productVariants.id),
      )
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(distributorships, eq(products.distributorshipId, distributorships.id))
      .where(eq(distributorInventory.distributorId, distributorId));

    return rows.map(r => ({
      ...r.inv,
      variant: r.variant,
      product: r.product,
      distributorship: r.distributorship, // { id, name }
    }));
  },

  async findDistributorByUserId(userId) {
    const [d] = await db
      .select()
      .from(distributors)
      .where(eq(distributors.userId, userId));
    return d || null;
  },
};
