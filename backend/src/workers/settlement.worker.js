/**
 * settlement.worker.js
 *
 * Usage:
 *   node src/workers/settlement.worker.js --period=monthly
 *   node src/workers/settlement.worker.js --period=weekly
 *
 * Env:
 *   - POSTGRES_URL, NATS_URL (if you want to publish an event afterwards)
 *
 * The worker:
 *  - Computes periodStart/periodEnd based on period arg.
 *  - Aggregates product_bills outstanding amounts per (retailer, distributor).
 *  - Creates invoice and invoice_items inside a single DB transaction.
 *  - Calculates GST (CGST/SGST for intra-state, IGST for inter-state).
 *  - Writes an outbox entry: eventType = "invoices.created"
 *
 * Note: Idempotent: it checks if an invoice for (retailer, distributor, periodStart, periodEnd) exists.
 */

import "dotenv/config";
import { db } from "../config/postgres.js";
import {
  productBills,
  productBillTransactions,
  productDeliveryLog,
  invoices,
  invoiceItems,
  outbox,
  productVariants,
  retailers,
  distributors
} from "../db/schema.js";

import { eq, and, gte, lte } from "drizzle-orm";
import parseArgs from "minimist";

const args = parseArgs(process.argv.slice(2));
const PERIOD = (args.period || process.env.SETTLEMENT_PERIOD || "monthly").toLowerCase(); // weekly | monthly

function getPeriodRange(period, reference = new Date()) {
  const r = new Date(reference);
  let start, end;

  if (period === "weekly") {
    // ISO week: start on Monday
    const day = r.getUTCDay(); // 0 Sun .. 6 Sat
    const diffToMonday = ((day + 6) % 7); // 0 for Monday .. 6 for Sunday
    start = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate() - diffToMonday));
    start.setUTCHours(0,0,0,0);
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    end.setUTCHours(0,0,0,0);
    end = new Date(end.getTime() - 1); // inclusive end
  } else {
    // default monthly -> last full month
    const year = r.getUTCFullYear();
    const month = r.getUTCMonth(); // 0-based
    // choose previous month as the closed period (so running in Jan gives Dec)
    const prevMonthDate = new Date(Date.UTC(year, month - 1, 1));
    const prevYear = prevMonthDate.getUTCFullYear();
    const prevMonth = prevMonthDate.getUTCMonth();
    start = new Date(Date.UTC(prevYear, prevMonth, 1, 0,0,0));
    end = new Date(Date.UTC(prevYear, prevMonth + 1, 1, 0,0,0));
    end = new Date(end.getTime() - 1); // inclusive end
  }

  return { start, end };
}

