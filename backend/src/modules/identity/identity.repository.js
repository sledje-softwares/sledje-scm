import { db } from "../../config/postgres.js";
import { retailers, distributors } from "../../db/schema.js";
import { eq } from "drizzle-orm";

// Moved here verbatim from orders.repository.js (see docs/10-known-issues.md /
// the Phase 1 remediation plan) - orders.repository.js is a de-facto shared
// identity utility today, called from 5+ other modules purely for these two
// lookups. orders.repository.js keeps its own copies for now so the existing
// 37 call sites don't need a big-bang migration; that cleanup is a later
// phase. New code should import from here.

export default {
  async findRetailerByUserId(userId) {
    const [r] = await db.select().from(retailers).where(eq(retailers.userId, userId));
    return r || null;
  },

  async findDistributorByUserId(userId) {
    const [d] = await db.select().from(distributors).where(eq(distributors.userId, userId));
    return d || null;
  },
};
