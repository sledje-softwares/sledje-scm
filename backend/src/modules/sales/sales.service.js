// src/modules/sales/sales.service.js
//
// The sell side, and the second half of two-stage billing.
//
// A delivery puts stock on the retailer's shelf as consignment the distributor
// is financing. THIS is where it becomes money owed: when the shopkeeper
// actually sells it. That is the whole point of tracking credit per product
// rather than per order - see docs/02-product-billing.md.
//
// SHAPE (docs/16-offline-first.md)
// --------------------------------
// Everything a sale does to the database lives in an *operation applier*:
// applySaleCreate, applySaleVoid, applyPriceSet. Each takes an open
// transaction and a plain payload, and knows nothing about HTTP.
//
// Both entry points run the same appliers:
//
//   POST /sales   ->  one op, applied immediately (an online counter, or any
//                     API client)
//   POST /sync    ->  a batch of ops from a device that has been offline
//
// That is not tidiness for its own sake. If the two paths had separate
// implementations, the offline path would be the one nobody tests, and it is
// the one handling sales made while the shop could not see the server.

import { db } from "../../config/postgres.js";
import { ledger } from "../../db/schema.js";
import { ulid } from "ulid";
import SalesRepo from "./sales.repository.js";
import OrdersRepo from "../orders/orders.repository.js";
import ProductBillsRepo from "../product-bills/product-bills.repository.js";
import RetailerInventoryRepo from "../inventory/inventory.repository.js";
import { publishEvent } from "../../config/nats-streams.js";

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Consume FIFO cost layers for one variant and accrue the cost onto the
 * product bills it came from.
 *
 * Layers are consumed oldest-first across EVERY distributor that supplied this
 * variant, because that is what physically happens on a shelf - the oldest
 * units go out first, regardless of who delivered them.
 *
 * Returns the total cost consumed and the weighted unit cost, so the sale line
 * can be stamped with what those specific units actually cost.
 */
async function consumeLayersForVariant(tx, { retailerId, variantId, qty, saleId }) {
  const layers = await ProductBillsRepo.findOpenLayers(tx, retailerId, variantId);

  let remaining = qty;
  let costConsumed = 0;
  let qtyAttributed = 0;

  // Accrue per product bill, so each distributor is owed for their own units.
  const perBill = new Map();

  for (const layer of layers) {
    if (remaining <= 0) break;

    const available = Number(layer.qtyReceived) - Number(layer.qtyConsumed);
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    const unitCost = Number(layer.unitCost || 0);
    const amount = round2(take * unitCost);

    await ProductBillsRepo.consumeLayer(tx, layer.layerId, take);

    const acc = perBill.get(layer.productBillId) || {
      qty: 0,
      amount: 0,
      unitCost,
      layers: [],
    };
    acc.qty += take;
    acc.amount = round2(acc.amount + amount);
    // Which layer, and how much of it. A void has to give these exact units
    // back to these exact layers; nothing else reconstructs it.
    acc.layers.push({ layerId: layer.layerId, qty: take, unitCost });
    perBill.set(layer.productBillId, acc);

    remaining -= take;
    costConsumed = round2(costConsumed + amount);
    qtyAttributed += take;
  }

  for (const [productBillId, acc] of perBill) {
    await ProductBillsRepo.recordSaleAccrual(tx, {
      productBillId,
      qty: acc.qty,
      amount: acc.amount,
      unitCost: acc.unitCost,
      saleId,
      layers: acc.layers,
    });
  }

  if (remaining > 0) {
    // Stock that predates the system, was added to the shelf by hand, or was
    // already sold by ANOTHER device that has not synced yet, has no cost layer
    // left to attribute it to. Never block a sale that physically happened -
    // the same stance as the offline conflict policy in docs/16. Record it and
    // let the shop reconcile.
    console.warn(
      `[sales] variant ${variantId}: ${remaining} unit(s) sold with no cost layer to attribute them to. ` +
      `Nothing accrued for those units.`
    );
  }

  return {
    costConsumed,
    qtyAttributed,
    unattributed: remaining,
    weightedUnitCost: qtyAttributed > 0 ? round2(costConsumed / qtyAttributed) : 0,
    billAccruals: [...perBill.entries()].map(([productBillId, a]) => ({ productBillId, ...a })),
  };
}

