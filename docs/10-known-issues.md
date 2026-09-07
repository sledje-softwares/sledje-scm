# Known Issues

> **Integration regression found and fixed (this session).** Moving stock/billing/ledger into
> `completeOrder` created a double-count: `retailerOrders.js` called `/orders/.../complete`
> *and then* `POST /inventory/checkout`, and both added the delivered quantity to the shelf, so
> **every completed order counted its stock twice**. This was invisible while testing the
> backend and frontend separately. Fixed on both sides: the UI no longer makes the second call,
> and `/inventory/checkout` is now a non-mutating deprecated endpoint so a stale deployed
> bundle (`frontend/build` still ships the old code) cannot corrupt stock either. Verified:
> a 10-unit order leaves the shelf at 10, and stays at 10 when the old endpoint is called.
> Also corrected the completion prompt, which told the retailer to enter a code "provided by
> the distributor" - the code is issued to the *retailer* at order creation.


> **Third pass (this session, continued).** Closed: `product_bills` had no foreign keys and no
> unique constraint (P1-15 - migration `0005` adds both; `createBill` now upserts via
> `onConflictDoNothing` + re-fetch, so a race is a graceful re-fetch instead of a silent split
> balance); connection approval was two unwrapped statements (P1-16 - now one transaction,
> verified: approve now always produces exactly one `connections` row); Socket.IO targeted
> delivery never matched, so every event broadcast to every client (P1-6 - sockets now also
> join an `entity:<profileId>` room resolved at connect time, and fan-out targets that room;
> **verified with a real socket.io-client**: a targeted `orders.created` reached the owning
> retailer and distributor and *not* a third, unrelated retailer); no role check on the
> frontend route guard (P1-7 - `PrivateRoute` takes `allowedRole` and redirects a
> wrong-role user to their own dashboard; fixed alongside it, a latent bug where `user.id` was
> unreadable from context because the profile was double-nested under `user.user`); missing
> `dotenv` in `drizzle.config.js` (P4-3); `invoice-pdf.js` not creating its output directory
> (P4-10); `/retailer/cart`'s crash fix from the prior pass verified further; `App.test.js`
> rewritten to a real assertion (P4-5 - partially fixed; see the entry for a newly-found,
> separate Jest/react-router-dom v7 resolution problem it surfaced). Fifteen further dead files
> deleted (5 frontend pages/components, 4 zero-byte stubs, `App.css`, `logo.svg`,
> `reportWebVitals.js`, plus `.DS_Store` untracked from git). `P1-8` (Drive uploads
> world-readable) was reviewed and deliberately left alone - public readability is correct for
> its only current use (profile pictures rendered without auth), so "fixing" it would break the
> feature; flagged here as a judgment call, not an oversight.


> **Second pass (this session, continued).** Also closed: no error-handling middleware
> (P1-5 - added `error.middleware.js`, classifying by message shape with a safeguard that
> native JS error types are never misclassified as client errors); unrestricted CORS
> (P1-4 - now scoped to `CLIENT_ORIGIN`, comma-separated, with a logged fallback when unset);
> `drizzleTest.js` logging `POSTGRES_URL` (P1-9); `outbox.markFailed` writing a nonexistent
> `error` column (P2-6 - column added via migration `0004`); the frontend `/retailer/cart`
> crash (P0-26 - the component now self-fetches when mounted without props, and
> `GET /cart/` was enriched with a catalogue + distributor join it previously lacked). Also
> consolidated the two independent inline JWT implementations into `utils/jwt.js`, wired the
> real crypto-random OTP generator (`utils/otp.js`) into `auth.service.js` in place of
> `Math.random()`, deleted `events/jetstream.js` (publisher consolidated onto
> `config/nats-streams.js`), and removed six dead/zero-byte files. Verified end to end
> including a fix found *by* this testing pass: the cart enrichment join initially referenced
> `distributors.phone`, a column that does not exist (phone lives on `users`) - caught because
> the error middleware surfaced it as a real error instead of the request silently doing
> nothing.


