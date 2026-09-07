import { db } from "../../config/postgres.js";
import { inventory, productVariants, products, retailers, orders, orderItems } from "../../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

export default {
  async findRetailerIdByUserId(userId) {
    const rows = await db.select().from(retailers).where(eq(retailers.userId, userId));
    return rows[0] || null;
  },

  async getInventoryByRetailer(retailerId) {
    return db
      .select()
      .from(inventory)
      .where(eq(inventory.retailerId, retailerId));
  },

  async findVariantById(variantId) {
    const rows = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    return rows[0] || null;
  },

  async findProduct(productId) {
    const rows = await db.select().from(products).where(eq(products.id, productId));
    return rows[0] || null;
  },

  async findInventoryItem(retailerId, variantId) {
    const rows = await db
      .select()
      .from(inventory)
      .where(
        and(eq(inventory.retailerId, retailerId), eq(inventory.variantId, variantId))
      );
    return rows[0] || null;
  },

  /**
   * Add qty to a retailer's shelf position for one variant, inside a
   * transaction, creating the row on first delivery. Used at delivery
   * confirmation - see orders.service.js applyDeliveryEffects().
   */
  async addToShelf(tx, retailerId, variantId, qty) {
    const [existing] = await tx
      .select()
      .from(inventory)
      .where(and(eq(inventory.retailerId, retailerId), eq(inventory.variantId, variantId)));

    if (existing) {
      const [row] = await tx
        .update(inventory)
        .set({ qty: sql`${inventory.qty} + ${qty}`, lastUpdated: new Date() })
        .where(eq(inventory.id, existing.id))
        .returning();
      return row;
    }

    const [row] = await tx
      .insert(inventory)
      .values({ retailerId, variantId, qty })
      .returning();
    return row;
  },

  /**
   * The `inventory` table holds only the retailer's shelf position:
   * retailerId, variantId, qty, reorderLevel, expiry, dailyAvgSales, lastUpdated.
   * Product/variant descriptors are joined from the catalogue, and price/stock
   * belong to distributor_inventory - migration 0001 removed them from
   * product_variants, so nothing else may be written here.
   */
  async createInventoryItem(retailerId, variant, _product) {
    const [row] = await db.insert(inventory).values({
      retailerId,
      variantId: variant.id,
      qty: 0,
    }).returning();
    return row;
  },

  async updateStock(retailerId, variantId, newQty) {
    const [row] = await db.update(inventory)
      .set({ qty: newQty, lastUpdated: new Date() })
      .where(and(eq(inventory.retailerId, retailerId), eq(inventory.variantId, variantId)))
      .returning();
    return row;
  },

  async getOrder(orderId) {
    const rows = await db.select().from(orders).where(eq(orders.id, orderId));
    return rows[0] || null;
  },

  async getOrderItems(orderId) {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }
};