async function runSettlement(period) {
  console.log(`🧾 Running settlement for period: ${period}`);
  const { start, end } = getPeriodRange(period);
  console.log(`Period start: ${start.toISOString()}, end: ${end.toISOString()}`);

  // Step A: find all product_bills that have delivery transactions within this period
  const deliveries = await db
    .select()
    .from(productBillTransactions)
    .where(and(
      eq(productBillTransactions.type, "delivery"),
      gte(productBillTransactions.date, start),
      lte(productBillTransactions.date, end)
    ));

  // Map deliveries by productBillId
  const map = new Map(); // billId -> { billId, retailerId, distributorId, variantId, delivered_amount, delivered_quantity }
  for (const d of deliveries) {
    // fetch bill row to get retailer/distributor/variant if needed
    const bill = await db.select().from(productBills).where(eq(productBills.id, d.productBillId)).then(rows => rows[0]);
    if (!bill) continue;
    const b = map.get(bill.id) || { 
      billId: bill.id, 
      retailerId: bill.retailerId, 
      distributorId: bill.distributorId, 
      variantId: bill.variantId, 
      delivered_amount: 0, 
      delivered_quantity: 0 
    };
    b.delivered_amount = Number(b.delivered_amount) + Number(d.amount || 0);
    b.delivered_quantity = Number(b.delivered_quantity) + Number(d.quantity || 0);
    map.set(bill.id, b);
  }

  // If no deliveries, exit early
  if (map.size === 0) {
    console.log("No deliveries found in period. Exiting.");
    return;
  }

  // Group by (retailer, distributor)
  const grouped = new Map(); // key = `${retailerId}:${distributorId}` -> array of bill entries
  for (const [billId, entry] of map.entries()) {
    const key = `${entry.retailerId}:${entry.distributorId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  // For each group, create an invoice if not exists for same period
  for (const [key, items] of grouped.entries()) {
    const [retailerId, distributorId] = key.split(":");
    
    // Fetch retailer and distributor for state comparison
    const retailer = await db.select().from(retailers).where(eq(retailers.id, retailerId)).then(rows => rows[0]);
    const distributor = await db.select().from(distributors).where(eq(distributors.id, distributorId)).then(rows => rows[0]);
    
    if (!retailer || !distributor) {
      console.log(`Missing retailer or distributor data for ${retailerId} / ${distributorId}. Skipping.`);
      continue;
    }

    // Check idempotency: invoice exists for same retailer/distributor and periodStart/periodEnd
    const exists = await db.select().from(invoices).where(
      and(
        eq(invoices.retailerId, retailerId),
        eq(invoices.distributorId, distributorId),
        eq(invoices.periodStart, start),
        eq(invoices.periodEnd, end)
      )
    ).then(rows => rows[0]);

    if (exists) {
      console.log(`Invoice already exists for ${retailerId} / ${distributorId} for this period. Skipping.`);
      continue;
    }

    // Create invoice inside transaction
    await db.transaction(async (tx) => {
      // compute totals (including taxes)
      let totalInvoiceAmount = 0;
      let totalTaxableValue = 0;
      let totalCGST = 0;
      let totalSGST = 0;
      let totalIGST = 0;

      // Pre-calculate all amounts
      const itemsWithTax = [];
      for (const it of items) {
        // Fetch variant for GST rate and HSN code
        const variant = await tx.select().from(productVariants).where(eq(productVariants.id, it.variantId)).then(rows => rows[0]);
        if (!variant) {
          console.warn(`Variant ${it.variantId} not found. Skipping item.`);
          continue;
        }

        const gstRate = Number(variant.gstRate) || 0;
        const taxable = Number(it.delivered_amount) || 0;

        let cgst = 0, sgst = 0, igst = 0;

        const isInterState = retailer.state !== distributor.state;

        if (isInterState) {
          igst = taxable * (gstRate / 100);
        } else {
          cgst = taxable * (gstRate / 100 / 2);
          sgst = taxable * (gstRate / 100 / 2);
        }

        const totalAmount = taxable + cgst + sgst + igst;

        itemsWithTax.push({
          ...it,
          variant,
          taxable,
          cgst,
          sgst,
          igst,
          totalAmount
        });

        totalTaxableValue += taxable;
        totalCGST += cgst;
        totalSGST += sgst;
        totalIGST += igst;
        totalInvoiceAmount += totalAmount;
      }

      // insert invoice
      const [inv] = await tx.insert(invoices).values({
        retailerId,
        distributorId,
        periodStart: start,
        periodEnd: end,
        totalAmount: totalInvoiceAmount,
        status: "issued",
        metadata: { 
          generatedAt: new Date().toISOString(), 
          period: period,
          taxBreakdown: {
            taxableValue: totalTaxableValue,
            cgst: totalCGST,
            sgst: totalSGST,
            igst: totalIGST
          }
        }
      }).returning();

      // insert invoice items with GST calculations
      for (const it of itemsWithTax) {
        await tx.insert(invoiceItems).values({
          invoiceId: inv.id,
          productBillId: it.billId,
          variantId: it.variantId,
          hsnCode: it.variant.hsnCode,
          quantity: it.delivered_quantity || 0,
          unitPrice: it.delivered_quantity ? (it.taxable / it.delivered_quantity).toFixed(2) : 0,
          taxableValue: it.taxable,
          cgst: it.cgst,
          sgst: it.sgst,
          igst: it.igst,
          amount: it.totalAmount,
          metadata: { 
            periodStart: start.toISOString(), 
            periodEnd: end.toISOString(),
            gstRate: it.variant.gstRate,
            isInterState: retailer.state !== distributor.state
          }
        });
      }

      // write outbox record for reliable publish
      await tx.insert(outbox).values({
        eventType: "invoices.created",
        payload: ({ 
          invoiceId: inv.id, 
          retailerId, 
          distributorId, 
          periodStart: start.toISOString(), 
          periodEnd: end.toISOString(),
          totalAmount: totalInvoiceAmount,
          taxBreakdown: {
            taxableValue: totalTaxableValue,
            cgst: totalCGST,
            sgst: totalSGST,
            igst: totalIGST
          }
        })
      });
    });

    console.log(`✅ Created invoice for retailer ${retailerId} / distributor ${distributorId}`);
  }

  console.log("Settlement completed.");
}

// Run
runSettlement(PERIOD).then(() => {
  console.log("Settlement worker finished.");
  process.exit(0);
}).catch(err => {
  console.error("Settlement worker failed:", err);
  process.exit(1);
});


// 3) How to schedule/run the worker

// Option A — Cron (Linux):

// # Weekly on Monday at 01:00
// 0 1 * * 1 /usr/bin/node /path/to/project/src/workers/settlement.worker.js --period=weekly >> /var/log/settlement.log 2>&1

// # Monthly on 1st at 02:00
// 0 2 1 * * /usr/bin/node /path/to/project/src/workers/settlement.worker.js --period=monthly >> /var/log/settlement.log 2>&1


// Option B — pm2 (long-running with schedule via cron-like)

// pm2 start src/workers/settlement.worker.js --name settlement-weekly -- --period=weekly
// # or use pm2's cron restart feature or an external scheduler to call the script


// Option C — run manually

// node src/workers/settlement.worker.js --period=monthly