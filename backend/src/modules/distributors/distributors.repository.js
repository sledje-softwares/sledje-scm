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
    // Build the patch from only the keys actually present in `data`, rather
    // than relying on drizzle-orm's internal `mapUpdateSet` to drop
    // undefined-valued keys before it builds SQL (it currently does, but
    // that's an implementation detail we shouldn't depend on across a
    // version bump). A caller that passes only `profilePictureUrl` (e.g.
    // the profile-picture upload route) must only ever touch that column.
    const patch = Object.fromEntries(
      Object.entries({
        companyName: data.companyName,
        ownerName: data.ownerName,
        gstNumber: data.gstNumber,
        businessType: data.businessType,
        pincode: data.pincode,
        location: data.location,
        address: data.address,
        profilePictureUrl: data.profilePictureUrl,
      }).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(patch).length === 0) {
      throw new Error("updateProfile: no fields to update");
    }

    const updated = await db
      .update(distributors)
      .set(patch)
      .where(eq(distributors.userId, userId))
      .returning();

    return updated[0];
  },
};
