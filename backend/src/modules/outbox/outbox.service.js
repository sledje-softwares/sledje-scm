import { db } from "../../config/postgres.js";
import { outbox } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

export default {
  async getPending(limit = 50) {
    return db
      .select()
      .from(outbox)
      .where(eq(outbox.published, false))
      .orderBy(outbox.createdAt)
      .limit(limit);
  },

  async markPublished(id) {
    await db
      .update(outbox)
      .set({ published: true })
      .where(eq(outbox.id, id));
  },

  async markFailed(id, errorMessage) {
    await db
      .update(outbox)
      .set({ error: errorMessage })
      .where(eq(outbox.id, id));
  }
};