/**
 * Price and total a basket, and reject it before anything is written.
 *
 * A per-line unitPrice sent by the caller ALWAYS wins over the server's
 * current price. Online that is just how a counter works - discounts get
 * given. Offline it is the conflict rule from docs/16-offline-first.md: the
 * price the device had cached at the time of sale is authoritative for that
 * sale, because it is what the customer actually paid. A price the shop
 * changed on another device two hours later does not get to rewrite a receipt
 * already in someone's hand; it applies to the next sale.
 *
 * The server's price is a fallback, not an override. Money is recomputed here
 * either way - the client's arithmetic is never trusted, only its prices.
 */
async function priceBasket(retailerId, items) {
  const variantIds = items.map((i) => i.variantId);
  const priceMap = await SalesRepo.resolvePrices(retailerId, variantIds);

  return items.map((it) => {
    const info = priceMap[it.variantId];
    if (!info) throw new Error(`Unknown variant: ${it.variantId}`);

    const qty = Number(it.quantity || 0);
    if (qty <= 0) throw new Error("Quantity must be greater than zero");

    const unitPrice = round2(it.unitPrice ?? info.retailPrice ?? info.mrp ?? 0);

    return {
      itemId: it.itemId || ulid(),
      variantId: it.variantId,
      quantity: qty,
      unitPrice,
      taxRate: Number(it.taxRate ?? info.gstRate ?? 0),
      amount: round2(qty * unitPrice),
    };
  });
}

/* ===========================================================================
   OPERATION APPLIERS
   Each runs inside a caller-supplied transaction and is a pure function of its
   payload. No HTTP, no auth, no knowledge of whether it arrived live or six
   hours late.
   =========================================================================== */

/**
 * sale.create - ring up a sale.
 *
 * Shelf down, FIFO layers consumed, product bills moved from consignment into
 * money due, ledger debited, sale recorded. One transaction.
 *
 * The sale id is supplied by the caller and is a ULID minted on the device.
 * That makes this applier naturally idempotent at a second level: even if the
 * sync_ops guard were somehow bypassed, sales.id is a primary key and the
 * duplicate insert fails rather than double-counting.
 */
