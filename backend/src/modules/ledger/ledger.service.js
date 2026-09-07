import LedgerRepo from "./ledger.repository.js";
import OrdersRepo from "../orders/orders.repository.js";
import ProductBillsRepo from "../product-bills/product-bills.repository.js";
import { db } from "../../config/postgres.js";
import { eq } from "drizzle-orm";
import { productBills, productVariants, invoices } from "../../db/schema.js";

const LedgerService = {
  // Main ledger for logged-in user
  async getLedgerForUser(user) {
    if (user.role === "retailer") {
      const retailer = await OrdersRepo.findRetailerByUserId(user.id);
      if (!retailer) throw new Error("Retailer not found");
      return LedgerRepo.getLedgerForRetailer(retailer.id);
    }

    if (user.role === "distributor") {
      const distributor = await OrdersRepo.findDistributorByUserId(user.id);
      if (!distributor) throw new Error("Distributor not found");
      return LedgerRepo.getLedgerForDistributor(distributor.id);
    }

    throw new Error("Unauthorized");
  },

  async getLedgerForBill(user, billId) {
    const bill = await ProductBillsRepo.getBillById(billId);
    if (!bill) throw new Error("Bill not found");

    // Auth
    if (user.role === "retailer") {
      const r = await OrdersRepo.findRetailerByUserId(user.id);
      if (!r || r.id !== bill.retailerId) throw new Error("Forbidden");
    }

    if (user.role === "distributor") {
      const d = await OrdersRepo.findDistributorByUserId(user.id);
      if (!d || d.id !== bill.distributorId) throw new Error("Forbidden");
    }

    return LedgerRepo.getLedgerForBill(billId);
  },

  async getLedgerForVariant(user, variantId) {
    // Check access using productBills
    const bills = await db.select().from(productBills).where(eq(productBills.variantId, variantId));

    if (bills.length === 0) throw new Error("No bills for this variant");

    // Determine retailer/distributor access
    if (user.role === "retailer") {
      const r = await OrdersRepo.findRetailerByUserId(user.id);
      if (!r) throw new Error("Forbidden");
      if (!bills.some(b => b.retailerId === r.id)) throw new Error("Forbidden");
    }

    if (user.role === "distributor") {
      const d = await OrdersRepo.findDistributorByUserId(user.id);
      if (!d) throw new Error("Forbidden");
      if (!bills.some(b => b.distributorId === d.id)) throw new Error("Forbidden");
    }

    return LedgerRepo.getLedgerForVariant(variantId);
  },

  async getLedgerForInvoice(user, invoiceId) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!invoice) throw new Error("Invoice not found");

    // Auth
    if (user.role === "retailer") {
      const r = await OrdersRepo.findRetailerByUserId(user.id);
      if (!r || r.id !== invoice.retailerId) throw new Error("Forbidden");
    }

    if (user.role === "distributor") {
      const d = await OrdersRepo.findDistributorByUserId(user.id);
      if (!d || d.id !== invoice.distributorId) throw new Error("Forbidden");
    }

    return LedgerRepo.getLedgerForInvoice(invoiceId);
  },

  // Complete combined statement
  async getFullStatement(user) {
    // The JWT carries { id, role } where id is users.id - it has no entityId.
    // The summary repo methods filter on user.entityId, so the profile id must be
    // resolved here or every query silently matches nothing.
    const profile =
      user.role === "retailer"
        ? await OrdersRepo.findRetailerByUserId(user.id)
        : await OrdersRepo.findDistributorByUserId(user.id);

    if (!profile) throw new Error("Profile not found");

    const scoped = { ...user, entityId: profile.id };

    const core = await this.getLedgerForUser(user); // user-wide ledger
    const bills = await LedgerRepo.getBillsWithRunningBalance(scoped);
    const variants = await LedgerRepo.getVariantSummaries(scoped);
    const invoicesList = await LedgerRepo.getInvoiceSummaries(scoped);

    return {
      ledger: core,
      bills,
      variants,
      invoices: invoicesList,
    };
  },
};

export default LedgerService;
