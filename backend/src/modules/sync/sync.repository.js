// src/modules/sync/sync.repository.js
import { db } from "../../config/postgres.js";
import { syncDevices, syncOps } from "../../db/schema.js";
import { and, eq } from "drizzle-orm";

const SyncRepo = {
  /**
   * Register a device, or note that we have seen it again.
   *
   * The device chose its own id and its own bill-number prefix while possibly
   * having never spoken to us. All this does is record the choice - and
   * surface the one case the device cannot detect alone: another device of the
   * same shop already using that prefix (uq_sync_device_code).
   */
  async registerDevice({ id, retailerId, deviceCode, label }) {
    const [existing] = await db.select().from(syncDevices).where(eq(syncDevices.id, id));

    if (existing) {
      if (existing.retailerId !== retailerId) {
        // A device id belongs to one shop. Reusing it across accounts would
        // let one shop's ops land in another's books.
        const err = new Error("This device is registered to a different retailer");
        err.code = "DEVICE_OWNED_ELSEWHERE";
        throw err;
      }
      await db
        .update(syncDevices)
        .set({ lastSeenAt: new Date(), label: label ?? existing.label })
        .where(eq(syncDevices.id, id));
      return { device: existing, codeConflict: false };
    }

    const [conflict] = await db
      .select()
      .from(syncDevices)
      .where(
        and(eq(syncDevices.retailerId, retailerId), eq(syncDevices.deviceCode, deviceCode))
      );

    const [row] = await db
      .insert(syncDevices)
      .values({
        id,
        retailerId,
        // On a prefix collision the device is registered under a code derived
        // from its own id instead, and told to rotate. Its ALREADY-QUEUED ops
        // keep the bill numbers they were written with - those are append-only
        // - and the server disambiguates any that actually clash.
        deviceCode: conflict ? `${deviceCode}${id.slice(-2)}` : deviceCode,
        label: label || null,
      })
      .returning();

    return { device: row, codeConflict: Boolean(conflict) };
  },

  async updateCursor(deviceId, cursor) {
    await db
      .update(syncDevices)
      .set({ lastCursor: cursor, lastSeenAt: new Date() })
      .where(eq(syncDevices.id, deviceId));
  },

  /**
   * Claim an op id, inside the caller's transaction.
   *
   * THIS IS THE IDEMPOTENCY MECHANISM. `onConflictDoNothing` against
   * uq_sync_op(device_id, op_id) returns nothing when the op has been seen
   * before, and the caller then acknowledges it WITHOUT reapplying it.
   *
   * Two properties make it hold:
   *
   *   * It runs in the same transaction as the effects. If applying the op
   *     fails, the claim rolls back with it, so a retry genuinely retries.
   *   * It is a database constraint, so it survives a restart, a second
   *     process, and a deploy. An in-memory dedupe cache survives none of
   *     those, and "we redeployed, so the shop's sales were counted twice" is
   *     not a recoverable class of bug.
   */
  async claimOp(tx, { deviceId, opId, retailerId, type, opAt }) {
    const rows = await tx
      .insert(syncOps)
      .values({
        deviceId,
        opId,
        retailerId,
        type,
        opAt: opAt ? new Date(opAt) : null,
      })
      .onConflictDoNothing({ target: [syncOps.deviceId, syncOps.opId] })
      .returning();

    return rows[0] || null;
  },

  async recordResult(tx, syncOpRowId, result) {
    await tx
      .update(syncOps)
      .set({ result, appliedAt: new Date() })
      .where(eq(syncOps.id, syncOpRowId));
  },

  /**
   * What the first application of this op returned.
   *
   * A replay is answered from here rather than being reapplied, so a device
   * that never saw the original response still learns the outcome - notably
   * the bill number, which the server may have had to disambiguate.
   */
  async findResult(deviceId, opId) {
    const [row] = await db
      .select()
      .from(syncOps)
      .where(and(eq(syncOps.deviceId, deviceId), eq(syncOps.opId, opId)));
    return row || null;
  },
};

export default SyncRepo;
