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
    // Build the patch from only the keys actually present in `data`, rather
    // than relying on drizzle-orm's internal `mapUpdateSet` to drop
    // undefined-valued keys before it builds SQL (it currently does, but
    // that's an implementation detail we shouldn't depend on across a
    // version bump). A caller that passes a partial update must only ever
    // touch the columns it actually intends to change.
    const patch = Object.fromEntries(
      Object.entries({
        businessName: data.businessName,
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

    // update retailers table
    const updated = await db
      .update(retailers)
      .set(patch)
      .where(eq(retailers.userId, userId))
      .returning();

    return updated[0];
  },
};