> **Stage 0, decisions 1-3 applied.** All three deferred decisions from the design-critique
> conversation have been resolved and executed, verified end to end against a live server on
> throwaway Postgres (+ NATS where relevant): **NATS eliminated from the critical path**
> (`src/consumers/`, `src/consumers1/`, the dead `backend/realtime/` duplicate all deleted;
> delivery -> stock -> product bill -> ledger is now one database transaction, triggered by a
> retailer-entered, server-verified delivery code rather than self-attestation); **the
> `modules/payments/` parallel implementation folded into `product-bills`** (clamp + ledger
> write) and deleted; **23/23 exercised endpoints return 2xx**, including the two that were
> previously broken specifically because of the payments duplication
> (`GET /ledger/bill/:billId`, overpayment clamping). The server now stays up and serves
> requests even when NATS is down.
>
> Not yet done: the full offline-first PWA (Dexie/service-worker/sync — see
> [16-offline-first.md](16-offline-first.md)) and the delivery-agent-as-a-third-actor login
> surface (the code mechanism is live; a distinct `delivery_agent` role/app is not — see
> [15-delivery-confirmation.md](15-delivery-confirmation.md)). Both are substantial, separately
> scoped builds, not Stage-0-sized fixes.


> **Stage 0 partially applied.** Defects marked ✅ **FIXED** below were repaired and verified
> end to end against a live server on a throwaway Postgres + NATS. After those fixes:
> **21/21 exercised endpoints return 2xx**, order creation and cart checkout both work, and
> order totals price correctly from `distributor_inventory`.
>
> Items still open are deliberately deferred: they live in code that
> [14-simplification.md](14-simplification.md) recommends deleting (the NATS consumer layer),
> or are gated on the `modules/payments/` keep-or-fold decision. Fixing them now would be work
> on code slated for removal.

Diagnosis only — this document does not prescribe fixes beyond naming the root cause. It is
the input to the stabilisation work described in
[13-migration-path.md](13-migration-path.md) Stage 0.

Severity:

| | Meaning |
|---|---|
| **P0** | Blocks a headline user flow. The feature cannot work at all. |
| **P1** | Security or data-integrity risk. |
| **P2** | Schema drift — code referencing columns that no longer exist. |
| **P3** | Duplication and dead code. Costs comprehension, not correctness. |
| **P4** | Packaging and tooling. |

---

## P0 — Blocks a headline flow

### The non-Drizzle API idiom

The single most common defect. Drizzle columns are not query builders: `col.eq(x)`,
`col.in(xs)`, `col.gte(x)` and `query.and(...)` are not real methods. The correct forms are
`eq(col, x)`, `inArray(col, xs)`, `gte(col, x)` and `and(...)` inside a single `.where()`.

Every site below throws `TypeError` at runtime:

| ID | File:line | Breaks |
|---|---|---|
| P0-1 | ✅ **FIXED** `modules/orders/orders.service.js:59` | **`POST /orders/create`** — throws before any DB write |
| P0-2 | ✅ **FIXED** `modules/orders/orders.service.js:161` | `PUT /orders/retailer/orders/:id/modify` |
| P0-3 | ✅ **FIXED** `modules/orders/orders.service.js:329` | `PUT /orders/distributor/orders/:id/process` (modify branch) |
| P0-4 | ✅ **FIXED** `modules/auth/auth.repository.js:29,50,70,92` | OTP reset — `findUserById`, `findRetailerByUserId`, `findDistributorByUserId`, `updatePassword` |
| P0-5 | ✅ **FIXED** `modules/notifications/notifications.service.js:13` | `GET /notifications/unread-count` |
| P0-6 | ✅ **FIXED** `modules/notifications/notifications.service.js:18` | `PUT /notifications/:id/read` — would also have updated *all* the user's notifications had it worked |
| P0-7 | ✅ **FIXED** `modules/distributorships/distributorships.repository.js:49` | `GET /api/distributorships/:id` for any distributorship with products |
| P0-8 | ✅ **FIXED** (moot - file/pattern deleted this session) `modules/payments/payments.repository.js:17` | `findBillByVariant` chains `.and(...)` off a query builder |
| P0-9 | ✅ **FIXED** `workers/settlement.worker.js:83-84` | Scheduled invoicing |

`modules/auth/auth.repository.js:getValidOtp` additionally does
`db.select().from(sql\`otp_codes\`)`, which is also invalid.

### Controller ↔ service name mismatches

