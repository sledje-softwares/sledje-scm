// src/offline/db.js
//
// The device's own database. Everything the POS needs to ring up a customer
// lives here, and the network is something that happens to it later.
//
// docs/16-offline-first.md.
//
// THE OUTBOX IS APPEND-ONLY
// -------------------------
// `outbox` rows are written once and never touched again. That is why
// acknowledgements live in a SEPARATE table (`acks`) keyed by opId, rather
// than as a status column on the op: an op you can edit is an op whose replay
// is no longer safe, and replay safety is the whole basis of the sync
// protocol. "Pending" is therefore a derived question - an outbox row with no
// ack - not a flag somebody has to remember to clear.
//
// `sales` / `saleItems` / `salePayments` mirror the server's tables. They are
// a projection for the UI to read, written locally the moment the customer
// pays. The one thing the server is allowed to change about them afterwards is
// the bill number, if it had to disambiguate a collision.

import Dexie from "dexie";

export const db = new Dexie("sledje-pos");

db.version(1).stores({
  // syncState: pending | synced. Indexed so "what have I not sent?" is cheap.
  sales: "id, soldAt, syncState, billNumber",
  saleItems: "id, saleId, variantId",
  salePayments: "id, saleId",

  // The shelf as the server last described it. A CACHE, never a source of
  // truth: what the POS displays is this minus everything sold locally that
  // has not synced yet. See pos.js:shelfWithPending.
  shelf: "variantId, lastUpdated",

  // Append-only. ++seq gives us the counter's own ordering, which is the order
  // ops must be applied in.
  outbox: "++seq, opId, type",

  // One row per op the server has answered for. Written on ack, never before.
  acks: "opId, status, at",

  // deviceId, deviceCode, billCounter, cursor, lastSync, lastError.
  meta: "key",
});

/** Small typed helpers over the meta table, which is just a key/value store. */
export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row === undefined ? fallback : row.value;
}

export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}

/** Clears everything. Used when a different user logs in on the same device. */
export async function resetLocalData() {
  await db.transaction("rw", db.sales, db.saleItems, db.salePayments, db.shelf, db.outbox, db.acks, db.meta, async () => {
    await Promise.all([
      db.sales.clear(), db.saleItems.clear(), db.salePayments.clear(),
      db.shelf.clear(), db.outbox.clear(), db.acks.clear(), db.meta.clear(),
    ]);
  });
}
