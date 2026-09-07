/**
 * scripts/verify_offline_sync.js
 *
 * End-to-end proof for the offline-first POS (docs/16-offline-first.md) and
 * two-stage billing (docs/02-product-billing.md), run against a real Postgres
 * and a real HTTP server.
 *
 * It asserts with DATA, not by reading code:
 *
 *   1. docs/02's worked example is still exact.
 *      receive 50 @ Rs.10, receive 50 @ Rs.12, sell 60, pay Rs.500
 *      -> due 620, consignment 480, outstanding 120.
 *   2. Replaying the SAME batch is a no-op: identical sale count, shelf qty
 *      and product-bill totals.
 *   3. A batch stops at the first failing op and names it, and the ops before
 *      it stay applied.
 *   4. Two devices selling the same variant concurrently: both sales survive.
 *      On-hand goes negative and nothing is lost.
 *   5. A void is the exact inverse of its sale.
 *
 * WARNING: this TRUNCATES the database it points at. Run it against a
 * throwaway instance, never a real one. It refuses to run without
 * VERIFY_I_KNOW_THIS_TRUNCATES=1.
 *
 *   docker run -d --name sledje-verify -e POSTGRES_PASSWORD=scratch \
 *     -e POSTGRES_USER=scratch -e POSTGRES_DB=sledje_offline \
 *     -p 55432:5432 postgres:15
 *   POSTGRES_URL=postgresql://scratch:scratch@localhost:55432/sledje_offline \
 *     npx drizzle-kit migrate
 *   POSTGRES_URL=... VERIFY_I_KNOW_THIS_TRUNCATES=1 node scripts/verify_offline_sync.js
 */

import "dotenv/config";
import http from "http";
import { ulid } from "ulid";
import bcrypt from "bcrypt";
import { db } from "../src/config/postgres.js";
import app from "../src/app.js";
import {
  users, retailers, distributors, distributorships,
  products, productVariants, inventory, productBills,
} from "../src/db/schema.js";
import { sql, eq, and } from "drizzle-orm";
import ProductBillsRepo from "../src/modules/product-bills/product-bills.repository.js";
import { deviceCodeFromId, formatBillNumber } from "../src/modules/sales/bill-number.js";

if (process.env.VERIFY_I_KNOW_THIS_TRUNCATES !== "1") {
  console.error(
    "Refusing to run: this script truncates its database.\n" +
    "Point POSTGRES_URL at a throwaway instance and set VERIFY_I_KNOW_THIS_TRUNCATES=1."
  );
  process.exit(1);
}