| ID | File | Problem |
|---|---|---|
| P0-10 | ✅ **FIXED** `api-gateway/controllers/products.controller.js` | Calls `ProductsService.createProduct`, `.updateProduct`, `.deleteProduct`, `.bulkInsert`, `.getProductsFromConnectedDistributors`. The service exports `createCatalogProduct`, `updateCatalogProduct`, `deleteCatalogProduct`, `bulkImportForDistributor` — and has **no** connected-distributors method. **Five of seven product endpoints are dead.** |
| P0-11 | ✅ **FIXED** `modules/payments/payments.service.js` | Calls `PaymentsRepo.getBillById` and `.listTransactionsForBill`; neither exists on the repository. Breaks `getBill`, `getTransactions`, `payBill` — **and `LedgerService.getLedgerForBill`, which imports the same repo**, so the *mounted* `GET /ledger/bill/:billId` is dead. |
| P0-12 | ✅ **FIXED** (deleted with the consumer layer) `consumers/orders.consumer.js` | Calls `InventoryService.applyDeliveredOrder` and `ProductBillsService.applyDelivery`; neither exists. (The file is also not registered in `consumers/index.js`.) |

### The delivery → billing → ledger chain

| ID | File | Problem |
|---|---|---|
| P0-13 | ✅ **FIXED** (deleted; replaced by one transaction) `consumers/inventory.consumer.js` → `consumers/productBill.consumer.js:12` | The publisher emits `inventory.updated_after_order` **without an `items` field**; the consumer destructures `items` and iterates it → `TypeError: items is not iterable`. **This is where the chain actually stops.** |
| P0-14 | ✅ **FIXED** (deleted with the consumer layer) `consumers/inventory.consumer.js` | Writes `stock: productVariants.stock - item.quantity` — arithmetic on a Drizzle column object, not SQL, against a column dropped in migration `0001`. |
| P0-15 | ✅ **FIXED** (deleted; ledger write now inline and correct) `consumers/ledger.consumer.js` | Inserts `{ event, refId }`; neither column exists, and `ledger.type`, `.amount`, `.balance` are all NOT NULL. **Every insert fails.** |
| P0-16 | ✅ **FIXED** (deleted with the consumer layer) `consumers/utils/js-consumer.js` | `isDuplicate` queries table `event_dedup` column `message_id`; the schema defines `event_dedupe(event_id)`. Throws on **every** message, before the handler, killing the subscription loop. |
| P0-17 | ✅ **FIXED** (deleted with the consumer layer) `consumers/utils/dedupe.js` | Keys on `payload.eventId`, but **no publisher ever emits one**, so the key is always `undefined` and the second event violates the primary key. |

### Boot-order race — the consumer layer silently fails to start

| ID | File | Problem |
|---|---|---|
| P0-27 | ✅ **FIXED** (consumer layer deleted, not repaired) `src/server.js:20-23` | **Verified by running it.** `startAllConsumers()` is called without `await` and *before* the `EVENTS` stream exists — the stream is created as a side effect of `startSocketServer`. On a clean NATS, **five of six consumers die at startup** with `Error: no stream matches subject`, and the process then logs `✅ All consumers running.` Only the outbox consumer (which subscribes to nothing) survives. The log actively lies about the system's state. |

Observed output on a first boot against a fresh NATS:

```
🚀 Starting all consumers...
📦 Outbox consumer running...
❌ Failed to start consumer: orders.completed Error: no stream matches subject
EVENTS stream missing → creating...
❌ Failed to start consumer: inventory.updated_after_order Error: no stream matches subject
❌ Failed to start consumer: product_bills.updated Error: no stream matches subject
❌ Failed to start consumer: payments.captured Error: no stream matches subject
❌ Failed to start consumer: notifications.> Error: no stream matches subject
✅ All consumers running.
EVENTS stream created.
```

### Other flow-blockers

