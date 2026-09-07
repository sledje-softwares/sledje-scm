import { db } from "../../config/postgres.js";
import {
  invoices,
  invoiceItems,
  productBills,
  productBillTransactions,
  retailers,
  distributors,
  productVariants,
  outbox
} from "../../db/schema.js";

import { eq, and, gte, lte } from "drizzle-orm";
import { publishEvent } from "../../config/nats-streams.js";
import { generateInvoicePDF } from "../../utils/invoice-pdf.js";

// ======= Helpers =======

async function getDistributorFromUser(userId) {
  const rows = await db.select().from(distributors).where(eq(distributors.userId, userId));
  return rows[0] || null;
}

async function getRetailerFromUser(userId) {
  const rows = await db.select().from(retailers).where(eq(retailers.userId, userId));
  return rows[0] || null;
}

// ================ MAIN SERVICE ================
export default {
  /**
   * Generate Invoice
   * Distributor triggers invoice creation for a retailer
   */
  async generateInvoice(user, { retailerId, start, end, periodType }) {
    if (user.role !== "distributor") throw new Error("Only distributors can create invoices");

    const distributor = await getDistributorFromUser(user.id);
    if (!distributor) throw new Error("Distributor profile missing");

    // Validate retailer
    const [ret] = await db.select().from(retailers).where(eq(retailers.id, retailerId));
    if (!ret) throw new Error("Retailer not found");

    const startDate = new Date(start);
    const endDate = new Date(end);

    // Check duplicate invoice
    const existing = await db.select().from(invoices).where(
      and(
        eq(invoices.retailerId, retailerId),
        eq(invoices.distributorId, distributor.id),
        eq(invoices.periodStart, startDate),
        eq(invoices.periodEnd, endDate)
      )
    );
    if (existing.length) throw new Error("Invoice already exists for this period");

    // Fetch all product bills → transactions in range
    const billRows = await db.select().from(productBills).where(
      and(
        eq(productBills.retailerId, retailerId),
        eq(productBills.distributorId, distributor.id)
      )
    );

    // No transactions = no invoice
    let invoiceItemsToInsert = [];
    let totalTaxableValue = 0;
    let totalGst = 0;

    for (const bill of billRows) {
      const txs = await db.select().from(productBillTransactions)
        .where(
          and(
            eq(productBillTransactions.productBillId, bill.id),
            gte(productBillTransactions.date, startDate),
            lte(productBillTransactions.date, endDate),
            eq(productBillTransactions.type, "delivery")
          )
        );

      if (!txs.length) continue;

      // Fetch variant for GST/HSN
      const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, bill.variantId));
      const gstRate = Number(variant.gstRate || 0);

      for (const tx of txs) {
        const quantity = Number(tx.quantity);
        const unitPrice = Number(tx.unitPrice);
        const amount = Number(tx.amount);

        const taxable = amount;
        const gstAmount = (amount * gstRate) / 100;

        totalTaxableValue += taxable;
        totalGst += gstAmount;

        invoiceItemsToInsert.push({
          id: crypto.randomUUID(),
          invoiceId: null, // filled after invoice insert
          productBillId: bill.id,
          variantId: bill.variantId,
          quantity,
          unitPrice,
          amount: taxable + gstAmount,
          metadata: {
            gstRate,
            hsnCode: variant.hsnCode
          }
        });
      }
    }

    if (!invoiceItemsToInsert.length) throw new Error("No taxable transactions in this period");

    const totalAmount = totalTaxableValue + totalGst;

    // ------- Create Invoice + Items in TX -------
    const result = await db.transaction(async (tx) => {
      // Insert invoice
      const [inv] = await tx.insert(invoices).values({
        retailerId,
        distributorId: distributor.id,
        periodStart: startDate,
        periodEnd: endDate,
        totalTaxableValue,
        totalGst,
        cgst: totalGst / 2,
        sgst: totalGst / 2,
        igst: 0,
        totalAmount,
        status: "issued",
        metadata: { periodType }
      }).returning();

      // Insert invoice items
      for (const item of invoiceItemsToInsert) {
        await tx.insert(invoiceItems).values({
          ...item,
          invoiceId: inv.id
        });
      }

      // outbox event
      await tx.insert(outbox).values({
        eventType: "invoice.generated",
        payload: { invoiceId: inv.id, retailerId, distributorId: distributor.id }
      });

      return inv;
    });

    // best effort publish
    publishEvent("invoice.generated", {
      invoiceId: result.id,
      retailerId,
      distributorId: distributor.id
    }).catch(() => {});

    return result;
  },

  // ===== GET invoice =====
  async getInvoice(user, invoiceId) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!invoice) throw new Error("Invoice not found");

    // auth check
    if (user.role === "retailer") {
      const r = await getRetailerFromUser(user.id);
      if (invoice.retailerId !== r.id) throw new Error("Forbidden");
    }
    if (user.role === "distributor") {
      const d = await getDistributorFromUser(user.id);
      if (invoice.distributorId !== d.id) throw new Error("Forbidden");
    }

    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));

    return { invoice, items };
  },

  // ===== LIST invoices =====
  async listInvoices(user, filters = {}) {
    let q = db.select().from(invoices);

    if (user.role === "retailer") {
      const r = await getRetailerFromUser(user.id);
      q = q.where(eq(invoices.retailerId, r.id));
    } else if (user.role === "distributor") {
      const d = await getDistributorFromUser(user.id);
      q = q.where(eq(invoices.distributorId, d.id));
    }

    q = q.orderBy(invoices.createdAt, "desc");
    return q;
  },

  // ===== PDF =====
  async getInvoicePDF(user, invoiceId) {
    const { invoice, items } = await this.getInvoice(user, invoiceId);

    const [retailer] = await db.select().from(retailers).where(eq(retailers.id, invoice.retailerId));
    const [distributor] = await db.select().from(distributors).where(eq(distributors.id, invoice.distributorId));

    return generateInvoicePDF(invoice, items, retailer, distributor);
  },

  // ===== markInvoicePaid =====
  async markInvoicePaid(user, invoiceId) {
    if (user.role !== "retailer" && user.role !== "distributor")
      throw new Error("Unauthorized");

    const { invoice } = await this.getInvoice(user, invoiceId);

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(invoices)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(invoices.id, invoiceId))
        .returning();

      await tx.insert(outbox).values({
        eventType: "invoice.paid",
        payload: { invoiceId }
      });

      return updated;
    });

    publishEvent("invoice.paid", { invoiceId }).catch(() => {});

    return result;
  }
};