const PORT = Number(process.env.VERIFY_PORT || 5599);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed += 1; console.log(`  ✓ ${label}: ${JSON.stringify(actual)}`); }
  else { failed += 1; console.log(`  ✗ ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
  return ok;
}

function section(title) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

/* --------------------------------------------------------------------- */
/* Fixtures                                                              */
/* --------------------------------------------------------------------- */

async function reset() {
  await db.execute(sql`
    TRUNCATE TABLE
      sync_ops, sync_devices,
      sale_payments, sale_items, sales, customers, retail_prices,
      product_bill_layers, product_bill_transactions, product_delivery_log,
      product_bills, ledger, outbox, inventory,
      product_variants, products, distributorships,
      retailers, distributors, users
    RESTART IDENTITY CASCADE
  `);
}

async function seed() {
  const password = await bcrypt.hash("verify-pass", 10);

  const [retailerUser] = await db.insert(users).values({
    role: "retailer", email: "till@verify.local", password, phone: "9000000001",
  }).returning();
  const [retailer] = await db.insert(retailers).values({
    userId: retailerUser.id, businessName: "Verify Kirana", ownerName: "R",
    businessType: "kirana", pincode: "560001",
  }).returning();

  const [distUser] = await db.insert(users).values({
    role: "distributor", email: "dist@verify.local", password, phone: "9000000002",
  }).returning();
  const [distributor] = await db.insert(distributors).values({
    userId: distUser.id, companyName: "Verify Distribution", ownerName: "D",
    businessType: "wholesale", pincode: "560001",
  }).returning();

  const [ship] = await db.insert(distributorships).values({
    name: "Verify Foods", description: "seed",
  }).returning();
  const [product] = await db.insert(products).values({
    distributorshipId: ship.id, name: "Parle-G", category: "Biscuits",
  }).returning();
  const [variant] = await db.insert(productVariants).values({
    productId: product.id, name: "100g", sku: "PARLE-G-100G", mrp: "20.00", unit: "packet",
    gstRate: "0",
  }).returning();

  // A second variant, used by the two-device concurrency test so it cannot
  // disturb the worked example.
  const [variant2] = await db.insert(productVariants).values({
    productId: product.id, name: "250g", sku: "PARLE-G-250G", mrp: "45.00", unit: "packet",
    gstRate: "0",
  }).returning();

  return { retailerUser, retailer, distributor, variant, variant2 };
}

/** Two deliveries at different costs - the setup of docs/02's worked example. */
async function receive({ retailer, distributor, variant }, layers) {
  const bill = await ProductBillsRepo.createBill({
    retailerId: retailer.id, distributorId: distributor.id, variantId: variant.id,
  });

  for (const layer of layers) {
    await db.transaction(async (tx) => {
      await ProductBillsRepo.recordReceipt(tx, {
        productBillId: bill.id,
        orderId: crypto.randomUUID(),
        variantId: variant.id,
        qty: layer.qty,
        unitCost: String(layer.unitCost),
      });
    });
  }

  const total = layers.reduce((s, l) => s + l.qty, 0);
  await db.insert(inventory).values({
    retailerId: retailer.id, variantId: variant.id, qty: total,
  });

  return bill;
}

const billState = async (billId) => {
  const [b] = await db.select().from(productBills).where(eq(productBills.id, billId));
  return {
    due: Number(b.totalAmountDue),
    paid: Number(b.totalAmountPaid),
    outstanding: Number(b.outstandingBalance),
    consignment: Number(b.amountReceivedNotDue),
    qtySold: b.qtySold,
    qtyUnsold: b.qtyReceivedUnsold,
  };
};

const shelfQty = async (retailerId, variantId) => {
  const [row] = await db.select().from(inventory)
    .where(and(eq(inventory.retailerId, retailerId), eq(inventory.variantId, variantId)));
  return Number(row?.qty ?? 0);
};

const saleCount = async () => {
  const res = await db.execute(sql`SELECT count(*)::int AS n FROM sales`);
  return res.rows[0].n;
};

/* --------------------------------------------------------------------- */
/* A stand-in for the device: mints ULIDs and its own bill numbers.       */
/* --------------------------------------------------------------------- */

function makeDevice(label) {
  const id = ulid();
  return {
    id,
    label,
    code: deviceCodeFromId(id),
    counter: 0,
    /** Build a sale.create op exactly the way the browser client does. */
    saleOp(items, { discount = 0, soldAt = new Date().toISOString() } = {}) {
      this.counter += 1;
      const priced = items.map((i) => ({
        itemId: ulid(),
        variantId: i.variantId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: 0,
      }));
      const subtotal = priced.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const total = subtotal - discount;
      return {
        opId: ulid(),
        type: "sale.create",
        at: soldAt,
        payload: {
          saleId: ulid(),
          billNumber: formatBillNumber(this.code, this.counter),
          soldAt,
          discount,
          items: priced,
          payments: [{ paymentId: ulid(), method: "cash", amount: total }],
        },
      };
    },
  };
}

const pushBatch = (token, device, ops, cursor = null) =>
  api("/sync", {
    method: "POST", token,
    body: { deviceId: device.id, deviceCode: device.code, deviceLabel: device.label, ops, cursor },
  });

/* --------------------------------------------------------------------- */

async function main() {
  await reset();
  const fx = await seed();

  // docs/02 worked example setup: 50 @ Rs.10 then 50 @ Rs.12.
  const bill = await receive(fx, [{ qty: 50, unitCost: 10 }, { qty: 50, unitCost: 12 }]);

  // The concurrency test's variant: a single layer of 5 units.
  const bill2 = await ProductBillsRepo.createBill({
    retailerId: fx.retailer.id, distributorId: fx.distributor.id, variantId: fx.variant2.id,
  });
  await db.transaction((tx) => ProductBillsRepo.recordReceipt(tx, {
    productBillId: bill2.id, orderId: crypto.randomUUID(), variantId: fx.variant2.id,
    qty: 5, unitCost: "30",
  }));
  await db.insert(inventory).values({
    retailerId: fx.retailer.id, variantId: fx.variant2.id, qty: 5,
  });

  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, r));

  const login = await api("/retailers/login", {
    method: "POST", body: { email: "till@verify.local", password: "verify-pass" },
  });
  if (!login.body.token) throw new Error(`Login failed: ${JSON.stringify(login.body)}`);
  const token = login.body.token;

  /* ------------------------------------------------------------------ */
  section("1. docs/02 worked example, sold through the OFFLINE sync path");
  /* ------------------------------------------------------------------ */

  const till = makeDevice("Front counter");
  const sellOp = till.saleOp([{ variantId: fx.variant.id, quantity: 60, unitPrice: 20 }]);

  const first = await pushBatch(token, till, [sellOp]);
  check("op status", first.body.results?.[0]?.status, "applied");
  check("no failure", first.body.failed, null);
  check("device bill number honoured", first.body.results[0].data.billNumber,
        formatBillNumber(till.code, 1));

  const pay = await api(`/product-bills/${bill.id}/pay`, {
    method: "POST", token, body: { amount: 500, paymentMethod: "upi" },
  });
  if (pay.status !== 200) console.log("   (pay response)", pay.status, pay.body);

  const afterPay = await billState(bill.id);
  console.log("\n  Position after selling 60 and paying Rs.500:");
  check("amount due (Rs.620 = 50x10 + 10x12)", afterPay.due, 620);
  check("consignment held (Rs.480 = 40 x Rs.12)", afterPay.consignment, 480);
  check("outstanding (620 - 500)", afterPay.outstanding, 120);
  check("total exposure (120 + 480 = 600)", afterPay.outstanding + afterPay.consignment, 600);
  check("qty sold", afterPay.qtySold, 60);
  check("qty unsold", afterPay.qtyUnsold, 40);
  check("shelf", await shelfQty(fx.retailer.id, fx.variant.id), 40);

  /* ------------------------------------------------------------------ */
  section("2. REPLAY the identical batch - must be a no-op");
  /* ------------------------------------------------------------------ */

  const before = {
    sales: await saleCount(),
    shelf: await shelfQty(fx.retailer.id, fx.variant.id),
    bill: await billState(bill.id),
  };

  // Byte-identical resend, three times, the way a device with a flaky uplink
  // would retry a batch whose response it never saw.
  const replay1 = await pushBatch(token, till, [sellOp]);
  const replay2 = await pushBatch(token, till, [sellOp, sellOp]);
  const replay3 = await pushBatch(token, till, [sellOp]);

  const after = {
    sales: await saleCount(),
    shelf: await shelfQty(fx.retailer.id, fx.variant.id),
    bill: await billState(bill.id),
  };

  check("replay acknowledged as duplicate", replay1.body.results[0].status, "duplicate");
  check("duplicate carries the original result",
        replay1.body.results[0].data.billNumber, formatBillNumber(till.code, 1));
  check("same op twice within one batch is also deduped",
        replay2.body.results.map((r) => r.status), ["duplicate", "duplicate"]);
  check("third replay still a duplicate", replay3.body.results[0].status, "duplicate");
  check("sale count unchanged", after.sales, before.sales);
  check("shelf qty unchanged", after.shelf, before.shelf);
  check("product bill totals unchanged", after.bill, before.bill);

  /* ------------------------------------------------------------------ */
  section("3. A batch stops at the first failure and names the op");
  /* ------------------------------------------------------------------ */

  const good1 = till.saleOp([{ variantId: fx.variant.id, quantity: 1, unitPrice: 20 }]);
  const bad = {
    opId: ulid(), type: "sale.create", at: new Date().toISOString(),
    payload: {
      saleId: ulid(), billNumber: formatBillNumber(till.code, 900),
      items: [{ itemId: ulid(), variantId: crypto.randomUUID(), quantity: 1, unitPrice: 5 }],
      payments: [{ paymentId: ulid(), method: "cash", amount: 5 }],
    },
  };
  const good2 = till.saleOp([{ variantId: fx.variant.id, quantity: 1, unitPrice: 20 }]);

  const salesBeforeBatch = await saleCount();
  const batch = await pushBatch(token, till, [good1, bad, good2]);

  check("ops before the failure applied", batch.body.results.map((r) => r.status), ["applied"]);
  check("failure names the op", batch.body.failed?.opId, bad.opId);
  check("only the first op landed", (await saleCount()) - salesBeforeBatch, 1);

  // The device fixes nothing and retries: op 1 dedupes, the bad op still
  // fails, and op 3 is still queued behind it. Nothing is skipped.
  const retry = await pushBatch(token, till, [good1, bad, good2]);
  check("retry dedupes the applied op", retry.body.results.map((r) => r.status), ["duplicate"]);
  check("retry stops on the same op", retry.body.failed?.opId, bad.opId);

  // Drop the bad op (the shop deleted a queued sale it could not fix) and the
  // queue drains.
  const drained = await pushBatch(token, till, [good1, good2]);
  check("queue drains once the bad op is gone",
        drained.body.results.map((r) => r.status), ["duplicate", "applied"]);

  /* ------------------------------------------------------------------ */
  section("4. Two devices sell the same variant concurrently - both stand");
  /* ------------------------------------------------------------------ */

  const tillA = makeDevice("Counter A");
  const tillB = makeDevice("Counter B");

  // 5 units on the shelf. Each device, seeing a stale cache, sells 4.
  const opA = tillA.saleOp([{ variantId: fx.variant2.id, quantity: 4, unitPrice: 45 }]);
  const opB = tillB.saleOp([{ variantId: fx.variant2.id, quantity: 4, unitPrice: 45 }]);

  const [resA, resB] = await Promise.all([
    pushBatch(token, tillA, [opA]),
    pushBatch(token, tillB, [opB]),
  ]);

  check("device A's sale stands", resA.body.results[0].status, "applied");
  check("device B's sale stands", resB.body.results[0].status, "applied");
  check("both bill numbers issued, and they differ",
        resA.body.results[0].data.billNumber !== resB.body.results[0].data.billNumber, true);

  const { rows: [salesForVariant2] } = await db.execute(sql`
    SELECT count(*)::int AS n, sum(quantity)::int AS q
    FROM sale_items WHERE variant_id = ${fx.variant2.id}
  `);
  check("both sale lines exist", salesForVariant2.n, 2);
  check("8 units sold in total", salesForVariant2.q, 8);
  check("on-hand went negative (5 - 8), nothing was silently dropped",
        await shelfQty(fx.retailer.id, fx.variant2.id), -3);

  const b2 = await billState(bill2.id);
  check("only the 5 units that had cost layers accrued (5 x Rs.30)", b2.due, 150);
  check("consignment fully consumed", b2.consignment, 0);

  /* ------------------------------------------------------------------ */
  section("5. A void is the exact inverse of its sale");
  /* ------------------------------------------------------------------ */

  const voidTill = makeDevice("Counter V");
  const toVoid = voidTill.saleOp([{ variantId: fx.variant.id, quantity: 5, unitPrice: 20 }]);

  const beforeVoid = { shelf: await shelfQty(fx.retailer.id, fx.variant.id), bill: await billState(bill.id) };
  await pushBatch(token, voidTill, [toVoid]);
  const midVoid = { shelf: await shelfQty(fx.retailer.id, fx.variant.id), bill: await billState(bill.id) };
  check("selling 5 more accrues 5 x Rs.12", midVoid.bill.due - beforeVoid.bill.due, 60);

  const voidOp = {
    opId: ulid(), type: "sale.void", at: new Date().toISOString(),
    payload: { saleId: toVoid.payload.saleId, reason: "customer returned everything" },
  };
  const voided = await pushBatch(token, voidTill, [voidOp]);
  check("void applied", voided.body.results[0].status, "applied");
  check("sale marked voided, not deleted", voided.body.results[0].data.status, "voided");

  const afterVoid = { shelf: await shelfQty(fx.retailer.id, fx.variant.id), bill: await billState(bill.id) };
  check("shelf restored", afterVoid.shelf, beforeVoid.shelf);
  check("bill restored exactly", afterVoid.bill, beforeVoid.bill);

  const replayVoid = await pushBatch(token, voidTill, [voidOp]);
  check("replayed void is a duplicate", replayVoid.body.results[0].status, "duplicate");
  check("replayed void changed nothing", await billState(bill.id), afterVoid.bill);

  /* ------------------------------------------------------------------ */
  section("6. The pull side: changed rows and a moving cursor");
  /* ------------------------------------------------------------------ */

  const pull1 = await pushBatch(token, till, []);
  check("first pull returns the whole shelf", pull1.body.changed.sellable.length >= 2, true);
  check("cursor issued", typeof pull1.body.cursor, "string");

  const pull2 = await pushBatch(token, till, [], pull1.body.cursor);
  check("nothing changed since, so nothing is re-sent", pull2.body.changed.sellable.length, 0);

  const moved = till.saleOp([{ variantId: fx.variant.id, quantity: 1, unitPrice: 20 }]);
  await pushBatch(token, till, [moved], pull2.body.cursor);
  const pull3 = await pushBatch(token, till, [], pull2.body.cursor);
  check("the variant that moved comes back", pull3.body.changed.sellable.length, 1);

  /* ------------------------------------------------------------------ */
  console.log(`\n${"=".repeat(72)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log("=".repeat(72));

  server.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
