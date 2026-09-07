/**
 * e2e/pos.offline.e2e.js
 *
 * The offline POS, proved in a real browser. Real Chrome, real service worker,
 * real IndexedDB, the network genuinely cut at the browser.
 *
 * This exists because compile-time checks do not find these bugs. Three
 * separate defects in this repository passed every static check and were
 * caught only by running the app - most recently a precache entry that made
 * the service worker fail to install on every load, leaving no offline app at
 * all behind a perfectly working online one.
 *
 * WHAT IT ASSERTS
 *   A  the shelf arrives over the /sync pull
 *   B  network killed: three sales rung up, bill numbers issued with no
 *      server, on-hand already net of the queue, the server hears nothing
 *   C  reload WHILE OFFLINE still opens the app, queue intact
 *   D  network back: all three arrive exactly once; then every op is
 *      force-resent and nothing moves
 *   E  two browser profiles = two devices selling the same variant offline;
 *      both sales stand, on-hand goes negative, no bill-number collision
 *   F  docs/02's worked example end to end: due 620 / consignment 480 /
 *      outstanding 120
 *
 * RUNNING IT - nothing here touches a real database or a real server.
 *
 *   # 1. throwaway Postgres on a non-standard port
 *   docker run -d --name sledje-verify -e POSTGRES_PASSWORD=scratch \
 *     -e POSTGRES_USER=scratch -e POSTGRES_DB=sledje_offline \
 *     -p 55432:5432 postgres:15
 *
 *   # 2. schema + fixtures
 *   cd backend
 *   export POSTGRES_URL=postgresql://scratch:scratch@localhost:55432/sledje_offline
 *   npx drizzle-kit migrate
 *   VERIFY_I_KNOW_THIS_TRUNCATES=1 node scripts/seed_offline_demo.js
 *
 *   # 3. API on 5599
 *   JWT_SECRET=verify-secret PORT=5599 CLIENT_ORIGIN=http://localhost:4173 \
 *     node src/server.js &
 *
 *   # 4. the PRODUCTION build, served - the service worker only exists here
 *   cd ../frontend
 *   VITE_API_URL=http://localhost:5599 npm run build
 *   npx vite preview --port 4173 --strictPort &
 *
 *   # 5. run it   (Chrome: `npx playwright install chrome`, or a system one)
 *   npm run test:e2e
 *
 * Re-seed (step 2's last line) before every run - it mutates as it goes.
 */
const { chromium } = require("playwright");
const { Client } = require("../../backend/node_modules/pg");

const APP = "http://localhost:4173";
const API = "http://localhost:5599";
const PG = "postgresql://scratch:scratch@localhost:55432/sledje_offline";

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
};
const section = (t) => console.log(`\n${"=".repeat(72)}\n${t}\n${"=".repeat(72)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pg;
const q = async (sql, params = []) => (await pg.query(sql, params)).rows;

async function login() {
  const res = await fetch(`${API}/retailers/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "till@verify.local", password: "verify-pass" }),
  });
  const body = await res.json();
  if (!body.token) throw new Error("login failed: " + JSON.stringify(body));
  return body;
}

