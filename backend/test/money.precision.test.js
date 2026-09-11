// test/money.precision.test.js
//
// Pins P5-15: ledger.amount/ledger.balance are numeric(10,2) (max magnitude
// ~99,999,999.99) while product_bills (and invoices) that feed them are
// numeric(14,2). A representable, real outstanding balance can overflow the
// row that is supposed to record a payment against it - the payment
// transaction rolls back entirely with a Postgres numeric field overflow.
//
// Fixed by Phase 5 (migration 0011): widen ledger.amount/balance to
// numeric(14,2) to match product_bills/invoices.
//
// Expected RED until then: POST /product-bills/:billId/pay against a bill
// whose outstanding balance exceeds numeric(10,2)'s ceiling fails with a
// Postgres overflow instead of succeeding.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, and } from "drizzle-orm";
import { db } from "../src/config/postgres.js";
import { productBills, ledger } from "../src/db/schema.js";
import {
  startTestServer,
  stopTestServer,
  resetDb,
  apiRequest,
  seedRetailer,
  seedDistributor,
  seedDistributorship,
  seedProduct,
  seedVariant,
} from "./helpers.js";

let server;
let baseUrl;

before(async () => {
  await resetDb();
  ({ server, baseUrl } = await startTestServer());
});

after(async () => {
  await stopTestServer(server);
});

test("a payment against a bill above numeric(10,2) but within numeric(14,2) does not overflow the ledger (P5-15)", async () => {
  const retailer = await seedRetailer();
  const distributor = await seedDistributor();
  const ship = await seedDistributorship();
  const product = await seedProduct(ship.id);
  const variant = await seedVariant(product.id);

  // 123,456,789.01 - 9 integer digits + 2 decimal = 11 significant digits.
  // numeric(10,2) tops out at 99,999,999.99 (8 integer digits + 2 decimal =
  // 10), so this overflows it outright. product_bills.outstanding_balance is
  // declared numeric(14,2) (12 integer digits + 2 decimal), which holds this
  // comfortably - it is the *ledger* row, not the bill, that is under-sized.
  const OUTSTANDING = "123456789.01";
  const PAY_AMOUNT = 1000.0; // leaves ~123,455,789 - still way over the (10,2)
  // ceiling, so the resulting balance also can't sneak back under it and
  // mask the bug.

  const [bill] = await db
    .insert(productBills)
    .values({
      retailerId: retailer.profile.id,
      distributorId: distributor.profile.id,
      variantId: variant.id,
      outstandingBalance: OUTSTANDING,
      totalAmountDue: OUTSTANDING,
      totalAmountPaid: "0",
      totalQuantityDelivered: 1,
      qtyReceivedUnsold: 0,
      amountReceivedNotDue: "0",
      qtySold: 1,
    })
    .returning();

  const res = await apiRequest(baseUrl, {
    method: "POST",
    path: `/product-bills/${bill.id}/pay`,
    token: retailer.token,
    body: { amount: PAY_AMOUNT, paymentMethod: "upi" },
  });

  assert.equal(
    res.status,
    200,
    `payment against a large-but-valid bill must not fail with a Postgres numeric ` +
      `overflow; got ${res.status}: ${JSON.stringify(res.body)}`
  );

  const expectedBalance = Number(OUTSTANDING) - PAY_AMOUNT;

  const [ledgerRow] = await db
    .select()
    .from(ledger)
    .where(and(eq(ledger.billId, bill.id), eq(ledger.type, "credit")));

  assert.ok(ledgerRow, "expected a ledger row to have been created for the payment");
  assert.ok(
    Math.abs(Number(ledgerRow.balance) - expectedBalance) < 0.01,
    `ledger.balance (${ledgerRow.balance}) does not reflect the correct resulting ` +
      `balance (${expectedBalance})`
  );

  const [refreshedBill] = await db
    .select()
    .from(productBills)
    .where(eq(productBills.id, bill.id));
  assert.ok(
    Math.abs(Number(refreshedBill.outstandingBalance) - expectedBalance) < 0.01,
    `product_bills.outstanding_balance (${refreshedBill.outstandingBalance}) does not ` +
      `reflect the correct resulting balance (${expectedBalance})`
  );
});
