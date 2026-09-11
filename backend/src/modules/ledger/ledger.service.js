import LedgerRepo from "./ledger.repository.js";
import OrdersRepo from "../orders/orders.repository.js";
import ProductBillsRepo from "../product-bills/product-bills.repository.js";
import { db } from "../../config/postgres.js";
import { eq } from "drizzle-orm";
import { productBills, productVariants, invoices } from "../../db/schema.js";
import { resolveActor, assertParty } from "../identity/actor.js";
import { AppError } from "../../api-gateway/middlewares/error.middleware.js";

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

    const actor = await resolveActor(user);
    assertParty(actor, bill);

    return LedgerRepo.getLedgerForBill(billId);
  },

  async getLedgerForVariant(user, variantId) {
    // Check access using productBills
    const bills = await db.select().from(productBills).where(eq(productBills.variantId, variantId));

    if (bills.length === 0) throw new Error("No bills for this variant");

    const actor = await resolveActor(user);
    const hasAccess = bills.some(
      (b) =>
        (actor.role === "retailer" && b.retailerId === actor.id) ||
        (actor.role === "distributor" && b.distributorId === actor.id)
    );
    if (!hasAccess) throw new AppError("Forbidden", 403);

    return LedgerRepo.getLedgerForVariant(variantId);
  },

  async getLedgerForInvoice(user, invoiceId) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!invoice) throw new Error("Invoice not found");

    const actor = await resolveActor(user);
    assertParty(actor, invoice);

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
