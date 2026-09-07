# What to Eliminate

> **Executed.** The NATS elimination recommended below has been carried out: `src/consumers/`,
> `src/consumers1/`, and the dead `backend/realtime/` duplicate are deleted, `server.js` no
> longer depends on NATS to boot, and delivery -> billing -> ledger is one transaction. The
> `modules/payments/` fold (also recommended here) is done too. See
> [10-known-issues.md](10-known-issues.md) for the verified before/after. This document is kept
> as the rationale record.

An assessment of whether NATS, the event/consumer layer, the outbox, Socket.IO and Drizzle
earn their place — with a verdict and a replacement for each.

## The measurement

```
Total backend source                      7,367 lines
Messaging / eventing layer                1,382 lines   (19%)
  src/consumers/                            384
  src/consumers1/                           527   (dead)
  src/realtime/                             134
  src/modules/outbox/                        96
  src/config/nats*.js                        79
  src/events/                                41
  backend/realtime/ (dup)                   121
```

**Nineteen percent of the backend is messaging infrastructure.** Measured against what it
delivers: on a clean NATS, **five of six consumers fail to start** (P0-27), the
delivery→billing→ledger chain is dead at every hop, and every domain event is published twice
(outbox drain *and* best-effort direct publish).

The event layer currently has a **negative** return: it costs 19% of the codebase, contributes
zero working functionality, and is where the highest concentration of defects lives.

---

## NATS / JetStream — **eliminate**

**Verdict: remove entirely.**

### Why it was reached for

The transactional outbox + durable consumers pattern solves a real problem: keeping a database
write and a message publish atomic across service boundaries, so that a crash between them
cannot lose an event.

### Why it does not apply here

- **There are no service boundaries.** `server.js` starts the API, the Socket.IO server *and*
  every consumer in one process. A "message" is a function call that took a 40 ms detour
  through a broker and a durable stream.
- **The atomicity it buys is thrown away.** Services write an outbox row inside the
  transaction and then *also* publish directly, best-effort. Both paths fire, so every event
  is delivered twice and the outbox guarantees nothing.
- **The reliability it buys is negated.** Two competing outbox drains with opposite semantics
  (one deletes rows, one marks them published), two dedupe schemes that both fail, and
  consumers that neither ack nor nak on error.
- **The one thing that works is not NATS.** Idempotency in the billing path is enforced by
  `uq_product_delivery_order_bill` — a plain unique constraint.
- **Offline-first makes it worse, not better.** The hard synchronisation problem is moving to
  the *device* (see [16-offline-first.md](16-offline-first.md)). A server-side broker does
  nothing for a shopkeeper whose phone has no signal. It adds a second queue behind the one
  that actually matters.

### What replaces it

| Today | Replacement |
|---|---|
| `orders.completed` → inventory → bill → ledger, via 3 consumers | **One database transaction** in the delivery-confirmation service. Synchronous, atomic, stack-traceable. |
| `notifications.*` events | Direct insert into `notifications` in the same transaction |
| Socket.IO fan-out driven by JetStream subscriptions | Emit directly from the service after commit |
| Async work (email, PDF generation) | A `jobs` table polled by one worker — ~40 lines, no broker |

The `outbox` **table** survives as that `jobs` table. The broker does not.

### What you give up

Honestly: a durable replay log, and the ability to add a consumer without touching the
producer. Neither is needed at one process and two actor types. If Sledje later splits into
services or needs an analytics pipeline, reintroduce a broker **then** — reintroducing it is a
week; carrying a broken one has already cost far more.

### Deletion list

```
src/consumers/            (6 files + utils)   -- 384 lines
src/consumers1/           (3 files, dead)     -- 527 lines
src/events/jetstream.js                       --  41 lines
src/config/nats.js, nats-streams.js           --  79 lines
backend/realtime/socket.server.js (dup)       -- 121 lines
src/modules/outbox/outbox.worker.js           -- keep the table, drop the NATS worker
```

