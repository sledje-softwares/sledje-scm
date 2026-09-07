# Design Critique

An argued critique of the current design, ordered by consequence rather than by severity of
breakage. Bugs live in [10-known-issues.md](10-known-issues.md); this document is about
decisions.

Each item: **decision → consequence → recommendation.**

---

## 1. The sell-side is missing, and everything else depends on it

**Decision.** Model retailer→distributor procurement completely; model the retailer's own
sales not at all. Verified: there is no `customers`, `sales`, `sale_items`, receipts, returns,
day-close or staff concept anywhere in `backend/src/db/schema.js`.

**Consequence.** This is not a missing feature, it is a missing foundation, because the rest
of the design already assumes the data it would produce:

- **Stock only ever goes up.** Delivery increments inventory; nothing decrements it.
  `reorder_level`, low-stock alerts, expiry management and reorder suggestions are
  *structurally impossible*, not merely unimplemented.
- **The repayment model is defined in terms of sell-through.** `README.md`: *"Payments
  (daily/weekly payments to distributors based on sales of their products)."* That model is
  derived from a signal the system never collects.
- **Product-based billing loses its justification.** See §2.
- **`inventory.daily_avg_sales` is written as the literal `0`** in the only two code paths that
  touch it (`modules/inventory/inventory.repository.js:50`,
  `consumers1/inventory.consumer.js:120`). It is the unfinished seam where sales were meant to
  attach.
- **`inventory_snapshots` has no reader or writer.** Aging analysis was designed and never fed.
- **Analytics have no source.** `distributorOverview.js` and `distributorPayments.js` render
  hardcoded series; `retailerPayment.js` starts from `generateMockData()`.

A retailer cannot "manage all their shop operations" in a system that never learns what they
sold. As built, Sledje is an ordering app for shopkeepers, and the shopkeeper still runs the
shop in a notebook.

**Recommendation.** Build the sell-side. See [12-target-model.md](12-target-model.md).

---

## 2. Product-based billing is right; its implementation is half-built

**Decision.** Track credit per (retailer, distributor, variant) rather than per order. This is
correct and it is the product's differentiator — the full argument is in
[02-product-billing.md](02-product-billing.md).

**Consequence.** The benefit of product-granular accounting is that repayment can follow
sell-through. But `consumers/productBill.consumer.js` accrues on
`inventory.updated_after_order` with `type: "delivery"` — **on delivery, not on sale**. So the
system pays the full cost of the unusual model (per-SKU balances, per-SKU payment allocation,
reconciliation burden) and collects none of its benefit. Today it is strictly harder than
order-based billing with no upside.

**Recommendation.** Two-stage accrual: delivery records stock *received* (unsold consignment,
visible to both parties); the amount becomes *due* when a sale is recorded.

---

## 3. `current_unit_cost` is overwritten, destroying cost history

**Decision.** Keep a single scalar cost per product bill
(`product-bills.repository.js:61`: `current_unit_cost = ${unitCost}`).

**Consequence.** Receive 50 @ ₹10, then 50 @ ₹12, then sell 60 — the amount owed is
unanswerable, because the information needed has been overwritten. The system would compute
60 × ₹12 = ₹720 instead of the correct ₹620, overcharging by ₹100 on a single SKU.

This is a cost *created by* the billing model. An order-based system gets cost layers free from
the invoice. Product-based billing gave that up and must rebuild it explicitly — and did not.

**Recommendation.** FIFO cost layers, one per delivery, consumed oldest-first on sale. The raw
material already exists: every `delivery` row in `product_bill_transactions` carries its own
`unit_price`. It is simply never used for costing, so the layers can be **backfilled** from
existing data.

---

## 4. Payment has no allocation path

**Decision.** Expose payment only as `POST /product-bills/:billId/pay`.

**Consequence.** A retailer settling ₹10,000 against a distributor they buy 200 SKUs from must
split it across 200 bills by hand. Nobody settles with a distributor that way.

**Recommendation.** This is a *presentation and allocation* gap, **not** an argument for
replacing product bills with a party-level balance. Product bills stay the ledger of record;
add (a) a party-level roll-up view and (b) an allocation engine that spreads a lump sum across
bills under an explicit policy — oldest-first, proportional to sell-through, or
distributor-directed.

---

## 5. Money is a ledger; stock is a mutable counter — invert it

**Decision.** Money is modelled append-only (`product_bill_transactions`, `ledger`) with
derived balances. Stock is modelled as a mutable integer (`UPDATE ... SET stock = stock - qty`).

**Consequence.** The asymmetry is the tell. Mutable stock gives you no audit trail, no
shrinkage measurement, no cost of goods sold, and it is vulnerable to lost updates when
concurrent consumers write the same row. It also cannot express the movements a shop actually
has: damage, expiry write-off, stock-take correction, customer return.

**Recommendation.** `stock_movements`, append-only and typed, with on-hand **derived**. You
already have the right instinct for money; apply it to stock. FIFO billing (§3) requires this
anyway.

---

## 6. Three tables for one concept

**Decision.** `distributor_inventory`, `inventory` and `retailer_inventory` — with the last
two describing the **same actor's** stock.

**Consequence.** `inventory` has the retail-meaningful fields (`reorder_level`, `expiry`,
`daily_avg_sales`); `retailer_inventory` is the one the event consumers actually write, and it
inserts rather than upserts, so quantities accumulate as duplicate rows. Neither is
authoritative. Application code disagrees about which to read.

**Recommendation.** One stock model keyed by (owner_type, owner_id, variant_id, batch_id).
Retire `retailer_inventory`.

---

## 7. No batch or lot modelling

