// src/modules/product-bills/product-bills.service.js
import { db } from "../../config/postgres.js";
import { ledger } from "../../db/schema.js";
import ProductBillsRepo from "./product-bills.repository.js";
import OrdersRepo from "../orders/orders.repository.js";
import { publishEvent } from "../../config/nats-streams.js";

const ProductBillsService = {
  /**
   * List bills for logged-in user:
   * - retailer: their own bills
   * - distributor: bills where they are the distributor
   */
  async listBills(user, filters = {}) {
    if (user.role === "retailer") {
      const retailer = await OrdersRepo.findRetailerByUserId(user.id);
      if (!retailer) throw new Error("Retailer not found");

      return ProductBillsRepo.getBillsForRetailer(retailer.id, filters);
    }

    if (user.role === "distributor") {
      const dist = await OrdersRepo.findDistributorByUserId(user.id);
      if (!dist) throw new Error("Distributor not found");

      return ProductBillsRepo.getBillsForDistributor(dist.id, filters);
    }

    throw new Error("Unauthorized");
  },

  async getBill(user, billId) {
    const bill = await ProductBillsRepo.getBillById(billId);
    if (!bill) throw new Error("Bill not found");

    // permission check
    if (user.role === "retailer") {
      const retailer = await OrdersRepo.findRetailerByUserId(user.id);
      if (!retailer || bill.retailerId !== retailer.id) {
        throw new Error("Forbidden");
      }
    }

    if (user.role === "distributor") {
      const dist = await OrdersRepo.findDistributorByUserId(user.id);
      if (!dist || bill.distributorId !== dist.id) {
        throw new Error("Forbidden");
      }
    }

    const txs = await ProductBillsRepo.listTransactionsForBill(bill.id);
    return { bill, transactions: txs };
  },

  async getTransactions(user, billId) {
    const bill = await ProductBillsRepo.getBillById(billId);
    if (!bill) throw new Error("Bill not found");

    if (user.role === "retailer") {
      const retailer = await OrdersRepo.findRetailerByUserId(user.id);
      if (!retailer || bill.retailerId !== retailer.id) throw new Error("Forbidden");
    }
    if (user.role === "distributor") {
      const dist = await OrdersRepo.findDistributorByUserId(user.id);
      if (!dist || bill.distributorId !== dist.id) throw new Error("Forbidden");
    }

    return ProductBillsRepo.listTransactionsForBill(bill.id);
  },

  /**
   * Retailer pays against a specific bill
   */
  /**
   * Retailer pays against a specific product bill.
   *
   * Folded in from the parallel modules/payments/ implementation (deleted -
   * see docs/14-simplification.md): the clamp against outstandingBalance and
   * the ledger credit entry both belong here, not in a second, divergent
   * payment path.
   */
  async payBill(user, billId, { amount, paymentMethod, note }) {
    if (user.role !== "retailer") throw new Error("Only retailers can make payments");

    const bill = await ProductBillsRepo.getBillById(billId);
    if (!bill) throw new Error("Bill not found");

    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    if (!retailer || bill.retailerId !== retailer.id) {
      throw new Error("Forbidden");
    }

    const currentOutstanding = Number(bill.outstandingBalance || 0);
    const requested = Number(amount || 0);
    if (!requested || requested <= 0) throw new Error("amount must be > 0");

    // Clamp to outstanding - without this an overpayment drives the balance
    // negative (P1-12).
    const pay = Math.min(requested, currentOutstanding);
    if (pay <= 0) throw new Error("Nothing to pay for this bill");

    const newOutstanding = currentOutstanding - pay;

    await db.transaction(async (tx) => {
      await ProductBillsRepo.createPaymentTxAndUpdateBill(tx, {
        productBillId: bill.id,
        amount: pay,
        metadata: {
          paymentMethod,
          note,
          paidByUserId: user.id,
        },
      });

      // Record the payment on the retailer<->distributor ledger, same as
      // every other money movement.
      await tx.insert(ledger).values({
        retailerId: bill.retailerId,
        distributorId: bill.distributorId,
        type: "credit",
        amount: String(pay),
        balance: String(newOutstanding),
        billId: bill.id,
      });
    });

    // best-effort publish; there is no outbox/guaranteed-delivery layer.
    publishEvent("product_bills.payment", {
      billId: bill.id,
      amount: pay,
      paymentMethod,
      note,
      retailerId: bill.retailerId,
      distributorId: bill.distributorId,
    }).catch((e) => console.warn("publish product_bills.payment failed:", e.message));

    return { success: true, amountPaid: pay, outstandingBalance: newOutstanding };
  },
};

export default ProductBillsService;
