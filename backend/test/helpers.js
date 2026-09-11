// test/helpers.js
//
// Shared test harness, extracted from scripts/verify_offline_sync.js (which
// already boots the real app.js over real HTTP against real Postgres and
// asserts on data - this pulls that pattern out so individual *.test.js
// files don't each reinvent it).
//
// Phase 6 of docs/../plans/squishy-rolling-seahorse.md.

import http from "http";
import bcrypt from "bcrypt";
import { db } from "../src/config/postgres.js";
import app from "../src/app.js";
import { sql } from "drizzle-orm";
import {
  users,
  retailers,
  distributors,
  deliveryAgents,
  distributorships,
  products,
  productVariants,
} from "../src/db/schema.js";
import { signToken } from "../src/utils/jwt.js";

// Matches modules/auth/auth.service.js's SALT_ROUNDS constant.
const SALT_ROUNDS = 10;

/* ------------------------------------------------------------------ */
/* Server lifecycle                                                    */
/* ------------------------------------------------------------------ */

/**
 * Boots the real app on an OS-assigned port (0), so it can never collide
 * with scripts/verify_offline_sync.js's fixed VERIFY_PORT or with another
 * test file running in a separate process.
 */
export async function startTestServer() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

export function stopTestServer(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) return resolve();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

/* ------------------------------------------------------------------ */
/* Database reset                                                      */
/* ------------------------------------------------------------------ */

/**
 * TRUNCATEs every table the test suite touches. Gated behind the exact same
 * VERIFY_I_KNOW_THIS_TRUNCATES=1 guard scripts/verify_offline_sync.js uses,
 * so `npm test` can never be pointed at a real/shared database by accident -
 * this throws rather than silently skipping the reset, because running
 * tests against whatever dirty data happens to be sitting in the DB is worse
 * than refusing to run at all.
 */
export async function resetDb() {
  if (process.env.VERIFY_I_KNOW_THIS_TRUNCATES !== "1") {
    throw new Error(
      "resetDb() refuses to run: this TRUNCATEs every table the test suite " +
        "touches. Set VERIFY_I_KNOW_THIS_TRUNCATES=1 and point POSTGRES_URL " +
        "at a throwaway database (same guard scripts/verify_offline_sync.js " +
        "uses) before running `npm test`."
    );
  }

  await db.execute(sql`
    TRUNCATE TABLE
      sync_ops, sync_devices,
      sale_payments, sale_items, sales, customers, retail_prices,
      product_bill_layers, product_bill_transactions, product_delivery_log,
      invoice_items, invoices,
      product_bills, ledger, outbox, inventory,
      distributor_inventory, order_delivery_codes, deliveries,
      order_items, orders, carts,
      product_variants, products, distributorships,
      otp_codes, connections, connection_requests,
      delivery_agents, retailers, distributors, users
    RESTART IDENTITY CASCADE
  `);
}

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */

let seedCounter = 0;
function uniqueTag(prefix) {
  seedCounter += 1;
  return `${prefix}${Date.now()}${seedCounter}`;
}

async function insertUser(role) {
  const password = await bcrypt.hash("test-pass-123", SALT_ROUNDS);
  const [user] = await db
    .insert(users)
    .values({
      role,
      email: `${uniqueTag(role)}@test.local`,
      password,
      phone: uniqueTag("9").slice(0, 10),
    })
    .returning();
  return user;
}

/**
 * Mints a token the same way the real login/register flows do. Includes
 * tokenVersion defensively: Phase 3 (session invalidation) adds a
 * users.tokenVersion column and requireAuth checks it, but only if the
 * field is present in the payload. Until that column exists,
 * `user.tokenVersion` is simply undefined and this falls back to 0, so the
 * same helper works whether Phase 3 has landed in a given worktree or not.
 */
function tokenFor(user) {
  return signToken({
    id: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion ?? 0,
  });
}

export async function seedRetailer(overrides = {}) {
  const user = await insertUser("retailer");
  const [profile] = await db
    .insert(retailers)
    .values({
      userId: user.id,
      businessName: "Test Retail",
      ownerName: "Test Owner",
      businessType: "kirana",
      pincode: "560001",
      ...overrides,
    })
    .returning();
  return { user, profile, token: tokenFor(user) };
}

export async function seedDistributor(overrides = {}) {
  const user = await insertUser("distributor");
  const [profile] = await db
    .insert(distributors)
    .values({
      userId: user.id,
      companyName: "Test Distribution",
      ownerName: "Test Owner",
      businessType: "wholesale",
      pincode: "560001",
      ...overrides,
    })
    .returning();
  return { user, profile, token: tokenFor(user) };
}

export async function seedAgent(overrides = {}) {
  const user = await insertUser("delivery_agent");
  const [profile] = await db
    .insert(deliveryAgents)
    .values({
      userId: user.id,
      name: "Test Agent",
      phone: uniqueTag("9").slice(0, 10),
      ...overrides,
    })
    .returning();
  return { user, profile, token: tokenFor(user) };
}

/** Minimal catalogue chain, used by tests that need a real variant to hang a
 * product_bills / distributor_inventory row off. */
export async function seedDistributorship(overrides = {}) {
  const [row] = await db
    .insert(distributorships)
    .values({
      name: uniqueTag("Distributorship-"),
      description: null,
      ...overrides,
    })
    .returning();
  return row;
}

export async function seedProduct(distributorshipId, overrides = {}) {
  const [row] = await db
    .insert(products)
    .values({
      distributorshipId,
      name: "Test Product",
      category: null,
      subcategory: null,
      ...overrides,
    })
    .returning();
  return row;
}

export async function seedVariant(productId, overrides = {}) {
  const [row] = await db
    .insert(productVariants)
    .values({
      productId,
      name: "Default",
      sku: uniqueTag("SKU-"),
      mrp: "10.00",
      unit: "packet",
      gstRate: "0",
      ...overrides,
    })
    .returning();
  return row;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                 */
/* ------------------------------------------------------------------ */

export async function apiRequest(baseUrl, { method = "GET", path, token, body } = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}