**Decision.** A single `expiry` column per stock row.

**Consequence.** The same SKU received twice has two expiry dates; a single column silently
overwrites the older one. For FMCG and perishables — the actual target market — this is not a
rounding error, it is the core of the domain. FIFO costing needs lots too, so §3 and §7 are
the same fix.

**Recommendation.** `stock_batches`, sharing a key with the FIFO cost layers so cost and expiry
stay consistent.

---

## 8. `product_bills` vs `invoices` is unresolved tension with tax law, not duplication

**Decision.** Maintain both a continuous per-product running account and a periodic GST
invoice.

**Consequence.** These look redundant and are not — GST requires a tax invoice at *time of
supply*, while commercial liability under a sell-through model accrues at *time of sale*. Two
different events genuinely need two objects. But nothing reconciles them, nothing decides which
is the legal document, and the GST logic differs between the two implementations:
`invoices.service.js` always splits 50/50 CGST/SGST with `igst: 0`, while
`workers/settlement.worker.js` correctly applies place-of-supply rules. **The more correct
implementation is the one that cannot run.**

**Recommendation.** Decide which is the statutory document; add reconciliation; preserve the
settlement worker's tax logic and delete the other.

---

## 9. Distributed-systems machinery without a distributed system

**Decision.** NATS JetStream, a transactional outbox, durable consumers and message dedupe —
all running **inside the same process as the API** (`server.js` starts the consumers).

**Consequence.** This buys almost nothing today and costs a great deal. It is precisely where
the codebase is most broken:

- The entire delivery→billing→ledger chain is dead, at every hop.
- There are **two competing outbox drains** with opposite semantics; running both
  double-publishes.
- There are **two dedupe schemes and both fail** — one queries a table that does not exist, the
  other keys on an `eventId` no publisher ever emits.
- The outbox's whole purpose is atomicity between DB commit and publish — and it is **defeated
  by the best-effort direct publish** most services perform immediately afterwards, which also
  double-publishes every event.

Meanwhile, the one idempotency mechanism that *works* is a plain domain constraint,
`uq_product_delivery_order_bill`.

**Recommendation.** Delivery → billing → ledger becomes **one transaction in the request
path**: synchronous, atomic, debuggable. Keep NATS only for genuinely async fan-out —
notifications, realtime push, analytics. One publish helper, one outbox drain, and lean on
domain uniqueness constraints instead of message dedupe.

---

## 10. Identity is split in a way that costs a query per request and causes live bugs

**Decision.** `users` holds credentials; `retailers` and `distributors` hold profiles. The JWT
carries only `{ id, role }` where `id` is `users.id`.

**Consequence.**

- Every service re-resolves the profile row on every authenticated request.
- `modules/ledger/ledger.repository.js` filters on `user.entityId`, which is never set.
- **Socket.IO rooms are keyed `user:<users.id>` while payloads carry profile ids**, so targeted
  delivery never matches and virtually every event falls through to `io.emit` — broadcasting
  every order and connection event to every connected client, across businesses.

Separately, `retailers` and `distributors` are ~90% identical columns, which propagates into
two profile services, two repositories, two register/login paths, two suggestion endpoints and
role branching in nearly every service.

**Recommendation.** Put `entityId` in the JWT — that one change fixes the ledger filter and
socket targeting together. Then consider collapsing to one `businesses` table with a type.

---

## 11. The catalogue will rot

**Decision.** `product_variants.sku` is **globally unique**; distributorships are created by
find-or-create on a free-text name; there is no barcode field.

**Consequence.**

- SKUs are vendor-local. Two suppliers both using "1001" cannot coexist.
- `bulkImportForDistributor` find-or-creates a distributorship by name with no moderation, so a
  single typo ("Fresh Farms " with a trailing space) permanently forks a brand and splits its
  catalogue.
- **No barcode/EAN.** That is the natural global product identifier and it is mandatory for
  scanning at a counter — which the POS will need.

**Recommendation.** Scope SKU uniqueness to the distributorship; add `barcode`/`ean` with a
global unique index; add a moderation or merge path for distributorships.

---

## 12. Offline is an architectural decision, not a later optimisation

**Decision.** A fully online CRA single-page app.

**Consequence.** A kirana counter cannot depend on connectivity. If customer billing goes down
when the network does, the shopkeeper reverts to the notebook and does not come back. Retrofitting
offline onto a synchronous server-authoritative design is expensive; deciding it before the POS
exists is nearly free.

**Recommendation.** Client-generated ids, an append-only device outbox, idempotent server
ingest, and an explicit conflict policy. See [12-target-model.md](12-target-model.md).

---

## 13. Smaller, but real

| Decision | Consequence | Recommendation |
|---|---|---|
| `completeOrder` accepts a delivery `code` and never validates it | This is the trust boundary the **entire billing chain** fires on. Nothing stops a retailer never completing, so nothing is ever billed. | Distributor marks delivered; retailer confirms with an OTP; timeout auto-confirms |
| The retailer's own selling price is modelled nowhere | No margin, no customer-facing price, no discount. The POS cannot price a sale. | `retail_price` per retailer per variant |
| Money precision mixes `numeric(10,2)`, `(12,2)`, `(14,2)` and is read into JS `Number` | Rounding drift across the money path | Standardise; consider integer paise |
| No staff/multi-user model inside a shop | One login per shop; no audit of who did what; cannot hand the till to an employee | Staff accounts with in-shop roles |
| No request validation layer (`validate.js` is empty) | `req.body` flows straight into services and into interpolated SQL | Schema validation at the boundary |
| No error middleware | Authorisation failures return HTML 500s with stack traces | One error handler mapping domain errors to status codes |
