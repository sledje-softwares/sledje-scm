// src/offline/sync.js
//
// The flush loop: push the outbox, pull what changed.
//
// docs/16-offline-first.md.
//
// WHEN THIS RUNS
// --------------
//   * immediately after a sale is rung up
//   * on the `online` event
//   * when the app regains focus / visibility
//   * on a 60-second timer
//   * when the service worker's Background Sync fires (Chromium only)
//
// The Background Sync API is the nice-to-have, not the mechanism. Safari has
// never shipped it and Firefox has not either, which between them is most of
// the phones that will ever run this. The timer + online + focus triad IS the
// real path, and Background Sync is an optimisation layered on top. Building
// it the other way round produces something that works on the developer's
// laptop and loses sales on a shopkeeper's iPhone.

import API from "../api.js";
import { db, getMeta, setMeta } from "./db.js";
import { getDevice, adoptDeviceCode } from "./device.js";

const MAX_OPS_PER_BATCH = 200;
const TIMER_MS = 60_000;

let inFlight = null;
let timer = null;
const listeners = new Set();

/** Subscribe to sync status changes (for the UI's connection strip). */
export function onSyncChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* a bad listener must not stop sync */ } });

/**
 * Ops the server has not answered for, in the order the counter produced them.
 *
 * "Pending" is derived - an outbox row with no ack - rather than a flag on the
 * op. The outbox is append-only; see db.js.
 */
async function pendingOps(limit = MAX_OPS_PER_BATCH) {
  const rows = await db.outbox.orderBy("seq").limit(limit * 2).toArray();
  if (!rows.length) return [];

  const acked = new Set(
    (await db.acks.where("opId").anyOf(rows.map((r) => r.opId)).toArray()).map((a) => a.opId)
  );

  return rows.filter((r) => !acked.has(r.opId)).slice(0, limit);
}

/** Fold the server's answer for one op back into local state. */
async function applyResult(op, result) {
  await db.acks.put({ opId: op.opId, status: result.status, at: Date.now(), data: result.data });

  if (op.type === "sale.create") {
    const saleId = op.payload.saleId;
    const patch = { syncState: "synced" };
    // The only thing the server is allowed to change about a sale we already
    // wrote: the bill number, if ours collided with another device's.
    if (result.data?.billNumber && result.data.billNumber !== op.payload.billNumber) {
      patch.billNumber = result.data.billNumber;
      patch.billNumberReassigned = true;
    }
    if (result.data?.unattributedUnits > 0) {
      // Sold more than the server had stock for - typically another till got
      // there first. The sale stands; the shop is told to reconcile.
      patch.needsReconciliation = result.data.unattributedUnits;
    }
    await db.sales.update(saleId, patch);
  }

  if (op.type === "sale.void") {
    await db.sales.update(op.payload.saleId, { syncState: "synced", status: "voided" });
  }
}

/** Merge the server's changed shelf rows into the local cache. */
async function mergeChanges(changed) {
  const rows = changed?.sellable || [];
  if (!rows.length) return;

  await db.shelf.bulkPut(
    rows.map((r) => ({
      variantId: r.variantId,
      variantName: r.variantName,
      productName: r.productName,
      sku: r.sku,
      unit: r.unit,
      category: r.category,
      imageUrl: r.imageUrl,
      gstRate: r.gstRate,
      mrp: r.mrp,
      retailPrice: r.retailPrice,
      price: Number(r.price ?? r.retailPrice ?? r.mrp ?? 0),
      priceIsCustom: Boolean(r.priceIsCustom),
      // The server's last word on stock. NEVER what the POS displays - see
      // pos.js:shelfWithPending, which subtracts everything still queued.
      qty: Number(r.qty || 0),
      lastUpdated: r.lastUpdated || new Date().toISOString(),
    }))
  );
}

/**
 * One push/pull round trip.
 *
 * Single-flight: concurrent callers (a sale, the timer and a focus event can
 * easily coincide) share the one in-flight promise rather than sending the
 * same ops twice. Sending them twice would be SAFE - that is what the
 * idempotency guard is for - but it would be wasteful on exactly the
 * connection that can least afford it.
 */
export async function flush() {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { skipped: "offline" };
    }
    if (!localStorage.getItem("token")) return { skipped: "not-logged-in" };

    const device = await getDevice();
    const ops = await pendingOps();
    const cursor = await getMeta("cursor", null);

    let res;
    try {
      res = await API.post("/sync", {
        deviceId: device.id,
        deviceCode: device.code,
        deviceLabel: device.label,
        cursor,
        ops: ops.map(({ opId, type, at, payload }) => ({ opId, type, at, payload })),
      });
    } catch (err) {
      // A transport failure changes nothing locally. The ops are still queued,
      // still in order, and the next trigger will try again. This is the
      // normal case at a kirana counter, not an exception.
      await setMeta("lastError", {
        kind: "transport",
        message: err?.response?.data?.error || err.message || "Network error",
        at: Date.now(),
      });
      emit();
      return { error: "transport" };
    }

    const data = res.data;

    if (data.device?.codeConflict && data.device.deviceCode) {
      await adoptDeviceCode(data.device.deviceCode);
    }

    const byId = new Map(ops.map((o) => [o.opId, o]));
    for (const result of data.results || []) {
      const op = byId.get(result.opId);
      if (op) await applyResult(op, result);
    }

    await mergeChanges(data.changed);
    await setMeta("cursor", data.cursor);
    await setMeta("lastSync", Date.now());

    if (data.failed) {
      // The server stopped here. We do NOT skip past it: the failing op stays
      // at the head of the queue and everything behind it stays behind it.
      // Skipping would silently drop a sale, and a later op may depend on this
      // one (a void of a sale that never landed).
      await setMeta("lastError", {
        kind: "op",
        opId: data.failed.opId,
        code: data.failed.code,
        message: data.failed.message,
        at: Date.now(),
      });
    } else {
      await setMeta("lastError", null);
    }

    emit();
    return {
      applied: (data.results || []).filter((r) => r.status === "applied").length,
      duplicate: (data.results || []).filter((r) => r.status === "duplicate").length,
      failed: data.failed || null,
    };
  })().finally(() => { inFlight = null; });

  return inFlight;
}

/** Ask the service worker to wake us next time the browser has a connection. */
async function requestBackgroundSync() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.sync) return false; // Safari, Firefox - the fallback below carries it
    await reg.sync.register("sledje-flush");
    return true;
  } catch {
    return false;
  }
}

/** Flush now, and ask to be woken if we could not. */
export async function flushSoon() {
  const result = await flush();
  if (result?.skipped === "offline" || result?.error) await requestBackgroundSync();
  return result;
}

let started = false;

/**
 * Wire up every trigger. Idempotent, so calling it from more than one mounted
 * component is harmless.
 */
export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;

  const onOnline = () => { emit(); flush(); };
  const onOffline = () => emit();
  const onVisible = () => { if (document.visibilityState === "visible") flush(); };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("focus", flush);
  document.addEventListener("visibilitychange", onVisible);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "sledje-flush") flush();
    });
  }

  timer = setInterval(flush, TIMER_MS);
  flush();
}

export function stopSync() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
