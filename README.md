# Sledje

**Smart retail and distribution management for small shops and their suppliers.**

Sledje connects **retailers** (kirana shops, small retail) with their **distributors** in one
system: discover and connect to suppliers, browse a shared catalogue, order stock, and carry a
running credit balance that is paid down over time.

Its distinguishing design decision is **product-based billing** — credit is tracked as a
running account per *product*, not per order or per invoice. See
[docs/02-product-billing.md](docs/02-product-billing.md).

> **Status: pre-production.** A significant share of the codebase does not currently execute.
> Before trusting any flow, read [docs/10-known-issues.md](docs/10-known-issues.md).

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 (Create React App), React Router 7, Tailwind 3, axios |
| Backend | Node.js (ESM), Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Messaging | NATS JetStream (transactional outbox + consumers) |
| Realtime | Socket.IO |
| Auth | JWT + bcrypt |

## Quickstart

```bash
# 1. Infrastructure (Postgres on host port 5433, NATS, pgAdmin)
cd backend
docker compose up -d

# 2. Backend
cp .env.example .env        # fill in JWT_SECRET and POSTGRES_URL
npm install
npm run migrate
npm run dev                 # http://localhost:5000

# 3. Seed catalogue data (optional)
node scripts/seed_test_data.js

# 4. Frontend — NOTE: edit src/api.js to point at localhost first
cd ../frontend
npm install
npm start                   # http://localhost:3000
```

Full setup, environment variables and the operational runbook:
[docs/09-operations.md](docs/09-operations.md).

## Documentation

Start at [docs/README.md](docs/README.md).

| Document | What it covers |
|---|---|
| [01-overview.md](docs/01-overview.md) | Product, actors, glossary, subsystem status |
| [02-product-billing.md](docs/02-product-billing.md) | **The core design decision.** Read this early. |
| [03-architecture.md](docs/03-architecture.md) | Boot sequence, layering, middleware, module inventory |
| [04-data-model.md](docs/04-data-model.md) | All 26 tables, constraints, migrations |
| [05-api-reference.md](docs/05-api-reference.md) | Every HTTP endpoint |
| [06-events.md](docs/06-events.md) | NATS subjects, outbox, consumers, realtime |
| [07-domain-flows.md](docs/07-domain-flows.md) | End-to-end lifecycles |
| [08-frontend.md](docs/08-frontend.md) | Routes, auth, which screens are real vs mock |
| [09-operations.md](docs/09-operations.md) | Setup, env vars, workers, deployment |
| [10-known-issues.md](docs/10-known-issues.md) | Defect register — **read before debugging** |
| [11-design-critique.md](docs/11-design-critique.md) | Argued critique of the current design |
| [12-target-model.md](docs/12-target-model.md) | Proposed target model, including the POS |
| [13-migration-path.md](docs/13-migration-path.md) | Staged path from here to there |
| [14-simplification.md](docs/14-simplification.md) | What to eliminate (NATS, consumers) and what to keep |
| [15-delivery-confirmation.md](docs/15-delivery-confirmation.md) | Delivery agents and the retailer-held code |
| [16-offline-first.md](docs/16-offline-first.md) | Offline-first design for the shop counter |

## Repository layout

```
backend/
  src/
    app.js                  Express app + route mounts
    server.js               Boot: NATS -> HTTP -> Socket.IO -> consumers
    api-gateway/            routes/, controllers/, middlewares/
    modules/<domain>/       service + repository + events per domain
    consumers/              NATS JetStream consumers
    workers/                Out-of-process jobs (settlement)
    realtime/               Socket.IO server
    db/schema.js            Drizzle schema (the authoritative data model)
    config/                 postgres, nats, nats-streams
  drizzle/                  Generated migrations
  scripts/                  Seed scripts
frontend/
  src/
    App.js                  Route table
    api.js                  axios instance
    components/             Shared UI + AuthContext
    pages/                  Landing/, Retailers/, Distributors/
docs/                       This documentation
```

## Contributing

There is currently no CI, no linter for the backend, and no working test suite — see
[docs/09-operations.md](docs/09-operations.md). Until that changes, verify changes by running
the affected flow end to end.

When adding code, follow the layering convention documented in
[docs/03-architecture.md](docs/03-architecture.md): route → controller → service → repository.
Several existing modules do not; do not use them as a template.

## Author

Gunjan Kumar

## License

MIT
