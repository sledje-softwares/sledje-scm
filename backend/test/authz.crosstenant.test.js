// test/authz.crosstenant.test.js
//
// Pins P5-2 (authorization fall-through: a delivery_agent token passes every
// ownership check because the if(role==="retailer")/if(role==="distributor")
// blocks have no `else`) and P5-3 (listInvoices applies no `where` clause at
// all for an unrecognised role, so it returns every invoice in the system -
// the single worst live finding in the remediation plan).
//
// Fixed by Phase 1 (resolveActor/assertParty, requireRole on these routers).
// Expected RED until Phase 1 lands: today a delivery_agent token gets 200 on
// every one of these, and GET /invoices includes the seeded invoice.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/postgres.js";
import { productBills, productBillTransactions, invoices } from "../src/db/schema.js";
import {
  startTestServer,
  stopTestServer,
  resetDb,
  apiRequest,
  seedRetailer,
  seedDistributor,
  seedAgent,
  seedDistributorship,
  seedProduct,
  seedVariant,
} from "./helpers.js";

let server;
let baseUrl;
let agent;
let bill;
let invoice;

before(async () => {
  await resetDb();
  ({ server, baseUrl } = await startTestServer());

  const retailer = await seedRetailer();
  const distributorA = await seedDistributor();
  agent = await seedAgent();

  const ship = await seedDistributorship();
  const product = await seedProduct(ship.id);
  const variant = await seedVariant(product.id);

  [bill] = await db
    .insert(productBills)
    .values({
      retailerId: retailer.profile.id,
      distributorId: distributorA.profile.id,
      variantId: variant.id,
      outstandingBalance: "100.00",
      totalAmountDue: "100.00",
      totalAmountPaid: "0",
      totalQuantityDelivered: 10,
      qtyReceivedUnsold: 0,
      amountReceivedNotDue: "0",
      qtySold: 10,
    })
    .returning();

  await db.insert(productBillTransactions).values({
    productBillId: bill.id,
    quantity: 10,
    unitPrice: "10.00",
    amount: "100.00",
    type: "accrual",
  });

  [invoice] = await db
    .insert(invoices)
    .values({
      retailerId: retailer.profile.id,
      distributorId: distributorA.profile.id,
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-01-31T23:59:59Z"),
      totalAmount: "100.00",
      status: "issued",
    })
    .returning();
});

after(async () => {
  await stopTestServer(server);
});

test("delivery agent gets 403 on a product bill it has no relationship to", async () => {
  const res = await apiRequest(baseUrl, {
    path: `/product-bills/${bill.id}`,
    token: agent.token,
  });
  assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
});

test("delivery agent gets 403 on that bill's ledger", async () => {
  const res = await apiRequest(baseUrl, {
    path: `/ledger/bill/${bill.id}`,
    token: agent.token,
  });
  assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
});

test("delivery agent gets 403 on the invoice", async () => {
  const res = await apiRequest(baseUrl, {
    path: `/invoices/${invoice.id}`,
    token: agent.token,
  });
  assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
});

test("delivery agent gets 403 on the invoice PDF", async () => {
  const res = await apiRequest(baseUrl, {
    path: `/invoices/${invoice.id}/pdf`,
    token: agent.token,
  });
  assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
});

test("GET /invoices as an unrecognised role never leaks another tenant's invoice (P5-3)", async () => {
  const res = await apiRequest(baseUrl, { path: "/invoices", token: agent.token });

  // Rejecting the whole request outright also satisfies the invariant -
  // what must never happen is a 200 that contains the seeded invoice.
  if (res.status === 403) return;

  assert.equal(res.status, 200, `unexpected status ${res.status}: ${JSON.stringify(res.body)}`);
  const list = Array.isArray(res.body?.data) ? res.body.data : [];
  const leaked = list.some((row) => row.id === invoice.id);
  assert.equal(
    leaked,
    false,
    "GET /invoices as a delivery_agent token returned another tenant's invoice - " +
      "today listInvoices applies no where clause at all for an unrecognised role"
  );
});