| ID | File:line | Problem |
|---|---|---|
| P0-18 | ✅ **FIXED** `modules/cart/cart.service.js:checkoutCart` | Calls `OrdersService.createOrder(orderPayload, userId)`; the signature is `(user, payload)`. Arguments swapped → "Only retailers can create orders". Moot in practice: the frontend posts to `/orders/create` directly. |
| P0-19 | ✅ **FIXED** `modules/inventory/inventory.repository.js:createInventoryItem` | Inserts `productId`, `productName`, `variantName`, `sku`, `stock`, `sellingPrice`, `costPrice`, `distributorId` into `inventory`; **none of those columns exist**. |
| P0-20 | ✅ **FIXED** `modules/inventory/inventory.service.js:updateInventoryAfterOrder` | `const existing = ...` is later reassigned → `TypeError: Assignment to constant variable` whenever the item is not already in inventory. |
| P0-21 | ✅ **FIXED** `api-gateway/routes/invoices.routes.js:31` | Binds `InvoiceService.generateInvoice` **directly as an Express handler**, so it receives `(req, res, next)` instead of `(user, {...})`. The correct controller `createInvoice` exists and is never wired. |
| P0-22 | ✅ **FIXED** `modules/connections/connections.repository.js:183` | Stray identifier `company` in `searchDistributors` → `ReferenceError`. |
| P0-23 | ✅ **FIXED** `modules/ledger/ledger.repository.js` | Three summary methods filter on `user.entityId`; the JWT carries only `{id, role}`, so it is always `undefined`. **Verified: `GET /ledger/statement/full` returns HTTP 200 with empty arrays rather than erroring** — it silently reports that the retailer has no bills, ledger or invoices. Silent wrong data, not a crash. |
| P0-24 | ✅ **FIXED** `workers/settlement.worker.js` | Imports `variants` from `schema.js`; the export is `productVariants` → `undefined`. |
| P0-25 | ✅ **FIXED** `api-gateway/routes/` | `payments.routes.js` and `payments.webhook.js` are **never mounted** in `app.js`. The entire Razorpay path is unreachable. |
| P0-26 | ✅ **FIXED** `frontend/src/pages/Retailers/retailerCart.js:24,43` | Destructures required props with no defaults; `App.js` renders it with none → `TypeError` on `/retailer/cart`. |

---

## P1 — Security and data integrity

| ID | File | Problem |
|---|---|---|
| P1-1 | ✅ **FIXED** `modules/product-bills/product-bills.repository.js:53-71` | **SQL built by string interpolation** from request-body values (`amount`, `qty`, `unitCost`) reaching it via `payBill`. Unquoted and unparameterised. |
| P1-2 | ✅ **FIXED** (moot - file/pattern deleted this session) `modules/payments/payments.repository.js` | Same pattern, and interpolates a uuid unquoted (`WHERE id = ${productBillId}`), which is not even valid SQL. |
| P1-3 | ✅ **FIXED** (moot - file/pattern deleted this session) `consumers/utils/js-consumer.js` | Raw string-interpolated SQL in the dedupe path. |
| P1-4 | ✅ **FIXED** `src/app.js:28` | `cors()` with no options — **any origin** may call the API. `CLIENT_ORIGIN` is read only by the socket server. |
| P1-5 | ✅ **FIXED** *(codebase-wide)* | **No error-handling middleware.** Every `next(err)` returns Express's default HTML 500 **with a stack trace**. Authorisation failures are indistinguishable from crashes and leak internals. |
| P1-6 | ✅ **FIXED** `realtime/socket.server.js` | Rooms are keyed `user:<users.id>` but payloads carry profile ids, so targeting never matches and events fall through to `io.emit`. **Every connected client receives every order and connection event in the system**, across businesses. |
| P1-7 | ✅ **FIXED** `frontend/src/components/PrivateRoute.js` | No role check — a retailer can open the entire `/distributor/*` UI. |
| P1-8 | `services/drive.service.js` | Grants `role: reader, type: anyone` — **all uploads are world-readable**. |
| P1-9 | ✅ **FIXED** `src/test/drizzleTest.js` | Logs `process.env.POSTGRES_URL` to stdout. |
| P1-10 | `frontend/build/main.f300b723.js.map` | A 5.4 MB source map committed and served, exposing the full `src/` tree. |
| P1-11 | *(codebase-wide)* | **No request validation.** `middlewares/validate.js` is a zero-byte file; `req.body` goes straight into services. |
| P1-12 | ✅ **FIXED** `modules/product-bills/product-bills.service.js:payBill` | Does not clamp against `outstanding_balance` — overpayment drives it negative. The unmounted `payments` implementation does clamp. |
| P1-13 | ✅ **FIXED** (moot - file/pattern deleted this session) `modules/payments/payments.service.js:applyGatewayPayment` | **Overwrites `invoices.total_amount` with the remaining balance**, destroying the original invoice total. |
| P1-14 | ✅ **FIXED** (delivery code now required and verified) `modules/orders/orders.service.js:completeOrder` | Accepts a delivery `code` and never validates it (`// For now, assume code matches.`). This is the trust boundary the billing chain fires on. |
| P1-15 | ✅ **FIXED** `db/schema.js:416-418` | `product_bills.retailer_id/distributor_id/variant_id` have **no foreign keys and no unique constraint** on the triple, so find-or-create can race into duplicate bills that silently split a balance. |
| P1-16 | ✅ **FIXED** `modules/connections/connections.service.js:respondToRequest` | Approve is two statements, not one transaction — a failure between them leaves an approved request with no connection row. |

