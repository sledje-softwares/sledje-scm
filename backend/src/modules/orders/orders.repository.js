import { db } from "../../config/postgres.js";
import {
  orders,
  orderItems,
  productVariants,
  products,
  retailers,
  distributors,
  users,
  outbox,
  distributorInventory,
  deliveries,
  deliveryAgents,
} from "../../db/schema.js";
import { eq, and, inArray, desc } from "drizzle-orm";

/**
 * Repository contains low-level DB operations. Services orchestrate transactions and business rules.
 */

export default {
  async createOrderRow(tx, orderPayload) {
    // tx is a transaction object from drizzle
    const [row] = await tx.insert(orders).values(orderPayload).returning();
    return row;
  },

  async insertOrderItems(tx, items) {
    if (!items.length) return [];
    const rows = await tx.insert(orderItems).values(items).returning();
    return rows;
  },

  async findOrderById(orderId) {
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    return row || null;
  },

  async findOrderWithItems(orderId) {
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!o) return null;
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    return { ...o, items };
  },

  async findOrdersByRetailerId(retailerId) {
    const rows = await db.select().from(orders).where(eq(orders.retailerId, retailerId)).orderBy(orders.createdAt, "desc");
    return rows;
  },

  async findOrdersByDistributorId(distributorId) {
    const rows = await db.select().from(orders).where(eq(orders.distributorId, distributorId)).orderBy(orders.createdAt, "desc");
    return rows;
  },

  async updateOrder(txOrDb, orderId, patch) {
    // txOrDb can be tx or db
    const [row] = await txOrDb.update(orders).set(patch).where(eq(orders.id, orderId)).returning();
    return row;
  },

  async updateOrderItem(txOrDb, itemId, patch) {
    const [row] = await txOrDb.update(orderItems).set(patch).where(eq(orderItems.id, itemId)).returning();
    return row;
  },

  async deleteOrderItemsByOrderId(txOrDb, orderId) {
    await txOrDb.delete(orderItems).where(eq(orderItems.orderId, orderId));
  },

  async insertOutbox(tx, eventType, payload) {
    await tx.insert(outbox).values({
      eventType,
      payload
    });
  },

  // helper lookups
  async findRetailerByUserId(userId) {
    const [r] = await db.select().from(retailers).where(eq(retailers.userId, userId));
    return r || null;
  },

  async findDistributorByUserId(userId) {
    const [d] = await db.select().from(distributors).where(eq(distributors.userId, userId));
    return d || null;
  },

  async getOrderItems(orderId) {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  },

  /**
   * Orders for one party, with the counterparty, item names/stock and the
   * delivery (agent, status) stitched in - everything the orders screens need
   * that a bare `orders` row does not carry.
   */
  async listOrdersEnriched({ distributorId, retailerId }) {
    const scope = distributorId
      ? eq(orders.distributorId, distributorId)
      : eq(orders.retailerId, retailerId);

    const orderRows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalAmount: orders.totalAmount,
        notes: orders.notes,
        createdAt: orders.createdAt,
        acceptedAt: orders.acceptedAt,
        dispatchedAt: orders.dispatchedAt,
        deliveredAt: orders.deliveredAt,
        retailerId: orders.retailerId,
        distributorId: orders.distributorId,
        retailerBusinessName: retailers.businessName,
        retailerOwnerName: retailers.ownerName,
        retailerPincode: retailers.pincode,
        retailerAddress: retailers.address,
        distributorCompanyName: distributors.companyName,
        distributorOwnerName: distributors.ownerName,
      })
      .from(orders)
      .leftJoin(retailers, eq(orders.retailerId, retailers.id))
      .leftJoin(distributors, eq(orders.distributorId, distributors.id))
      .where(scope)
      .orderBy(desc(orders.createdAt));

    if (!orderRows.length) return [];
    const orderIds = orderRows.map((o) => o.id);

    // contact details live on users, keyed by profile.userId
    const retailerIds = [...new Set(orderRows.map((o) => o.retailerId).filter(Boolean))];
    const distributorIds = [...new Set(orderRows.map((o) => o.distributorId).filter(Boolean))];
    const [retailerUsers, distributorUsers] = await Promise.all([
      retailerIds.length
        ? db
            .select({ id: retailers.id, phone: users.phone, email: users.email })
            .from(retailers)
            .leftJoin(users, eq(retailers.userId, users.id))
            .where(inArray(retailers.id, retailerIds))
        : [],
      distributorIds.length
        ? db
            .select({ id: distributors.id, phone: users.phone, email: users.email })
            .from(distributors)
            .leftJoin(users, eq(distributors.userId, users.id))
            .where(inArray(distributors.id, distributorIds))
        : [],
    ]);
    const rUser = Object.fromEntries(retailerUsers.map((r) => [r.id, r]));
    const dUser = Object.fromEntries(distributorUsers.map((d) => [d.id, d]));

    const itemRows = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        variantId: orderItems.variantId,
        productName: products.name,
        variantName: productVariants.name,
        sku: productVariants.sku,
        unit: orderItems.unit,
        quantity: orderItems.quantity,
        variantSellingPrice: orderItems.variantSellingPrice,
        stock: distributorInventory.stock,
        outForDelivery: distributorInventory.outForDelivery,
      })
      .from(orderItems)
      .leftJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(
        distributorInventory,
        and(
          eq(distributorInventory.variantId, orderItems.variantId),
          eq(distributorInventory.distributorId, orders.distributorId)
        )
      )
      .where(inArray(orderItems.orderId, orderIds));

    const deliveryRows = await db
      .select({
        id: deliveries.id,
        orderId: deliveries.orderId,
        status: deliveries.status,
        agentId: deliveries.agentId,
        assignedAt: deliveries.assignedAt,
        pickedUpAt: deliveries.pickedUpAt,
        deliveredAt: deliveries.deliveredAt,
        failureReason: deliveries.failureReason,
        agentName: deliveryAgents.name,
        agentPhone: deliveryAgents.phone,
        agentVehicle: deliveryAgents.vehicleNumber,
      })
      .from(deliveries)
      .leftJoin(deliveryAgents, eq(deliveries.agentId, deliveryAgents.id))
      .where(inArray(deliveries.orderId, orderIds));

    const itemsByOrder = {};
    for (const it of itemRows) {
      (itemsByOrder[it.orderId] ||= []).push({
        ...it,
        lineTotal: Number(it.variantSellingPrice || 0) * Number(it.quantity || 0),
      });
    }
    const deliveryByOrder = Object.fromEntries(deliveryRows.map((d) => [d.orderId, d]));

    return orderRows.map((o) => {
      const items = itemsByOrder[o.id] || [];
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: Number(o.totalAmount || 0),
        notes: o.notes,
        createdAt: o.createdAt,
        acceptedAt: o.acceptedAt,
        dispatchedAt: o.dispatchedAt,
        deliveredAt: o.deliveredAt,
        itemCount: items.length,
        retailer: {
          id: o.retailerId,
          businessName: o.retailerBusinessName,
          ownerName: o.retailerOwnerName,
          pincode: o.retailerPincode,
          address: o.retailerAddress,
          phone: rUser[o.retailerId]?.phone || null,
          email: rUser[o.retailerId]?.email || null,
        },
        distributor: {
          id: o.distributorId,
          companyName: o.distributorCompanyName,
          ownerName: o.distributorOwnerName,
          phone: dUser[o.distributorId]?.phone || null,
          email: dUser[o.distributorId]?.email || null,
        },
        items,
        delivery: deliveryByOrder[o.id] || null,
      };
    });
  },
};
