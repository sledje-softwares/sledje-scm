import { db } from "../../config/postgres.js";
import { distributors, users, connections, retailers } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

export default {
  async findByUserId(userId) {
    // 1. Fetch Distributor & User details
    const [row] = await db
      .select()
      .from(distributors)
      .leftJoin(users, eq(users.id, distributors.userId))
      .where(eq(distributors.userId, userId));

    if (!row) return null;

    // 2. Fetch Connected Retailers
    const connectedRetailers = await db
      .select({
        id: retailers.id,
        businessName: retailers.businessName,
        phone: users.phone, // Get phone from users table via retailer
        email: users.email,
        ownerName: retailers.ownerName,
      })
      .from(connections)
      .innerJoin(retailers, eq(connections.retailerId, retailers.id))
      .innerJoin(users, eq(retailers.userId, users.id))
      .where(eq(connections.distributorId, row.distributors.id));

    // 3. Flatten & Return
    return {
      ...row.distributors,
      email: row.users.email,
      phone: row.users.phone,
      role: row.users.role,
      retailers: connectedRetailers,
    };
  },

  async updateProfile(userId, data) {
    const updated = await db
      .update(distributors)
      .set({
        companyName: data.companyName,
        ownerName: data.ownerName,
        gstNumber: data.gstNumber,
        businessType: data.businessType,
        pincode: data.pincode,
        location: data.location,
        address: data.address,
        profilePictureUrl: data.profilePictureUrl,
      })
      .where(eq(distributors.userId, userId))
      .returning();

    return updated[0];
  },
};
