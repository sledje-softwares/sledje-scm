// src/modules/sync/sync.service.js
//
// POST /sync - the one endpoint an offline till talks to.
//
// docs/16-offline-first.md.
//
// THE CONTRACT
// ------------
//   request   { deviceId, deviceCode, deviceLabel?, ops: [...], cursor? }
//   response  { results[], failed|null, cursor, changed{}, device{} }
//
// Each op is  { opId, type, at, payload }.
//
// THE THREE PROPERTIES THAT MATTER
// --------------------------------
// 1. EXACTLY ONCE. Every op is claimed against uq_sync_op(device_id, op_id)
//    inside the same transaction as its effects. A replayed batch is
//    acknowledged, not reapplied. This is the single most important property
//    in the whole design: a till that loses the response to a batch of eleven
//    sales WILL resend it, and the shop must not be billed twice.
//
// 2. IN ORDER, ONE TRANSACTION EACH. Ops arrive in the order the counter
//    produced them and are applied that way. Each gets its own transaction, so
//    one bad op does not roll back the nine good ones ahead of it.
//
// 3. STOP AT THE FIRST FAILURE. The response names the failing opId and the
//    device does NOT advance past it. Skipping a failed op would silently drop
//    a sale; worse, a later op may depend on it (a void of a sale that never
//    landed). The queue is a queue.
//
// WHAT THIS ENDPOINT DOES NOT DO
// ------------------------------
// It does not resolve stock conflicts. Two devices that both sell the last
// unit both get their sale: on-hand goes negative and the shop is prompted to
// reconcile. Refusing a sale that physically happened - the customer has the
// goods and has paid - is worse than a negative number on a screen.

import { db } from "../../config/postgres.js";
import SyncRepo from "./sync.repository.js";
import SalesRepo from "../sales/sales.repository.js";
import SalesService, { OP_APPLIERS } from "../sales/sales.service.js";
import { deviceCodeFromId } from "../sales/bill-number.js";

const MAX_OPS_PER_BATCH = 500;

/** What a device is allowed to send back to us as a result of an op. */
function summarise(type, applied) {
  switch (type) {
    case "sale.create":
      return {
        saleId: applied.sale.id,
        // The number the server actually assigned. Normally the one the device
        // chose; occasionally a disambiguated one, which the device adopts.
        billNumber: applied.sale.billNumber,
        total: applied.sale.total,
        syncedAt: applied.sale.syncedAt,
        unattributedUnits: applied.unattributedUnits,
      };
    case "sale.void":
      return { saleId: applied.sale.id, status: applied.sale.status };
    case "price.set":
      return { variantId: applied.price?.variantId, price: applied.price?.price };
    default:
      return {};
  }
}

const SyncService = {
  /**
   * Apply one batch of device operations.
   *
   * Returns a per-op verdict, the failing op if there was one, a fresh cursor,
   * and everything that changed server-side since the device's old cursor.
   */
  async sync(user, body = {}) {
    const retailer = await SalesService.requireRetailer(user);

    const { deviceId, deviceLabel, ops = [], cursor } = body;
    if (!deviceId) throw new Error("deviceId is required");
    if (!Array.isArray(ops)) throw new Error("ops must be an array");
    if (ops.length > MAX_OPS_PER_BATCH) {
      throw new Error(`Too many ops in one batch (max ${MAX_OPS_PER_BATCH})`);
    }

    const { device, codeConflict } = await SyncRepo.registerDevice({
      id: deviceId,
      retailerId: retailer.id,
      deviceCode: body.deviceCode || deviceCodeFromId(deviceId),
      label: deviceLabel,
    });

    const since = cursor ? new Date(cursor) : null;
    const results = [];
    let failed = null;

    for (const op of ops) {
      if (!op?.opId || !op?.type) {
        failed = {
          opId: op?.opId || null,
          code: "MALFORMED_OP",
          message: "Every op needs an opId and a type",
        };
        break;
      }

      const applier = OP_APPLIERS[op.type];
      if (!applier) {
        failed = {
          opId: op.opId,
          code: "UNKNOWN_OP_TYPE",
          message: `No applier for op type "${op.type}"`,
        };
        break;
      }

      try {
        // One transaction per op: the claim and the effects commit or roll
        // back together, and a failure here leaves the ops before it applied.
        const outcome = await db.transaction(async (tx) => {
          const claim = await SyncRepo.claimOp(tx, {
            deviceId,
            opId: op.opId,
            retailerId: retailer.id,
            type: op.type,
            opAt: op.at,
          });

          // Lost the race to claim => we have applied this op before. Ack it;
          // do NOT run it again.
          if (!claim) return { status: "duplicate" };

          const applied = await applier(tx, {
            retailer,
            payload: op.payload || {},
            deviceId,
          });

          const data = summarise(op.type, applied);
          await SyncRepo.recordResult(tx, claim.id, data);
          return { status: "applied", data };
        });

        if (outcome.status === "duplicate") {
          // Answer the replay with what the FIRST application returned, so a
          // device that never saw the original response still learns the bill
          // number the server assigned.
          const prior = await SyncRepo.findResult(deviceId, op.opId);
          results.push({ opId: op.opId, status: "duplicate", data: prior?.result || {} });
        } else {
          results.push({ opId: op.opId, status: "applied", data: outcome.data });
        }
      } catch (err) {
        // Stop here. The device retries from this op, and everything after it
        // stays queued in order.
        failed = {
          opId: op.opId,
          code: err.code || "OP_FAILED",
          message: err.message || "Operation failed",
        };
        break;
      }
    }

    // The new cursor is taken BEFORE reading the changed rows, so anything
    // written while we were reading is picked up by the next pull rather than
    // falling into the gap between the two.
    const nextCursor = new Date();
    const changed = {
      sellable: (await SalesRepo.listSellableChangedSince(retailer.id, since)).map((r) => ({
        ...r,
        price: Number(r.retailPrice ?? r.mrp ?? 0),
        priceIsCustom: r.retailPrice != null,
      })),
      sales: await SalesRepo.listSalesChangedSince(retailer.id, since),
    };

    await SyncRepo.updateCursor(deviceId, nextCursor);

    return {
      device: {
        id: device.id,
        deviceCode: device.deviceCode,
        // True when another device of this shop already had our prefix. The
        // device adopts the returned deviceCode for FUTURE bills; bills
        // already queued keep the numbers they were written with.
        codeConflict,
      },
      results,
      failed,
      cursor: nextCursor.toISOString(),
      changed,
    };
  },
};

export default SyncService;
