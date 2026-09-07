// src/modules/deliveries/deliveries.repository.js
import { db } from "../../config/postgres.js";
import { deliveries, deliveryAgents, orders, retailers, users } from "../../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";

const DeliveriesRepo = {
  async createForOrder(tx, orderId) {
    const [row] = await tx
      .insert(deliveries)
      .values({ orderId, status: "pending_assignment" })
      .returning();
    return row;
  },

  async findById(deliveryId) {
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    return row || null;
  },

  async findByOrderId(orderId) {
    const [row] = await db.select().from(deliveries).where(eq(deliveries.orderId, orderId));
    return row || null;
  },

  async update(txOrDb, deliveryId, patch) {
    const [row] = await txOrDb
      .update(deliveries)
      .set(patch)
      .where(eq(deliveries.id, deliveryId))
      .returning();
    return row;
  },

  /** Runs assigned to one agent, with enough order/retailer context to deliver. */
  async listForAgent(agentId, statuses) {
    const conditions = [eq(deliveries.agentId, agentId)];
    if (statuses?.length) conditions.push(inArray(deliveries.status, statuses));

    return db
      .select({
        id: deliveries.id,
        status: deliveries.status,
        assignedAt: deliveries.assignedAt,
        pickedUpAt: deliveries.pickedUpAt,
        deliveredAt: deliveries.deliveredAt,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
        totalAmount: orders.totalAmount,
        retailerBusinessName: retailers.businessName,
        retailerAddress: retailers.address,
        retailerPincode: retailers.pincode,
        retailerPhone: users.phone,
      })
      .from(deliveries)
      .innerJoin(orders, eq(deliveries.orderId, orders.id))
      .innerJoin(retailers, eq(orders.retailerId, retailers.id))
      .leftJoin(users, eq(retailers.userId, users.id))
      .where(and(...conditions))
      .orderBy(deliveries.assignedAt);
  },

  /** Unassigned runs for a distributor, so they can pick an agent. */
  async listPendingForDistributor(distributorId) {
    return db
      .select({
        id: deliveries.id,
        status: deliveries.status,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        retailerBusinessName: retailers.businessName,
        retailerPincode: retailers.pincode,
        agentId: deliveries.agentId,
      })
      .from(deliveries)
      .innerJoin(orders, eq(deliveries.orderId, orders.id))
      .innerJoin(retailers, eq(orders.retailerId, retailers.id))
      .where(eq(orders.distributorId, distributorId))
      .orderBy(deliveries.createdAt);
  },

  async findAgentByUserId(userId) {
    const [row] = await db
      .select()
      .from(deliveryAgents)
      .where(eq(deliveryAgents.userId, userId));
    return row || null;
  },
};

export default DeliveriesRepo;
