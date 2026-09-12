# Sledje

**The operating system for the neighborhood shop and the distributors who supply it.**

Sledje connects **retailers** (kirana shops, small retail), their **distributors**, and the
**delivery agents** who move stock between them — in one system, with one shared ledger of
truth for what's owed, what's in stock, and what's been sold.

> **Status: pre-production.** Core flows (connections, ordering, delivery confirmation,
> billing, point-of-sale, offline sync) run end-to-end and are covered by an automated test
> suite. See [Project status](#project-status) before deploying to a real shop.

---

## Use Cases

### For a retailer

- **Discover and connect to distributors.** Search a shared catalogue, request a connection,
  order once approved.
- **Order stock on credit, not cash up front.** Place an order, receive a delivery
  confirmation code, hand it to the delivery agent on arrival — that's the only proof of
  delivery the system accepts, and it's what triggers stock and billing to move.
- **Sell at the counter, online or offline.** A point-of-sale screen prices from the shop's
  own shelf, rings up a sale, and prints a bill number — even with no network connection. Sales
  queue locally and sync the moment connectivity returns, with an exactly-once guarantee so a
  flaky connection never double-charges or double-counts stock.
- **Carry a running balance, pay it down over time.** Every delivery adds to what's owed
  *per product*, not per invoice. Pay against a specific bill; the balance clears in real time.
- **See what's owed, to whom, for what — in one place.** A combined statement across every
  distributor, every bill, every invoice.

### For a distributor

- **Publish a catalogue once, sell through many retailers.** Products live in a shared
  namespace (a *distributorship*) that multiple distributors can stock from — bulk-import a
  price list, and the system reconciles it against existing SKUs rather than duplicating them.
- **Control who touches your listings.** Only distributors who hold active membership in a
  distributorship may create, edit, or delete its products — and once another distributor has
  started stocking a product, it becomes append-only, so one member's edit can never wipe out
  another's inventory or billing history.
- **Track cost basis accurately, FIFO.** Every delivery is received as a cost layer; every sale
  consumes the oldest layer first, so margin is never guessed.
- **Dispatch through a pool of delivery agents**, not your own fleet — assign any available
  agent to a run and track it through pickup and confirmed delivery.
- **Generate GST-compliant invoices** for a billing period, backed by the same ledger the
  retailer sees.

### For a delivery agent

- **Register once, work for any distributor.** No employment relationship required — agents are
  a platform-wide pool that any distributor can draw from.
- **Run a simple pickup → deliver → confirm flow**, with the confirmation code as the one
  security boundary that has to hold: five wrong attempts locks the delivery for 15 minutes.

### Why this matters

Most shop-management tools track *orders*. Sledje tracks *product-level credit* — the actual
relationship a kirana shop has with its supplier, where a running tab against specific goods
matters more than any single invoice. That's the core design bet the rest of the system is
built around. See [docs/02-product-billing.md](docs/02-product-billing.md).

---

## Technical Specifications

### Stack

| Layer | Technology |
|---|---|
| Frontend | React 18/19, Vite, React Router 7, Tailwind CSS, axios |
| Offline storage | Dexie (IndexedDB) — client-generated ULIDs, append-only outbox |
| Backend | Node.js (ESM), Express 5 |
| Database | PostgreSQL 17 + Drizzle ORM |
| Realtime | Socket.IO, room-scoped per business entity |
| Auth | JWT (with server-side revocation via a token version) + bcrypt |
| Testing | `node:test` (backend), Vitest + Playwright (frontend) |

### Architecture

A modular monolith with a consistent layering convention:

```
api-gateway/routes → api-gateway/controllers → modules/<domain>/service.js → repository.js
```

Three actor roles (`retailer`, `distributor`, `delivery_agent`), each with its own auth surface
and role-scoped route guards. Every cross-tenant read and write is checked against an explicit
identity resolver — an unrecognized or unauthorized role is denied by default, not by omission.

**Core domain modules:** connections, products/catalogue, distributor inventory, orders,
deliveries & delivery agents, product bills (the credit ledger), invoices, ledger statements,
sales/POS, and offline sync.

### Data model

38 tables in Postgres, migrated with Drizzle Kit. Highlights:

- **`distributorships → products → product_variants`** — a shared, brand-neutral catalogue with
  no stock or price at the variant level.
- **`distributorship_members`** — gates who may write to a distributorship's catalogue, with a
  request/approve flow.
- **`distributor_inventory`** — where stock and price actually live, scoped per distributor.
- **`product_bills` + `product_bill_layers`** — the per-(retailer, distributor, variant) credit
  account, backed by FIFO cost layers.
- **`sales`, `sale_items`, `sale_payments`** — the point-of-sale ledger.
- **`sync_devices`, `sync_ops`** — the offline-first sync log, with an exactly-once constraint
  per device operation.

### Security posture

- Role-based access control with a default-deny identity resolver at every cross-tenant
  boundary (bills, ledger, invoices).
- OTP-based password reset with attempt limiting and lockout, mirrored from the same pattern
  used for delivery confirmation codes.
- Rate limiting on every auth-adjacent endpoint (login, registration, password reset, OTP),
  `helmet` security headers, and a request body-size ceiling with a carve-out for offline sync
  batches.
- Session invalidation on password reset via a server-tracked token version — a leaked JWT
  secret or stolen token can be evicted, not just outlived.
- Delivery confirmation codes encrypted at rest (AES-256-GCM), never stored or logged in
  plaintext.
- Parameterized queries throughout (Drizzle), no raw SQL string interpolation.

### Offline-first point of sale

The retailer-facing POS is designed to keep working with no network: client-generated ULIDs,
an append-only local outbox, and a single `POST /sync` endpoint that reconciles a batch of
queued operations against the server with an idempotency guarantee — a retried sync can never
double-apply. See [docs/16-offline-first.md](docs/16-offline-first.md).

### Testing & CI

- An automated backend suite (`node:test`) covering cross-tenant authorization, catalogue
  integrity, OTP lockout, and money-precision invariants.
- CI applies every migration against a real Postgres instance, runs a schema-drift check
  against the Drizzle schema, and boots the app to confirm the import graph is intact.

---

## Quickstart

```bash
# 1. Infrastructure (Postgres via docker-compose, or point POSTGRES_URL at a hosted instance)
cd backend
docker compose up -d

# 2. Backend
cp .env.example .env
# fill in POSTGRES_URL, JWT_SECRET (32+ bytes hex), DELIVERY_CODE_KEY (32 bytes hex)
npm install
npm run migrate
npm run dev                 # http://localhost:5000

# 3. Seed a working demo (one retailer, one distributor, one agent, connected & stocked)
VERIFY_I_KNOW_THIS_TRUNCATES=1 node scripts/seed_offline_demo.js

# 4. Frontend
cd ../frontend
cp .env.example .env        # set VITE_API_URL to your backend
npm install
npm run dev                 # http://localhost:5173
```

Full setup, environment variables, and the deployment runbook:
[docs/09-operations.md](docs/09-operations.md) and [docs/18-deployment.md](docs/18-deployment.md).

## Documentation

Start at [docs/README.md](docs/README.md) for the full reading order.

| Document | What it covers |
|---|---|
| [02-product-billing.md](docs/02-product-billing.md) | **The core design decision.** Read this first. |
| [03-architecture.md](docs/03-architecture.md) | Boot sequence, layering, module inventory |
| [04-data-model.md](docs/04-data-model.md) | Every table, constraint, and migration |
| [05-api-reference.md](docs/05-api-reference.md) | Every HTTP endpoint |
| [07-domain-flows.md](docs/07-domain-flows.md) | End-to-end lifecycles |
| [09-operations.md](docs/09-operations.md) | Local setup, env vars, workers |
| [15-delivery-confirmation.md](docs/15-delivery-confirmation.md) | The delivery agent role and the retailer-held code |
| [16-offline-first.md](docs/16-offline-first.md) | The offline POS, sync protocol, and its guarantees |
| [18-deployment.md](docs/18-deployment.md) | Production deployment shape and runbook |

## Repository layout

```
backend/
  src/
    app.js                  Express app: security middleware, CORS, route mounts
    server.js               Boot sequence
    api-gateway/            routes/, controllers/, middlewares/
    modules/<domain>/       service + repository + events per domain
    modules/identity/       shared cross-tenant identity resolution
    realtime/               Socket.IO server
    db/schema.js            Drizzle schema — the authoritative data model
    config/                 postgres, CORS, NATS
  drizzle/                  Generated migrations
  scripts/                  Seed, backfill, and verification scripts
  test/                     node:test suite
frontend/
  src/
    App.js                  Route table
    api.js                  axios instance
    offline/                Dexie-backed offline queue and sync client
    components/             Shared UI + AuthContext
    pages/                  Landing/, Retailers/, Distributors/, Agent/
docs/                       Full documentation set
```

## Project status

This is a working system with an active remediation history — see
[docs/10-known-issues.md](docs/10-known-issues.md) for the defect register and what's been
fixed. Before trusting a flow you haven't exercised yourself, read it. Contributions should
follow the layering convention in [docs/03-architecture.md](docs/03-architecture.md); a handful
of older modules don't — use the newer ones as the template, not those.

## Author

Gunjan Kumar

## License

MIT
