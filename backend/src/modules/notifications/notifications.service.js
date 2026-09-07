import { db } from "../../config/postgres.js";
import { notifications } from "../../db/schema.js";
import { eq, and, desc, count } from "drizzle-orm";

export default {
  async getNotifications(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit).offset(offset);
    return { data: rows, page, limit };
  },

  async getUnreadCount(userId) {
    const [row] = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return Number(row?.value ?? 0);
  },

  async markAsRead(userId, id) {
    // NOTE: both predicates are required - filtering on userId alone would mark
    // every one of the user's notifications as read.
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.id, id)));
  },

  async markAllRead(userId) {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  }
};
