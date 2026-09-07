// src/modules/sales/sales.service.js
//
// The sell side, and the second half of two-stage billing.
//
// A delivery puts stock on the retailer's shelf as consignment the distributor
// is financing. THIS is where it becomes money owed: when the shopkeeper
// actually sells it. That is the whole point of tracking credit per product
// rather than per order - see docs/02-product-billing.md.

import { db } from "../../config/postgres.js";
import { ledger } from "../../db/schema.js";
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

    const acc = perBill.get(layer.productBillId) || { qty: 0, amount: 0, unitCost };
    acc.qty += take;
    acc.amount = round2(acc.amount + amount);
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
    });
  }

  if (remaining > 0) {
    // Stock that predates the system, or was added to the shelf by hand, has no
    // cost layer behind it. Never block a sale that physically happened - the
    // same stance as the offline conflict policy in docs/16. Record it instead.
    console.warn(
      `[sales] variant ${variantId}: ${remaining} unit(s) sold with no cost layer to attribute them to. ` +
      `Nothing accrued for those units.`
    );
  }

  return {
    costConsumed,
    qtyAttributed,
    weightedUnitCost: qtyAttributed > 0 ? round2(costConsumed / qtyAttributed) : 0,
    billAccruals: [...perBill.entries()].map(([productBillId, a]) => ({ productBillId, ...a })),
  };
}

const SalesService = {
  /** The retailer's shelf, priced for selling. */
  async getSellableItems(user) {
    if (user.role !== "retailer") throw new Error("Only retailers allowed");
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    if (!retailer) throw new Error("Retailer profile not found");

    const rows = await SalesRepo.listSellable(retailer.id);
    return rows.map((r) => ({
      ...r,
      // What the customer pays: the retailer's own price, else printed MRP.
      price: Number(r.retailPrice ?? r.mrp ?? 0),
      priceIsCustom: r.retailPrice != null,
    }));
  },

  async setRetailPrice(user, variantId, price) {
    if (user.role !== "retailer") throw new Error("Only retailers allowed");
    if (price == null || Number(price) < 0) throw new Error("A valid price is required");
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    if (!retailer) throw new Error("Retailer profile not found");
    return SalesRepo.upsertRetailPrice(retailer.id, variantId, String(price));
  },

  /**
   * Ring up a sale.
   *
   * One transaction: shelf down, FIFO layers consumed, product bills accrued
   * from consignment into money due, ledger debited, sale recorded.
   */
  async createSale(user, payload = {}) {
    if (user.role !== "retailer") throw new Error("Only retailers allowed");
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    if (!retailer) throw new Error("Retailer profile not found");

    const items = payload.items || [];
    if (!items.length) throw new Error("No items provided");

    const payments = payload.payments || [];
    if (!payments.length) throw new Error("Payment is required to complete a sale");

    const variantIds = items.map((i) => i.variantId);
    const priceMap = await SalesRepo.resolvePrices(retailer.id, variantIds);

    // Price and total up front so the sale can be rejected before any writes.
    const priced = items.map((it) => {
      const info = priceMap[it.variantId];
      if (!info) throw new Error(`Unknown variant: ${it.variantId}`);

      const qty = Number(it.quantity || 0);
      if (qty <= 0) throw new Error("Quantity must be greater than zero");

      // An explicit per-line price wins (discounts happen at a counter).
      const unitPrice = round2(it.unitPrice ?? info.retailPrice ?? info.mrp ?? 0);
      return {
        variantId: it.variantId,
        quantity: qty,
        unitPrice,
        taxRate: Number(info.gstRate || 0),
        amount: round2(qty * unitPrice),
      };
    });

    const subtotal = round2(priced.reduce((s, i) => s + i.amount, 0));
    const discount = round2(payload.discount || 0);
    const total = round2(subtotal - discount);

    const paid = round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
    if (paid < total) {
      throw new Error(`Payment of ${paid} does not cover the total of ${total}`);
    }

    const result = await db.transaction(async (tx) => {
      const customer = payload.customer
        ? await SalesRepo.findOrCreateCustomer(tx, retailer.id, payload.customer)
        : null;

      const billNumber = await SalesRepo.nextBillNumber(tx, retailer.id);

      const sale = await SalesRepo.createSale(tx, {
        retailerId: retailer.id,
        customerId: customer?.id || null,
        billNumber,
        soldAt: new Date(),
        subtotal: String(subtotal),
        taxTotal: "0",
        discount: String(discount),
        total: String(total),
        status: "completed",
      });

      const itemRows = [];
      for (const line of priced) {
        // Shelf down.
        await RetailerInventoryRepo.addToShelf(
          tx, retailer.id, line.variantId, -line.quantity
        );

        // Consignment -> due, priced from the layers actually consumed.
        const consumed = await consumeLayersForVariant(tx, {
          retailerId: retailer.id,
          variantId: line.variantId,
          qty: line.quantity,
          saleId: sale.id,
        });

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
          saleId: sale.id,
          method: p.method || "cash",
          amount: String(round2(p.amount)),
        }))
      );

      return { sale, items: insertedItems, payments: insertedPayments, customer };
    });

    publishEvent("sales.created", {
      saleId: result.sale.id,
      retailerId: retailer.id,
      total,
    }).catch(() => {});

    return result;
  },

  async listSales(user, filters) {
    if (user.role !== "retailer") throw new Error("Only retailers allowed");
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    if (!retailer) throw new Error("Retailer profile not found");
    return SalesRepo.listSales(retailer.id, filters);
  },

  async getSale(user, saleId) {
    if (user.role !== "retailer") throw new Error("Only retailers allowed");
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    if (!retailer) throw new Error("Retailer profile not found");
    const sale = await SalesRepo.getSaleWithItems(retailer.id, saleId);
    if (!sale) throw new Error("Sale not found");
    return sale;
  },
};

export default SalesService;