/** A fresh browser context = a fresh device: its own IndexedDB, its own ULID. */
async function openTill(browser, auth, name) {
  const context = await browser.newContext();
  await context.addInitScript(([token, user]) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", user);
    localStorage.setItem("isAuthenticated", "true");
  }, [auth.token, JSON.stringify(auth.user)]);

  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`  [${name}] PAGE ERROR: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") console.log(`  [${name}] console.error: ${m.text()}`); });

  await page.goto(`${APP}/retailer/pos`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="sync-status"]', { timeout: 15000 });
  // The service worker must be ACTIVE before we cut the network, or the
  // offline reload has no shell to come from.
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistrations()).some((r) => r.active),
    null, { timeout: 20000 }
  );
  return { context, page, name };
}

/** Add one line to the cart through the real modal, then check out. */
async function ringUp(page, { search, qty, pay }) {
  await page.getByRole("button", { name: /Add items/i }).click();
  await page.getByPlaceholder("Search your shelf…").fill(search);
  // The modal's own quantity box (w-16), NOT the POS page's discount field -
  // both are input[type=number] and the page one comes first in the DOM.
  await page.locator('input.w-16[type="number"]').fill(String(qty));
  await page.locator("button", { hasText: "in stock" }).first().click();
  await page.getByRole("button", { name: /Add \d+ to sale/ }).click();

  await page.locator('input[placeholder="0"]').first().fill(String(pay));
  await page.getByRole("button", { name: /Complete sale/i }).click();
  await page.waitForSelector("text=/Sale .* recorded/", { timeout: 10000 });
}

const pendingCount = (page) =>
  page.locator('[data-testid="pending-count"]').innerText().then(Number);

const waitForPending = (page, n, timeout = 20000) =>
  page.waitForFunction(
    (want) => document.querySelector('[data-testid="pending-count"]')?.textContent.trim() === String(want),
    n, { timeout }
  );

async function main() {
  pg = new Client({ connectionString: PG });
  await pg.connect();

  const auth = await login();
  const browser = await chromium.launch({ channel: "chrome" });

  /* ---------------------------------------------------------------- */
  section("A. The counter opens, and the shelf comes from the sync pull");
  /* ---------------------------------------------------------------- */

  const till = await openTill(browser, auth, "till-A");
  await till.page.waitForFunction(
    () => document.body.innerText.includes("All sales saved"), null, { timeout: 15000 }
  );
  check("nothing queued on a fresh till", await pendingCount(till.page), 0);

  await till.page.getByRole("button", { name: /Add items/i }).click();
  await till.page.getByPlaceholder("Search your shelf…").fill("100g");
  const stockText = await till.page.locator("button", { hasText: "in stock" }).first().innerText();
  check("shelf arrived over /sync, showing 100 in stock", /100 in stock/.test(stockText), true);
  await till.page.getByRole("button", { name: "Cancel" }).click();

  /* ---------------------------------------------------------------- */
  section("B. KILL THE NETWORK. Three sales. Nothing may be lost.");
  /* ---------------------------------------------------------------- */

  await till.context.setOffline(true);
  await till.page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await till.page.waitForFunction(
    () => document.body.innerText.includes("Offline"), null, { timeout: 10000 }
  );
  console.log("  (browser is offline)");

  const salesBefore = Number((await q("SELECT count(*)::int n FROM sales"))[0].n);

  for (let i = 1; i <= 3; i++) {
    await ringUp(till.page, { search: "100g", qty: 2, pay: 40 });
    console.log(`  rang up offline sale ${i}`);
  }

  await waitForPending(till.page, 3);
  check("three sales queued on the device", await pendingCount(till.page), 3);
  check("three 'queued' chips in history",
        await till.page.locator('[data-testid="sale-pending"]').count(), 3);
  check("server has heard nothing",
        Number((await q("SELECT count(*)::int n FROM sales"))[0].n), salesBefore);

  const billNumbers = await till.page.locator(".divide-y > div > button p.text-sm.font-medium").allInnerTexts();
  console.log("  bill numbers issued with no server:", billNumbers.slice(0, 3).join(", "));
  check("bill numbers were issued offline", billNumbers.slice(0, 3).every((b) => /^[0-9A-Z]{6}-\d{5}$/.test(b.trim())), true);

  // Stock shown must already reflect the queued sales - not the server's
  // stale 100.
  await till.page.getByRole("button", { name: /Add items/i }).click();
  await till.page.getByPlaceholder("Search your shelf…").fill("100g");
  const offlineStock = await till.page.locator("button", { hasText: "in stock" }).first().innerText();
  check("on-hand already net of queued sales (100 - 6)", /94 in stock/.test(offlineStock), true);
  await till.page.getByRole("button", { name: "Cancel" }).click();

  /* ---------------------------------------------------------------- */
  section("C. Reload the app WHILE OFFLINE - it must still open");
  /* ---------------------------------------------------------------- */

  await till.page.reload({ waitUntil: "domcontentloaded" });
  await till.page.waitForSelector('[data-testid="sync-status"]', { timeout: 15000 });
  check("app shell served from the service worker cache",
        await till.page.locator("h1", { hasText: "Point of Sale" }).count(), 1);
  check("the three queued sales survived the reload",
        await till.page.locator('[data-testid="sale-pending"]').count(), 3);
  check("queue depth survived the reload", await pendingCount(till.page), 3);

  /* ---------------------------------------------------------------- */
  section("D. Network back. All three arrive, exactly once.");
  /* ---------------------------------------------------------------- */

  await till.context.setOffline(false);
  await till.page.evaluate(() => window.dispatchEvent(new Event("online")));

  await till.page.waitForFunction(
    () => document.querySelector('[data-testid="pending-count"]')?.textContent.trim() === "0",
    null, { timeout: 20000 }
  );

  check("queue drained", await pendingCount(till.page), 0);
  check("all three chips now say synced",
        await till.page.locator('[data-testid="sale-synced"]').count(), 3);

  const landed = await q("SELECT count(*)::int n, sum(total)::float t FROM sales WHERE status='completed'");
  check("exactly three sales on the server", landed[0].n, salesBefore + 3);
  check("totals are right (3 x Rs.40)", landed[0].t, 120);

  const units = await q("SELECT sum(quantity)::int q FROM sale_items");
  check("six units sold, not twelve", units[0].q, 6);

  const shelf = await q(
    "SELECT qty FROM inventory i JOIN product_variants v ON v.id=i.variant_id WHERE v.sku='PARLE-G-100G'"
  );
  check("server shelf decremented once (100 - 6)", shelf[0].qty, 94);

  const ops = await q("SELECT count(*)::int n FROM sync_ops WHERE type='sale.create'");
  check("three ops recorded in the exactly-once ledger", ops[0].n, 3);

  // Force a re-send of everything the device has ever queued, the way a device
  // whose acks were lost would.
  await till.page.evaluate(async () => {
    const req = indexedDB.open("sledje-pos");
    await new Promise((res) => { req.onsuccess = res; });
    const db = req.result;
    await new Promise((res) => {
      const tx = db.transaction("acks", "readwrite");
      tx.objectStore("acks").clear();
      tx.oncomplete = res;
    });
    db.close();
  });
  await till.page.reload({ waitUntil: "networkidle" });
  await till.page.waitForSelector('[data-testid="sync-status"]');
  await sleep(4000);

  const afterReplay = await q("SELECT count(*)::int n FROM sales WHERE status='completed'");
  const shelfAfter = await q(
    "SELECT qty FROM inventory i JOIN product_variants v ON v.id=i.variant_id WHERE v.sku='PARLE-G-100G'"
  );
  check("re-sending every op changed nothing", afterReplay[0].n, salesBefore + 3);
  check("...and the shelf did not move again", shelfAfter[0].qty, 94);

  /* ---------------------------------------------------------------- */
  section("E. Two devices, offline, selling the same thing");
  /* ---------------------------------------------------------------- */

  const a = await openTill(browser, auth, "counter-A");
  const b = await openTill(browser, auth, "counter-B");
  await Promise.all([
    a.page.waitForFunction(() => document.body.innerText.includes("All sales saved"), null, { timeout: 15000 }),
    b.page.waitForFunction(() => document.body.innerText.includes("All sales saved"), null, { timeout: 15000 }),
  ]);

  const deviceIds = await Promise.all([a, b].map(({ page }) =>
    page.evaluate(async () => {
      const req = indexedDB.open("sledje-pos");
      await new Promise((res) => { req.onsuccess = res; });
      const db = req.result;
      const v = await new Promise((res) => {
        const r = db.transaction("meta").objectStore("meta").get("deviceId");
        r.onsuccess = () => res(r.result?.value);
      });
      db.close();
      return v;
    })
  ));
  check("the two profiles really are two devices", deviceIds[0] !== deviceIds[1], true);

  const before250 = await q(
    "SELECT qty FROM inventory i JOIN product_variants v ON v.id=i.variant_id WHERE v.sku='PARLE-G-250G'"
  );

  for (const till of [a, b]) {
    await till.context.setOffline(true);
    await till.page.evaluate(() => window.dispatchEvent(new Event("offline")));
  }
  // Each sells 20 of the 30 on the shelf, neither knowing about the other.
  await ringUp(a.page, { search: "250g", qty: 20, pay: 900 });
  await ringUp(b.page, { search: "250g", qty: 20, pay: 900 });
  console.log("  both counters sold 20 of the 30 on the shelf, offline");

  for (const till of [a, b]) {
    await till.context.setOffline(false);
    await till.page.evaluate(() => window.dispatchEvent(new Event("online")));
  }
  await Promise.all([a, b].map(({ page }) =>
    page.waitForFunction(
      () => document.querySelector('[data-testid="pending-count"]')?.textContent.trim() === "0",
      null, { timeout: 20000 })
  ));

  const both = await q(`
    SELECT count(*)::int n, sum(si.quantity)::int q
    FROM sale_items si JOIN product_variants v ON v.id = si.variant_id
    WHERE v.sku = 'PARLE-G-250G'`);
  check("both sales survived", both[0].n, 2);
  check("all 40 units are on the record", both[0].q, 40);

  const after250 = await q(
    "SELECT qty FROM inventory i JOIN product_variants v ON v.id=i.variant_id WHERE v.sku='PARLE-G-250G'"
  );
  check("on-hand went negative rather than a sale being refused",
        after250[0].qty, before250[0].qty - 40);

  const distinctBills = await q(`
    SELECT count(DISTINCT s.bill_number)::int n FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    JOIN product_variants v ON v.id = si.variant_id WHERE v.sku='PARLE-G-250G'`);
  check("two distinct bill numbers, no collision", distinctBills[0].n, 2);

  const reconcile = await a.page.locator("text=/stock you did not have on record/").count()
    + await b.page.locator("text=/stock you did not have on record/").count();
  check("at least one counter is prompted to reconcile", reconcile >= 1, true);

  /* ---------------------------------------------------------------- */
  section("F. docs/02's worked example is still exact");
  /* ---------------------------------------------------------------- */

  // 100g: received 50 @ 10 and 50 @ 12; 6 units sold above. Sell 54 more to
  // reach 60 total, then pay Rs.500.
  await ringUp(till.page, { search: "100g", qty: 54, pay: 1080 });
  await till.page.waitForFunction(
    () => document.querySelector('[data-testid="pending-count"]')?.textContent.trim() === "0",
    null, { timeout: 20000 }
  );

  const [bill] = await q(`
    SELECT pb.id, pb.total_amount_due::float due, pb.amount_received_not_due::float consignment,
           pb.outstanding_balance::float outstanding, pb.qty_sold
    FROM product_bills pb JOIN product_variants v ON v.id = pb.variant_id
    WHERE v.sku = 'PARLE-G-100G'`);

  check("60 units sold in total", bill.qty_sold, 60);
  check("amount due Rs.620 (50 x 10 + 10 x 12)", bill.due, 620);
  check("consignment held Rs.480 (40 x 12)", bill.consignment, 480);

  const payRes = await fetch(`${API}/product-bills/${bill.id}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ amount: 500, paymentMethod: "upi" }),
  });
  if (!payRes.ok) console.log("  (pay failed)", payRes.status, await payRes.text());

  const [paid] = await q(`
    SELECT total_amount_due::float due, amount_received_not_due::float consignment,
           outstanding_balance::float outstanding
    FROM product_bills pb JOIN product_variants v ON v.id = pb.variant_id
    WHERE v.sku = 'PARLE-G-100G'`);
  check("outstanding Rs.120 after paying Rs.500", paid.outstanding, 120);
  check("consignment still Rs.480", paid.consignment, 480);
  check("exposure Rs.600", paid.outstanding + paid.consignment, 600);

  console.log(`\n${"=".repeat(72)}\n${pass} passed, ${fail} failed\n${"=".repeat(72)}`);
  await browser.close();
  await pg.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); process.exit(1); });