---

## P2 — Schema drift (migration `0001`)

Migration `0001` dropped `product_variants.stock`, `.selling_price`, `.cost_price` and
`.expiry`, moving them to `distributor_inventory`. This code never followed.

| ID | File | Reads / writes |
|---|---|---|
| P2-1 | ✅ **FIXED** `modules/orders/orders.service.js` | `v.sellingPrice` on `product_variants` — order totals would be null even after P0-1 is fixed |
| P2-2 | ✅ **FIXED** (moot - file/pattern deleted this session) `modules/inventory/inventory.repository.js` | `variant.stock`, `.sellingPrice`, `.costPrice`, `product.distributorId` |
| P2-3 | ✅ **FIXED** `modules/inventory/inventory.repository.js:updateStock` | Sets `inventory.stock`; the column is `qty` |
| P2-4 | ✅ **FIXED** (deleted with the consumer layer) `consumers/inventory.consumer.js` | `productVariants.stock` |
| P2-5 | ✅ **FIXED** (moot - file/pattern deleted this session) `consumers1/inventory.consumer.js` | Same (dead file) |
| P2-6 | ✅ **FIXED** `modules/outbox/outbox.service.js:markFailed` | Sets an `error` column that does not exist on `outbox` |
| P2-7 | ✅ **FIXED** `workers/settlement.worker.js` | Inserts a `JSON.stringify`'d string into `outbox.payload`, which is `jsonb` |
| P2-8 | `drizzle/0001_cool_lord_tyger.sql` | `ADD COLUMN distributorship_id uuid NOT NULL` with no default — **fails on a non-empty `products` table** |
| P2-9 | `src/db/schema.sql` | Stale Knex-era file contradicting the live schema; still describes `bills`, `products.distributor_id`, `product_variants.stock` |

---

## P3 — Duplication and dead code

Two of everything. Each pair costs a reader time and risks edits landing in the dead copy.

| ID | Concept | Live | Dead / competing |
|---|---|---|---|
| P3-1 | ✅ **FIXED** (moot - file/pattern deleted this session) Socket server | `src/realtime/socket.server.js` | `backend/realtime/socket.server.js` (imports resolve to a non-existent directory) |
| P3-2 | ✅ **FIXED** (moot - file/pattern deleted this session) Event publisher | both in use | `config/nats-streams.js` swallows errors; `events/jetstream.js` rejects. Different subject lists in their `ensureEventsStream`. |
| P3-3 | ✅ **FIXED** (moot - file/pattern deleted this session) Outbox drain | `consumers/outbox.consumer.js` | `modules/outbox/outbox.worker.js` — **both work**, opposite semantics; running both double-publishes |
| P3-4 | ✅ **FIXED** (moot - file/pattern deleted this session) Consumers | `src/consumers/` | `src/consumers1/` — broken import paths. Contains the **only** code that persists notification rows. |
| P3-5 | ✅ **FIXED** (moot - file/pattern deleted this session) Bill payment | `modules/product-bills/` | `modules/payments/` — divergent behaviour, unmounted |
| P3-6 | ✅ **FIXED** (moot - file/pattern deleted this session) Invoice PDF | `utils/invoice-pdf.js` | `utils/invoicePdf.js` |
| P3-7 | ✅ **FIXED** (moot - file/pattern deleted this session) Email | `modules/auth/email.service.js` (`SMTP_*`) | `utils/email.js` (`MAIL_*`) — unused, and its `import nodemailer` sits mid-file |
| P3-8 | ✅ **FIXED** (moot - file/pattern deleted this session) Payments controller | `payments.controller.js` | `paments.controrer1.js` (filename typo) |
| P3-9 | ✅ **FIXED** (moot - file/pattern deleted this session) Dedupe | neither works | `consumers/utils/dedupe.js` and `consumers/utils/js-consumer.js` |
| P3-10 | Retailer stock | `inventory` | `retailer_inventory` — two tables for one concept |
| P3-11 | Notifications | `notifications` | `notifications_log` — never written |
| P3-12 | ✅ **FIXED** (moot - file/pattern deleted this session) OTP generation | inlined `Math.random()` in `auth.service.js` | `utils/otp.js` — crypto-random, honours `OTP_TTL_MINUTES`, **unused** |
| P3-13 | ✅ **FIXED** (deleted) Frontend shelf | `retailerShelf.js` | `retailerShelf12.js` (1440 lines) |
| P3-14 | ✅ **FIXED** (deleted) Frontend orders | `distributorOrders.js` | `pages/test.js` (711 lines) |
| P3-15 | ✅ **FIXED** (deleted) Frontend layout | `retailerLayout.js` | `components/Layout.js` |