Plus: remove `nats` from `package.json`, and the `nats` service from `docker-compose.yml`.
Net removal ≈ **1,150 lines and one piece of infrastructure**, replacing perhaps 150 lines of
transactional service code.

---

## Socket.IO — **keep, but demote**

**Verdict: keep for the distributor's order screen. Do not put it on the critical path.**

Live order notifications genuinely help a distributor watching for incoming orders. But today:

- Rooms are keyed `user:<users.id>` while payloads carry profile ids, so targeting **never
  matches** and virtually every event hits the `io.emit` broadcast fallback — **every client
  receives every order and connection event in the system** (P1-6).
- It is the only caller of `ensureEventsStream()`, which is why the consumers race it at boot.

Once NATS is gone, Socket.IO is fed directly by services after commit, and the room bug is
fixed by putting `entityId` in the JWT. If you want to cut further, server-sent events or
30-second polling would serve a distributor's order list adequately — but Socket.IO is already
working and cheap once decoupled.

---

## The outbox table — **keep, repurposed**

The pattern is wrong for events here, but the *table* is the right shape for background jobs
that must not be lost: invoice PDF generation, transactional email, end-of-day rollups.

Keep `outbox` (rename to `jobs`), keep exactly **one** drain, drop the NATS publish, run
handlers in-process. Delete `consumers/outbox.consumer.js` (which deletes rows and loses the
audit trail) and keep the worker's `published = true` semantics.

---

## Drizzle — **keep. It is not the problem.**

**Verdict: keep, unambiguously.**

Drizzle is doing its job. Nine of the P0 defects are the same misuse — `col.eq(x)`,
`col.in(xs)`, `query.and(...)` — which is a **learning gap, not a tool failure**. The
corrections are mechanical:

```js
// wrong (a Drizzle column is not a query builder)
.where(productVariants.id.in(variantIds))
.where(eq(notifications.userId, id)).and(eq(notifications.read, false))

// right
import { eq, and, inArray, gte } from "drizzle-orm";
.where(inArray(productVariants.id, variantIds))
.where(and(eq(notifications.userId, id), eq(notifications.read, false)))
```

Reasons to keep it:

- The schema in `backend/src/db/schema.js` is genuinely good — it is the most coherent artifact
  in the repository, and the migrations apply cleanly (verified).
- Migration tooling already works; the generated SQL is correct.
- Removing it means hand-writing SQL for 26 tables, which trades nine mechanical fixes for
  thousands of lines of new surface — and the two places that *do* hand-write SQL are the two
  places with SQL-injection defects (P1-1, P1-2).

**Do this instead:** add ESLint with a rule banning `.eq(`/`.in(`/`.and(` as member calls on
schema objects, so the mistake cannot recur. That is a config file, not a rewrite.

---

## Summary

| Component | Verdict | Rationale |
|---|---|---|
| **NATS / JetStream** | ❌ **Eliminate** | Broker between functions in one process; guarantees already defeated; 5/6 consumers don't start |
| **`src/consumers/`** | ❌ **Eliminate** | Replace with one transaction in the request path |
| **`src/consumers1/`** | ❌ **Delete** | Dead, unreachable — but salvage its notification-writing code first |
| **`src/events/jetstream.js`** | ❌ **Delete** | Duplicate publisher |
| **Outbox pattern for events** | ❌ **Eliminate** | Defeated by the direct publish beside it |
| **Outbox table** | ✅ **Keep as `jobs`** | Right shape for durable background work |
| **Socket.IO** | ✅ **Keep, demote** | Useful for distributors; fix targeting; off the critical path |
| **Drizzle** | ✅ **Keep** | Good schema, working migrations; the defects are misuse, fixable mechanically |
| **Postgres** | ✅ **Keep** | Not in question |

**Net effect:** roughly **1,150 lines and one service removed**, the delivery→billing→ledger
chain becomes a single transaction you can put a breakpoint in, and the deployment drops from
"Postgres + NATS + app + two workers" to "Postgres + app + one worker".
