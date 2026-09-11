import { db } from "../../config/postgres.js";
import {
  ledger,
  productBills,
  productVariants,
  productBillTransactions,
  invoices,
  invoiceItems
} from "../../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";
import { AppError } from "../../api-gateway/middlewares/error.middleware.js";

const LedgerRepo = {
  async getLedgerForRetailer(retailerId) {
    return db.select().from(ledger).where(eq(ledger.retailerId, retailerId)).orderBy(ledger.createdAt);
  },

  async getLedgerForDistributor(distributorId) {
    return db.select().from(ledger).where(eq(ledger.distributorId, distributorId)).orderBy(ledger.createdAt);
  },

  async getLedgerForBill(billId) {
    return db.select().from(ledger).where(eq(ledger.billId, billId)).orderBy(ledger.createdAt);
  },

  async getLedgerForVariant(variantId) {
    const bills = await db.select().from(productBills).where(eq(productBills.variantId, variantId));
    const billIds = bills.map(x => x.id);
    if (!billIds.length) return [];

    return db.select().from(ledger).where(inArray(ledger.billId, billIds)).orderBy(ledger.createdAt);
  },

  async getLedgerForInvoice(invoiceId) {
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    const billIds = items.map(i => i.productBillId);
    if (!billIds.length) return [];
    return db.select().from(ledger).where(inArray(ledger.billId, billIds)).orderBy(ledger.createdAt);
  },

  // Summaries
  async getBillsWithRunningBalance(user) {
    if (user.role === "retailer") {
      return db.select().from(productBills).where(eq(productBills.retailerId, user.entityId));
    }
    if (user.role === "distributor") {
      return db.select().from(productBills).where(eq(productBills.distributorId, user.entityId));
    }
    throw new AppError("Forbidden", 403);
  },

  async getVariantSummaries(user) {
    let bills = [];
    if (user.role === "retailer") {
      bills = await db.select().from(productBills).where(eq(productBills.retailerId, user.entityId));
    } else {
      bills = await db.select().from(productBills).where(eq(productBills.distributorId, user.entityId));
    }

    const variantIds = bills.map(b => b.variantId);
    if (!variantIds.length) return [];

    return db.select().from(productVariants).where(inArray(productVariants.id, variantIds));
  },

  async getInvoiceSummaries(user) {
    if (user.role === "retailer") {
      return db.select().from(invoices).where(eq(invoices.retailerId, user.entityId));
    }
    return db.select().from(invoices).where(eq(invoices.distributorId, user.entityId));
  }
};

export default LedgerRepo;
