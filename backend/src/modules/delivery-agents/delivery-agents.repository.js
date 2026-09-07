// src/modules/delivery-agents/delivery-agents.repository.js
import { db } from "../../config/postgres.js";
import { deliveryAgents, users } from "../../db/schema.js";
import { eq, and, ilike } from "drizzle-orm";

const AgentsRepo = {
  async create(tx, { userId, name, phone, vehicleNumber, operatingPincode }) {
    const [row] = await tx
      .insert(deliveryAgents)
      .values({ userId, name, phone, vehicleNumber, operatingPincode })
      .returning();
    return row;
  },

  async findById(agentId) {
    const [row] = await db.select().from(deliveryAgents).where(eq(deliveryAgents.id, agentId));
    return row || null;
  },

  async findByUserId(userId) {
    const [row] = await db
      .select()
      .from(deliveryAgents)
      .where(eq(deliveryAgents.userId, userId));
    return row || null;
  },

  async updateByUserId(userId, patch) {
    const [row] = await db
      .update(deliveryAgents)
      .set(patch)
      .where(eq(deliveryAgents.userId, userId))
      .returning();
    return row;
  },

  /**
   * Available agents a distributor can assign. Platform-level pool: any
   * distributor may assign any available agent. Pincode is a filter, not a
   * restriction - agents routinely cover neighbouring areas.
   */
  async listAvailable({ pincode } = {}) {
    const conditions = [
      eq(deliveryAgents.active, true),
      eq(deliveryAgents.isAvailable, true),
    ];
    if (pincode) conditions.push(ilike(deliveryAgents.operatingPincode, `%${pincode}%`));

    return db
      .select({
        id: deliveryAgents.id,
        name: deliveryAgents.name,
        phone: deliveryAgents.phone,
        vehicleNumber: deliveryAgents.vehicleNumber,
        operatingPincode: deliveryAgents.operatingPincode,
        email: users.email,
      })
      .from(deliveryAgents)
      .leftJoin(users, eq(deliveryAgents.userId, users.id))
      .where(and(...conditions))
      .orderBy(deliveryAgents.name);
  },
};

export default AgentsRepo;
