import { db } from "../../config/postgres.js";
import { retailers, users } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export default {
  async findByUserId(userId) {
    const result = await db
      .select()
      .from(retailers)
      .leftJoin(users, eq(users.id, retailers.userId))
      .where(eq(retailers.userId, userId));

    return result[0] || null;
  },

  async updateProfile(userId, data) {
    // update retailers table
    const updated = await db
      .update(retailers)
      .set({
        businessName: data.businessName,
        ownerName: data.ownerName,
        gstNumber: data.gstNumber,
        businessType: data.businessType,
        pincode: data.pincode,
        location: data.location,
        address: data.address,
        profilePictureUrl: data.profilePictureUrl,
      })
      .where(eq(retailers.userId, userId))
      .returning();

    return updated[0];
  },
};
