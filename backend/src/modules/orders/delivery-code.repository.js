// src/modules/orders/delivery-code.repository.js
import { db } from "../../config/postgres.js";
import { orderDeliveryCodes } from "../../db/schema.js";
import { eq } from "drizzle-orm";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export default {
  async create(tx, orderId, { codeEnc, codeIv, codeTag }) {
    await tx.insert(orderDeliveryCodes).values({ orderId, codeEnc, codeIv, codeTag });
  },

  async get(orderId) {
    const [row] = await db
      .select()
      .from(orderDeliveryCodes)
      .where(eq(orderDeliveryCodes.orderId, orderId));
    return row || null;
  },

  async recordFailedAttempt(orderId, currentAttempts) {
    const attempts = currentAttempts + 1;
    const patch = { attempts };
    if (attempts >= MAX_ATTEMPTS) {
      patch.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
    }
    await db.update(orderDeliveryCodes).set(patch).where(eq(orderDeliveryCodes.orderId, orderId));
    return patch;
  },

  async markConsumed(tx, orderId) {
    await tx
      .update(orderDeliveryCodes)
      .set({ consumedAt: new Date() })
      .where(eq(orderDeliveryCodes.orderId, orderId));
  },
};
