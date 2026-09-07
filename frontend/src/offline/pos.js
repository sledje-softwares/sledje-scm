// src/offline/pos.js
//
// The POS's local data layer. The counter writes here FIRST, always; the
// network is a background chore that happens afterwards.
//
// docs/16-offline-first.md.

import { ulid } from "ulid";
import { db, getMeta } from "./db.js";
import { getDevice, nextBillNumber } from "./device.js";

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Ring up a sale, entirely locally, in ONE transaction.
 *
 * The sale, its lines, its payments and the outbox op either all exist or none
 * of them do. A sale whose op did not get queued is a sale that will never
 * reach the server, and there would be nothing left to notice it by.
 *
 * Returns immediately with a bill number the shopkeeper can read out. No
 * network is involved, and none is waited for.
 */
export async function recordSale({ items, payments, customer, discount = 0 }) {
  const device = await getDevice();

  const priced = items.map((it) => ({
    itemId: ulid(),
    variantId: it.variantId,
    quantity: Number(it.quantity),
    unitPrice: round2(it.unitPrice),
    // The price CACHED ON THIS DEVICE at the moment of sale is what the
    // customer paid, and it is authoritative for this sale even if the shop
    // changes the price before this reaches the server (docs/16).
    taxRate: Number(it.taxRate || 0),
    amount: round2(Number(it.quantity) * round2(it.unitPrice)),
  }));

  const subtotal = round2(priced.reduce((s, i) => s + i.amount, 0));
  const total = round2(subtotal - round2(discount));
  const paidRows = payments
    .filter((p) => Number(p.amount) > 0)
    .map((p) => ({ paymentId: ulid(), method: p.method || "cash", amount: round2(p.amount) }));

  const saleId = ulid();
  const soldAt = new Date().toISOString();

  return db.transaction("rw", db.sales, db.saleItems, db.salePayments, db.outbox, db.meta, async () => {
    const billNumber = await nextBillNumber(device.code);

    const payload = {
      saleId,
      billNumber,
      soldAt,
      discount: round2(discount),
      customer: customer?.name || customer?.phone ? customer : undefined,
      items: priced,
      payments: paidRows,
    };

    await db.sales.add({
      id: saleId,
      billNumber,
      soldAt,
      subtotal,
      discount: round2(discount),
      total,
      status: "completed",
      customerName: customer?.name || null,
      customerPhone: customer?.phone || null,
      deviceId: device.id,
      syncState: "pending",
    });

    await db.saleItems.bulkAdd(priced.map((i) => ({ ...i, id: i.itemId, saleId })));
    await db.salePayments.bulkAdd(paidRows.map((p) => ({ ...p, id: p.paymentId, saleId })));

    // Append-only. This row is never touched again.
    await db.outbox.add({
      opId: ulid(),
      type: "sale.create",
      at: soldAt,
      payload,
    });

    return { saleId, billNumber, total };
  });
}

/**
 * Void a sale. Works offline too, and is a NEW op rather than an edit.
 *
 * A synced sale is immutable (docs/16). Rewriting one destroys a revenue
 * record with nothing left to show it happened.
 */
export async function voidSale(saleId, reason) {
  return db.transaction("rw", db.sales, db.outbox, async () => {
    const sale = await db.sales.get(saleId);
    if (!sale) throw new Error("Sale not found on this device");
    if (sale.status === "voided") return sale;

    await db.sales.update(saleId, { status: "voided", voidReason: reason || null });
    await db.outbox.add({
      opId: ulid(),
      type: "sale.void",
      at: new Date().toISOString(),
      payload: { saleId, reason },
    });
    return { ...sale, status: "voided" };
  });
}

/** Change what this shop charges. Queued like anything else. */
export async function setPrice(variantId, price) {
  return db.transaction("rw", db.shelf, db.outbox, async () => {
    await db.shelf.update(variantId, { retailPrice: String(price), price: Number(price), priceIsCustom: true });
    await db.outbox.add({
      opId: ulid(),
      type: "price.set",
      at: new Date().toISOString(),
      payload: { variantId, price: Number(price) },
    });
  });
}

/**
 * Units sold on this device that the server has not acknowledged yet, per
 * variant.
 *
 * This is what makes a mutable `qty` counter survivable on the client. The
 * cached shelf number is the server's last word; it does not yet know about
 * anything in the outbox. Displaying it raw would show the shopkeeper stock
 * they have already sold, and - worse - a later pull would appear to "restore"
 * it. So on-hand is always computed as (cached server qty - pending outflow):
 * a snapshot plus the deltas the snapshot has not absorbed.
 */
export async function pendingOutflow() {
  const pending = await db.sales.where("syncState").equals("pending").toArray();
  if (!pending.length) return {};

  const ids = new Set(pending.filter((s) => s.status !== "voided").map((s) => s.id));
  if (!ids.size) return {};

  const lines = await db.saleItems.where("saleId").anyOf([...ids]).toArray();
  const out = {};
  for (const line of lines) {
    out[line.variantId] = (out[line.variantId] || 0) + Number(line.quantity);
  }
  return out;
}

/** The shelf as the counter should see it: cache minus what is still queued. */
export async function shelfWithPending() {
  const [rows, outflow] = await Promise.all([db.shelf.toArray(), pendingOutflow()]);
  return rows.map((r) => ({
    ...r,
    serverQty: Number(r.qty || 0),
    qty: Number(r.qty || 0) - (outflow[r.variantId] || 0),
  }));
}

/** Recent sales for the history panel, newest first. */
export async function recentSales(limit = 25) {
  return db.sales.orderBy("soldAt").reverse().limit(limit).toArray();
}

export async function saleDetail(saleId) {
  const [sale, items, payments] = await Promise.all([
    db.sales.get(saleId),
    db.saleItems.where("saleId").equals(saleId).toArray(),
    db.salePayments.where("saleId").equals(saleId).toArray(),
  ]);
  if (!sale) return null;
  return { ...sale, items, payments };
}

/** How many ops are still waiting to be sent. */
export async function pendingOpCount() {
  const [total, acked] = await Promise.all([db.outbox.count(), db.acks.count()]);
  return Math.max(0, total - acked);
}

export const getCursor = () => getMeta("cursor", null);
