# Sledje Documentation

Developer documentation for Sledje — a retailer↔distributor supply-chain platform being
built toward becoming the operating system for a retail shop.

## How to read these docs

Every page follows the same shape:

- **How it's meant to work** — the design, as intended.
- **Current state** — what actually runs today, linked to the defect register.

That split exists because a significant share of the code does not currently execute. Do not
assume a documented flow works; check [10-known-issues.md](10-known-issues.md) first.

## Reading order for a new developer

| # | Document | Read it for |
|---|---|---|
| 1 | [01-overview.md](01-overview.md) | What the product is, who the actors are, and the glossary. **Start here** — the naming is genuinely confusing and this page disambiguates it. |
| 2 | [02-product-billing.md](02-product-billing.md) | The single most important design decision in the system: credit is tracked per *product*, not per order. Nothing else makes sense without this. |
| 3 | [03-architecture.md](03-architecture.md) | How the backend is put together, how it boots, and the layering conventions. |
| 4 | [04-data-model.md](04-data-model.md) | All 26 tables, their relationships and constraints. |
| 5 | [05-api-reference.md](05-api-reference.md) | Every HTTP endpoint. |
| 6 | [06-events.md](06-events.md) | NATS subjects, the outbox pattern, consumers, and realtime. |
| 7 | [07-domain-flows.md](07-domain-flows.md) | End-to-end lifecycles: onboarding, connections, orders, delivery, billing, invoicing. |
| 8 | [08-frontend.md](08-frontend.md) | The React app: routes, auth, and which screens are real vs mock. |
| 9 | [09-operations.md](09-operations.md) | Running it locally, environment variables, workers, deployment. |
| 10 | [10-known-issues.md](10-known-issues.md) | The defect register. What is broken, where, and why. |

## Design documents

These are forward-looking and record decisions, not current behaviour.

| Document | Purpose |
|---|---|
| [11-design-critique.md](11-design-critique.md) | An argued critique of the current design, ordered by consequence. |
| [12-target-model.md](12-target-model.md) | The proposed target data model, including the sell-side (POS). |
| [13-migration-path.md](13-migration-path.md) | Staged path from today's schema to the target. |
| [14-simplification.md](14-simplification.md) | What to eliminate — NATS, consumers, the outbox pattern — and what to keep. |
| [15-delivery-confirmation.md](15-delivery-confirmation.md) | The delivery agent as a third actor, and the retailer-held confirmation code. |
| [16-offline-first.md](16-offline-first.md) | **Built.** The shop working without a network: client ULIDs, the append-only outbox, `POST /sync` and its exactly-once guarantee, conflict policy, and where skipping the stock ledger stops being safe. |

## If you're here to fix something

Go straight to [10-known-issues.md](10-known-issues.md). It is ordered by severity, and every
entry carries a `file:line` reference.

## If you're here to build the next thing

Read [02-product-billing.md](02-product-billing.md), then
[11-design-critique.md](11-design-critique.md) and [12-target-model.md](12-target-model.md).
The short version: the procurement half of the product is built, the sell-side is not, and the
billing model needs the sell-side to deliver its value.