export async function applySaleCreate(tx, { retailer, payload, deviceId = null }) {
  const items = payload.items || [];
  if (!items.length) throw new Error("No items provided");

  const payments = payload.payments || [];
  if (!payments.length) throw new Error("Payment is required to complete a sale");

  const saleId = payload.saleId || ulid();
  const priced = await priceBasket(retailer.id, items);

  const subtotal = round2(priced.reduce((s, i) => s + i.amount, 0));
  const discount = round2(payload.discount || 0);
  const total = round2(subtotal - discount);

  const paid = round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
  if (paid + 1e-6 < total) {
    throw new Error(`Payment of ${paid} does not cover the total of ${total}`);
  }

  const customer = payload.customer
    ? await SalesRepo.findOrCreateCustomer(tx, retailer.id, payload.customer)
    : null;

  // The device allocated this; the server only steps in if it is already
  // taken. See sales.repository.js:claimBillNumber.
  const billNumber = payload.billNumber
    ? await SalesRepo.claimBillNumber(tx, retailer.id, payload.billNumber)
    : await SalesRepo.nextServerBillNumber(tx, retailer.id);

  const sale = await SalesRepo.createSale(tx, {
    id: saleId,
    retailerId: retailer.id,
    customerId: customer?.id || null,
    billNumber,
    deviceId,
    // The device's clock at the counter is the business fact. Ours is when we
    // heard about it.
    soldAt: payload.soldAt ? new Date(payload.soldAt) : new Date(),
    syncedAt: new Date(),
    subtotal: String(subtotal),
    taxTotal: "0",
    discount: String(discount),
    total: String(total),
    status: "completed",
  });

  const itemRows = [];
  let unattributedUnits = 0;

  for (const line of priced) {
    // Shelf down. A DELTA (`qty = qty - n`), never an absolute write: two
    // devices that each computed "qty is now 40" would silently erase one
    // another's sale. docs/16-offline-first.md.
    await RetailerInventoryRepo.addToShelf(tx, retailer.id, line.variantId, -line.quantity);

    // Consignment -> due, priced from the layers actually consumed.
    const consumed = await consumeLayersForVariant(tx, {
      retailerId: retailer.id,
      variantId: line.variantId,
      qty: line.quantity,
      saleId: sale.id,
    });
    unattributedUnits += consumed.unattributed;

    for (const accrual of consumed.billAccruals) {
      const bill = await ProductBillsRepo.getBillById(accrual.productBillId);
      await tx.insert(ledger).values({
        retailerId: retailer.id,
        distributorId: bill.distributorId,
        type: "debit",
        amount: String(accrual.amount),
        balance: String(bill.outstandingBalance ?? 0),
        billId: accrual.productBillId,
        referenceType: "sale",
        referenceId: sale.id,
      });
    }

    itemRows.push({
      id: line.itemId,
      saleId: sale.id,
      variantId: line.variantId,
      quantity: line.quantity,
      unitPrice: String(line.unitPrice),
      unitCost: String(consumed.weightedUnitCost),
      taxRate: String(line.taxRate),
      amount: String(line.amount),
    });
  }

  const insertedItems = await SalesRepo.insertItems(tx, itemRows);
  const insertedPayments = await SalesRepo.insertPayments(
    tx,
    payments.map((p) => ({
      id: p.paymentId || ulid(),
      saleId: sale.id,
      method: p.method || "cash",
      amount: String(round2(p.amount)),
    }))
  );

  return {
    sale,
    items: insertedItems,
    payments: insertedPayments,
    customer,
    // Non-zero means the shop sold units the server has no stock record for -
    // typically a stale-stock oversell across two devices. The sale stands;
    // the shop is told to reconcile.
    unattributedUnits,
  };
}

/**
 * sale.void - the ONLY correction a sale gets.
 *
 * A synced sale is immutable (docs/16-offline-first.md). There is no edit
 * path, because an edit is a silent rewrite of a revenue record and there is
 * no way to tell afterwards that it happened. A correction is a void followed
 * by a fresh sale, and both are on the record.
 *
 * The void is the exact inverse of the create: units back on the shelf, units
 * back into their own FIFO layers, the accrual reversed out of money due and
 * back into consignment, and an offsetting ledger credit.
 */
export async function applySaleVoid(tx, { retailer, payload }) {
  const saleId = payload.saleId;
  if (!saleId) throw new Error("saleId is required");

  const sale = await SalesRepo.getSaleById(tx, retailer.id, saleId);
  if (!sale) throw new Error(`Sale not found: ${saleId}`);

  // Voiding an already-voided sale is a no-op, not an error: a device that
  // never saw the ack will resend, and this is the honest answer.
  if (sale.status === "voided") return { sale, alreadyVoided: true };

  const accruals = await ProductBillsRepo.findAccrualsForSale(tx, saleId);

  for (const accrual of accruals) {
    const meta = accrual.metadata || {};
    for (const layer of meta.layers || []) {
      await ProductBillsRepo.restoreLayer(tx, layer.layerId, layer.qty);
    }

    await ProductBillsRepo.reverseSaleAccrual(tx, {
      productBillId: accrual.productBillId,
      qty: Number(accrual.quantity || 0),
      amount: round2(accrual.amount || 0),
      unitCost: accrual.unitPrice,
      saleId,
      layers: meta.layers || [],
    });

    const bill = await ProductBillsRepo.getBillById(accrual.productBillId);
    await tx.insert(ledger).values({
      retailerId: retailer.id,
      distributorId: bill.distributorId,
      type: "credit",
      amount: String(round2(accrual.amount || 0)),
      balance: String(bill.outstandingBalance ?? 0),
      billId: accrual.productBillId,
      referenceType: "sale_void",
      referenceId: saleId,
    });
  }

  // Stock back on the shelf - a delta again, for the same reason.
  const items = await SalesRepo.listItemsForSale(tx, saleId);
  for (const item of items) {
    await RetailerInventoryRepo.addToShelf(tx, retailer.id, item.variantId, Number(item.quantity));
  }

  const voided = await SalesRepo.markVoided(tx, saleId, payload.reason);
  return { sale: voided, reversedAccruals: accruals.length };
}

