# Overview, Actors and Glossary

## What Sledje is

Sledje connects **retailers** (small shops, kirana stores) with their **distributors** in one
system. A retailer discovers distributors, connects to them, browses their catalogue, places
orders, receives stock, and carries a running credit balance that they pay down over time.
The distributor sees incoming orders, manages what they stock and at what price, and tracks
what each retailer owes them.

**The intent is broader than that.** Sledje is meant to become the operating system for the
shop — everything a shopkeeper does in a day, including selling to their own customers. See
[12-target-model.md](12-target-model.md).

**What is actually built today is the procurement half only.** The retailer→distributor
relationship is complete end to end. The sell-side — customers, sales, receipts, returns,
cash reconciliation — does not exist in the schema at all. This matters far more than it
sounds, and [02-product-billing.md](02-product-billing.md) explains why.

## Actors

There are exactly **two** roles. `users.role` accepts `retailer` or `distributor` and nothing
else. There is no admin, no delivery partner, and no staff account.

| Actor | Profile table | What they do |
|---|---|---|
| **Retailer** | `retailers` | Runs a shop. Connects to distributors, orders stock, holds inventory, owes money. |
| **Distributor** | `distributors` | Supplies retailers. Stocks catalogue items at their own prices, fulfils orders, extends credit. |

A **distributorship is not an actor.** This is the single most common misreading of the
schema. See the glossary below.

> The marketing site advertises "Delivery Partners" as a third party. No such role exists in
> the code or the data model.

## Glossary

The naming in this codebase overloads several words. This table is the authority.

| Term | What it actually is |
|---|---|
| **Distributor** | A business that supplies retailers. A user account. Has stock and prices. |
| **Distributorship** | **Not a distributor.** A brand or supply-house *namespace* in the shared catalogue — "Fresh Farms", "Tech Gadgets Inc". Every product belongs to one. It has no login, no stock, and no prices. Any distributor can sell products from any distributorship. |
| **Product** | A catalogue entry (`products`) owned by a *distributorship*. Carries name, image, category. No stock, no price. |
| **Product variant** | A specific sellable SKU of a product (`product_variants`) — "5kg Pack". Carries `sku`, `mrp`, `unit`, `hsn_code`, `gst_rate`. **Deliberately carries no stock and no price** — those are per-distributor. |
| **Distributor inventory** | `distributor_inventory`. What a *distributor* holds: stock, cost price, selling price, expiry, low-stock threshold, for one variant. **This is where commerce data lives.** |
| **Inventory** | `inventory`. What a *retailer* holds on their shelf: qty, reorder level, expiry, daily average sales. |
| **Retailer inventory** | `retailer_inventory`. A **second, competing** retailer stock table written only by the event consumers. Duplicates `inventory`. See [11-design-critique.md](11-design-critique.md). |
| **Product bill** | `product_bills`. A running credit account per **(retailer, distributor, variant)**. *Not* per order and *not* per invoice. This is the core of the product — read [02-product-billing.md](02-product-billing.md). |
| **Invoice** | `invoices`. A periodic GST tax document covering a date range for a retailer↔distributor pair. A different object from a product bill, serving a different (statutory) purpose. |
| **Ledger** | `ledger`. A debit/credit statement of movements between a retailer and a distributor. |
| **Outbox** | `outbox`. The transactional outbox — rows written inside a DB transaction, published to NATS afterwards. |

### The one-line model

> The **catalogue is shared** (distributorships → products → variants, no prices).
> **Commerce data is per-distributor** (`distributor_inventory`: stock, cost, selling price).
> **Credit is per-product** (`product_bills`).

The clearest expression of this in code is
`backend/src/modules/products/products.service.js` → `bulkImportForDistributor`, which takes a
CSV row and does find-or-create distributorship → find-or-create product → find-or-create
variant → upsert *distributor inventory*.

## Subsystem status at a glance

Honest assessment of what runs today. Details in [10-known-issues.md](10-known-issues.md).

| Subsystem | Status | Note |
|---|---|---|
| Registration & login | ✅ Working | Retailer and distributor, both routes |
| Password reset (OTP) | ❌ Broken | `auth.repository.js` uses a non-existent Drizzle API |
| Connections (request/approve/search) | ⚠️ Mostly working | `searchDistributors` throws; approve is not transactional |
| Catalogue browse | ✅ Working | `GET /products/get`, `GET /products/:productId` |
| Catalogue write (add/update/delete/bulk) | ❌ Broken | Controller calls five service methods that do not exist |
| Distributor inventory | ✅ Working | The healthiest module in the codebase |
| Cart (add/update/remove) | ✅ Working | |
| Cart checkout | ❌ Broken | Arguments swapped; also bypassed by the frontend |
| Order creation | ❌ Broken | Non-Drizzle `.in()` throws before any DB write |
| Order state machine | ⚠️ Blocked | Logic is sound but unreachable while creation fails |
| Delivery → inventory → bill → ledger chain | ❌ Broken | Breaks at the first hop; every downstream step also broken |
| Product bills (list/get/pay) | ⚠️ Partial | Reads work; `payBill` does not clamp to outstanding |
| Payments module | ❌ Broken | Routes never mounted; calls non-existent repo methods |
| Razorpay webhook | ❌ Unreachable | Route file exists, never mounted |
| Invoices | ⚠️ Partial | `POST /generate` binds a service method directly as a handler |
| Settlement worker | ❌ Cannot start | Wrong import name; non-Drizzle API; undeclared `minimist` dependency |
| Ledger | ⚠️ Partial | `/ledger/bill/:billId` and `/statement/full` are broken |
| Notifications | ❌ Mostly broken | Unread-count and mark-read throw; nothing ever writes a notification row |
| Realtime (Socket.IO) | ⚠️ Working but leaky | Targeting never matches, so events broadcast to all clients |
| Frontend | ⚠️ Partial | Several screens render hardcoded mock data |

## Where the product intent is recorded

These are the only statements of intent in the repository, and they predate the current code:

- `README.md` — the panel structure (Shelf, Cart & Order, Payments, You) and the key line
  defining repayment as *"daily/weekly payments to distributors based on sales of their
  products"*.
- `further.txt` — design scratchpad. Origin of the shared-catalogue split: *"there should be a
  product catalog from where all products of all distributors can be accessed"* and *"an
  inventory of items which is added from the product catalog if ordered even once"*.
- `readmeALL/readMeQueries.txt` — open product questions.
- `backend/startup.text` — the operational runbook and the weekly/monthly settlement cycle.