**Zero-byte files:** `config/env.js`, `utils/jwt.js`, `api-gateway/middlewares/validate.js`,
`modules/notifications/notifications.events.js`,
`modules/notifications/notifications.repository.js`, and four frontend components
(`BottomNav.js`, `Cart.js`, `ProductCard.js`, `SearchBar.js`).

**Never written:** `inventory_snapshots`, `notifications_log`, `invoices.invoice_number`,
`orders.accepted_at` / `.delivered_at` / `.completed_at`.

**Subjects published with no consumer:** `orders.rejected`, `orders.modified.approval`,
`orders.modified.by_distributor`. **Subject consumed but never published:** `payments.captured`.

---

## P4 — Packaging and tooling

| ID | Problem |
|---|---|
| P4-1 | ✅ **FIXED** **`cors` is imported at `src/app.js:2` but is not in `backend/package.json` dependencies.** It resolves today only as a transitive dependency of `socket.io`. A clean `npm ci` with different resolution **crashes the server at boot**. |
| P4-2 | ✅ **FIXED** **`minimist` is imported by `workers/settlement.worker.js` but is not in `package.json`.** It currently resolves as a transitive dependency, so the import succeeds today — but like P4-1 this is one dependency-tree change away from breaking. (The worker is separately unable to run for the P0-24 / P0-9 / P2-7 defects.) |
| P4-3 | ✅ **FIXED** `drizzle.config.js` never calls `dotenv.config()`, so `drizzle-kit` only works when `POSTGRES_URL` is exported in the shell. |
| P4-4 | `backend` `npm test` is the npm default stub (`exit 1`). |
| P4-5 | ✅ **FIXED** (Vite/Vitest migration). Was: `react-scripts test` (Jest) could not resolve `react-router-dom` v7 at all — `Cannot find module 'react-router-dom' from 'src/App.js'` — because v7's `exports` map is ESM-only and react-scripts 5's bundled Jest predates it, so *any* test importing `App.js` failed and CRA offered no override without ejecting. The CRA→Vite migration replaced `react-scripts test` with **Vitest** (`npm test` → `vitest run`), which resolves v7's ESM exports natively. `App.test.js` now mounts the full `<App/>` tree (router + `AuthProvider` + landing page) in jsdom and passes. Two jsdom API gaps that surfaced once the import worked (`matchMedia` for gsap ScrollTrigger, `IntersectionObserver`/`ResizeObserver` for framer-motion) are shimmed in `src/setupTests.js` — test-env only, browsers provide them natively. |
| P4-6 | No `.github/`, no CI, no PR checks. |
| P4-7 | No Prettier, no `.editorconfig`, no backend linter. |
| P4-8 | ✅ **FIXED** (partially) `.gitignore` is four lines and omits `.DS_Store` (two are tracked), `frontend/build`, and `*.log`. Added `.DS_Store` and `*.log`; untracked the two committed `.DS_Store` files. **`frontend/build` deliberately left tracked** — the project's current deployment appears to serve that committed folder directly (docs/09-operations.md), so excluding it is a workflow decision for you to make, not something to change silently. |
| P4-9 | ✅ **FIXED** (moot - file/pattern deleted this session) `server.js:23` calls `startAllConsumers()` **without awaiting**, despite a comment saying it must be awaited. Startup failures are unhandled. |
| P4-10 | ✅ **FIXED** `utils/invoice-pdf.js` writes to `./invoices/` relative to cwd and does not create the directory; the directory is not in the repo. |
| P4-11 | ✅ **FIXED** (moot - file/pattern deleted this session) `express` is imported but unused in `src/server.js`. |