/** price.set - what this shop charges for a variant. */
export async function applyPriceSet(tx, { retailer, payload }) {
  const { variantId, price } = payload;
  if (!variantId) throw new Error("variantId is required");
  if (price == null || Number(price) < 0) throw new Error("A valid price is required");

  const row = await SalesRepo.upsertRetailPrice(retailer.id, variantId, String(price), tx);
  return { price: row };
}

/** The op type -> applier table the sync endpoint dispatches through. */
export const OP_APPLIERS = {
  "sale.create": applySaleCreate,
  "sale.void": applySaleVoid,
  "price.set": applyPriceSet,
};

/* ===========================================================================
   HTTP-facing service
   =========================================================================== */

async function requireRetailer(user) {
  if (user.role !== "retailer") throw new Error("Only retailers allowed");
  const retailer = await OrdersRepo.findRetailerByUserId(user.id);
  if (!retailer) throw new Error("Retailer profile not found");
  return retailer;
}

const SalesService = {
  requireRetailer,

  /** The retailer's shelf, priced for selling. */
  async getSellableItems(user) {
    const retailer = await requireRetailer(user);

    const rows = await SalesRepo.listSellable(retailer.id);
    return rows.map((r) => ({
      ...r,
      // What the customer pays: the retailer's own price, else printed MRP.
      price: Number(r.retailPrice ?? r.mrp ?? 0),
      priceIsCustom: r.retailPrice != null,
    }));
  },

  async setRetailPrice(user, variantId, price) {
    const retailer = await requireRetailer(user);
    const { price: row } = await db.transaction((tx) =>
      applyPriceSet(tx, { retailer, payload: { variantId, price } })
    );
    return row;
  },

  /**
   * Ring up a sale over HTTP.
   *
   * A thin wrapper around the same applier the sync endpoint uses. The sale id
   * is minted here rather than on a device, but it is still a ULID and it is
   * still allocated before the write - so this path and the offline path
   * produce rows that are indistinguishable afterwards.
   */
  async createSale(user, payload = {}) {
    const retailer = await requireRetailer(user);

    const result = await db.transaction((tx) =>
      applySaleCreate(tx, { retailer, payload, deviceId: payload.deviceId || null })
    );

    publishEvent("sales.created", {
      saleId: result.sale.id,
      retailerId: retailer.id,
      total: Number(result.sale.total),
    }).catch(() => {});

    return result;
  },

  async voidSale(user, saleId, reason) {
    const retailer = await requireRetailer(user);
    return db.transaction((tx) =>
      applySaleVoid(tx, { retailer, payload: { saleId, reason } })
    );
  },

  async listSales(user, filters) {
    const retailer = await requireRetailer(user);
    return SalesRepo.listSales(retailer.id, filters);
  },

  async getSale(user, saleId) {
    const retailer = await requireRetailer(user);
    const sale = await SalesRepo.getSaleWithItems(retailer.id, saleId);
    if (!sale) throw new Error("Sale not found");
    return sale;
  },
};

export default SalesService;
