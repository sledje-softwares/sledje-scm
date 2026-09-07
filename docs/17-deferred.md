# Deferred Work and Open Decisions

Things deliberately **not** built, each with enough context to pick up cold.
This is not a defect list — see [10-known-issues.md](10-known-issues.md) for
that. These are choices, made consciously, with a reason and a trigger.

---

## 1. Khata — customer credit

**What it is.** Selling on credit to a regular customer and tracking what they
owe the shop. Universal in kirana retail: the customer takes goods now and
settles weekly or monthly, and the shopkeeper keeps a running book.

**Why it was deferred.** It is a *second money system* alongside the
distributor one. Sledje already has one running-balance ledger (retailer owes
distributor, per product). Khata adds another (customer owes retailer, per
customer) with its own repayment flow, ageing, and reconciliation. Building it
alongside the POS would have doubled the surface being tested at the moment the
two-stage billing model was first being proven.

**Decision taken at the time:** walk-in sales with an optional name and phone,
and `cash | upi | card` payment methods. No credit.

**What exists already.**
- `customers` table (`retailer_id`, `name`, `phone`, unique on retailer+phone).
- `sale_payments` is a separate table precisely so a sale can be split across
  methods — adding a `credit` method is not a schema fight.
- [12-target-model.md](12-target-model.md) sketches `customer_ledger`,
  mirroring the existing distributor ledger pattern.

**What building it needs.**
- `customer_ledger` — `type` (debit/credit), `amount`, `balance`, `sale_id`,
  mirroring `ledger`.
- A `credit` payment method whose amount is not "money received" but "money
  owed", so day-close cash reconciliation is not thrown off by it.
- A repayment op (`khata.payment`) — one entry in `OP_APPLIERS`.
- `customers.credit_limit` is already in the target model; enforcement is a
  product decision (hard block, warn, or record only).

**Trigger to build it:** the first shopkeeper who asks where the udhaar book
is. In practice that is likely to be the first one.

---

## 2. Day close — end of day cash reconciliation

**What it is.** At closing time: opening float, expected cash from the day's
sales, cash actually counted, and the variance between them.

**Why it was deferred.** It only becomes meaningful once sales exist and are
trustworthy, which is very recent. It is also the natural consumer of khata
(§1) — money taken on credit is not cash in the drawer, and a day-close that
does not know that will report a variance every single day and be ignored.

**What exists already.** [12-target-model.md](12-target-model.md) has the
`day_close` sketch: `opening_float`, `expected_cash`, `counted_cash`, a
generated `variance` column, unique on `(retailer_id, business_date)`.

**What building it needs.**
- The `day_close` table, and a `day.close` op in `OP_APPLIERS`.
- Expected cash = sum of `sale_payments` where method is cash, for that
  business date, minus refunds/voids.
- A "business date" decision: shops close after midnight. A calendar date will
  silently split a single trading day in two. Pick an explicit cutover (e.g.
  the day rolls at 4am) rather than inheriting `date(sold_at)`.

**Trigger:** as soon as more than one person handles the till, since variance
is what makes shrinkage visible.

---

## 3. `stock_movements` — the stock ledger

Stock is still a mutable counter (`inventory.qty`,
`distributor_inventory.stock`). [13-migration-path.md](13-migration-path.md)
Stage 1 replaces it with an append-only movement log.

Offline sync made this **less** urgent for billing (every write is a delta, so
concurrent devices merge correctly) and **more** urgent for everything else.

**It is now the gate on stock-take.** "There are 37 on the shelf" is a *level*,
not a delta — writing it discards every sale still queued on another device.
Any stock-take or reconciliation feature needs the movement log first. See the
table in [16-offline-first.md](16-offline-first.md).

---

## 4. Delivery agent vetting, ratings and disputes

Agents are a platform-level pool: they self-register and any distributor may
assign an available one. There is no vetting, no rating, no availability
scheduling, and no dispute path when an agent and a retailer disagree about
what arrived.

Acceptable while agents are known to the distributors who use them. Becomes
untenable the moment the pool includes strangers.

---

## 5. `product_bills` vs `invoices` — unresolved tension with tax law

Not duplication: GST requires a tax invoice at *time of supply*, while
commercial liability under a sell-through model accrues at *time of sale*. Two
different events genuinely need two objects.

What is missing is (a) a decision on which is the legal document of record,
(b) reconciliation between them, and (c) consistent GST logic — the on-demand
path splits CGST/SGST 50/50 while `settlement.worker.js` correctly applies
place-of-supply rules. See [11-design-critique.md](11-design-critique.md) §8.

---

## 6. Request validation

There is no schema validation layer; `req.body` reaches services directly. The
money paths do validate inline (quantity > 0, payment covers total, price not
negative), so this is not currently an open hole in billing — but it is one
malformed payload away from being one, and `POST /sync` now accepts batches of
operations from a device.
