# Events, Consumers and Realtime

> **This document describes the system as it existed before Stage 0's decision-1 was
> executed.** `src/consumers/`, `src/consumers1/`, and the dead `backend/realtime/` duplicate
> have all been **deleted**. Delivery -> stock -> product bill -> ledger is now one database
> transaction in `orders.service.js:completeOrder` / `applyDeliveryEffects`, triggered by a
> verified delivery code, not by NATS events. NATS is retained only for Socket.IO's best-effort
> realtime fan-out, which now degrades gracefully (the server no longer dies if NATS is down).
> See [10-known-issues.md](10-known-issues.md) for what was fixed vs deleted, and
> [15-delivery-confirmation.md](15-delivery-confirmation.md) for the new completion flow. The
> content below is kept as a record of what was removed and why.

## The intended pattern

Every state change follows the **transactional outbox** pattern:

1. Inside one DB transaction: write the domain rows **and** an `outbox` row.
2. After commit: publish the event to NATS JetStream.
3. Consumers react and write further domain rows.

This gives atomicity between "the thing happened" and "the event exists".

## Where it goes wrong immediately

After the transaction commits, most services **also** publish directly, best-effort:

```js
await db.transaction(async (tx) => { ...; await insertOutbox(tx, "orders.created", payload); });
publishEvent("orders.created", payload).catch(() => {});   // best effort
```

The outbox row will *also* be drained and published. So every event is published **twice**,
and the outbox's entire reason for existing — being the single reliable publish path — is
defeated. See [11-design-critique.md](11-design-critique.md).

## The stream

`EVENTS`, created by `ensureEventsStream()` in `backend/src/config/nats-streams.js`.
Its only caller is `realtime/socket.server.js`, so **the stream is created as a side effect of
starting the realtime layer**, not at boot.

Subjects captured: `orders.>`, `connections.>`, `inventory.>`, `notifications.>`,
`product_bills.>`, `invoice.>`, `products.>`, `payments.>`, `outbox.>`.
Storage: file. Retention: limits. Unlimited.

### Subjects that the stream does not capture

These are published but **fall outside the filter**, so they are rejected by JetStream:

| Subject | Published by |
|---|---|
| `users.registered` | `modules/auth/auth.service.js` |
| `users.password_reset` | `modules/auth/auth.events.js` |
| `product_bill.paid` (singular) | `modules/payments/payments.service.js` |
| `invoices.created` (plural) | `workers/settlement.worker.js` |

Note the naming inconsistency: `product_bill.paid` vs `product_bills.payment` vs
`product_bills.updated`. The filter is `product_bills.>`, so the singular form is silently lost.

## Two publisher implementations

| File | Behaviour on publish failure |
|---|---|
| `src/config/nats-streams.js` | **Swallows** the error, logs only |
| `src/events/jetstream.js` | **Rejects** — callers must `.catch()` |

Both also define `ensureEventsStream`, with **different subject lists** (`jetstream.js` uses
single-token wildcards `connections.*`; `nats-streams.js` uses `connections.>` and adds
`payments.>` and `outbox.>`). Modules are split roughly 60/40 between them. Only the
`nats-streams.js` version of `ensureEventsStream` is ever called.

## Subject catalogue

| Domain | Subjects |
|---|---|
| Orders | `orders.created`, `orders.modified`, `orders.cancelled`, `orders.accepted`, `orders.status.updated`, `orders.completed` |
| Orders (outbox only, no consumer) | `orders.rejected`, `orders.modified.approval`, `orders.modified.by_distributor` |
| Connections | `connections.requested`, `connections.approved`, `connections.rejected`, `connections.deleted` |
| Inventory | `inventory.variant_added`, `inventory.updated`, `inventory.updated_after_order` |
| Products | `products.created`, `products.updated`, `products.deleted` |
| Bills / payments | `product_bills.payment`, `product_bills.updated`, `product_bills.payment_applied`, `product_bill.paid`, `payments.captured` |
| Invoices | `invoice.generated`, `invoice.paid`, `invoices.created` |
| Auth | `users.registered`, `users.password_reset` |
| Notifications | `notifications.order_created`, `notifications.order_accepted`, `notifications.order_completed` |

> `payments.captured` is **consumed but never published** anywhere in the repository. It was
> intended to come from the Razorpay webhook, whose route is not mounted.

## Consumers

Started by `startAllConsumers()` in `backend/src/consumers/index.js`, in this order:

| Consumer | Subject | Durable | Effect | Status |
|---|---|---|---|---|
| `outbox.consumer.js` | *(none — 1s `setInterval`)* | — | Reads up to 50 `outbox` rows, publishes, **deletes** the row | ⚠️ |
| `inventory.consumer.js` | `orders.completed` | `inventory_orders_completed` | Decrements stock, inserts `retailer_inventory`, publishes `inventory.updated_after_order` | ❌ |
| `productBill.consumer.js` | `inventory.updated_after_order` | `product_bill_updater` | Find-or-create `product_bills`, `upsertDeliveryAndTransaction`, publishes `product_bills.updated` | ❌ |
| `ledger.consumer.js` | `product_bills.updated` | `ledger_updater` | Inserts a `ledger` row | ❌ |
| `payment.consumer.js` | `payments.captured` | `payments_handler` | `createPaymentTxAndUpdateBill`, publishes `product_bills.payment_applied` | ⚠️ never triggered |
| `notifications.consumer.js` | `notifications.>` | `notify_handler` | `console.log` only — a stub | ⚠️ |

`consumers/orders.consumer.js` exists but is **not imported** by `index.js`. It is the only
caller of `InventoryService.applyDeliveredOrder` and `ProductBillsService.applyDelivery`,
neither of which exists.

## The delivery chain

```mermaid
sequenceDiagram
    autonumber
    participant R as Retailer
    participant OS as orders.service
    participant OB as outbox
    participant IC as inventory.consumer
    participant PC as productBill.consumer
    participant LC as ledger.consumer

    R->>OS: PUT /orders/.../complete
    OS->>OB: outbox row "orders.completed" (in tx)
    OB-->>IC: orders.completed
    Note over IC: ❌ writes productVariants.stock<br/>(column dropped in 0001)
    IC-->>PC: inventory.updated_after_order
    Note over IC,PC: ❌ payload has no "items";<br/>PC destructures items -> TypeError
    PC-->>LC: product_bills.updated
    Note over LC: ❌ inserts {event, refId};<br/>ledger needs type/amount/balance NOT NULL
```

**The chain is broken at every hop.** In order:

1. `inventory.consumer.js` writes `stock: productVariants.stock - item.quantity` — arithmetic
   on a Drizzle column object rather than SQL, against a column that no longer exists.
2. It publishes `inventory.updated_after_order` **without an `items` field**, but
   `productBill.consumer.js:12` destructures `items` and immediately iterates it →
   `TypeError: items is not iterable`. This is where the chain actually stops.
3. `ledger.consumer.js` inserts `{ event, refId }` — neither column exists, and the table's
   `type`, `amount` and `balance` are all NOT NULL.

## Two outbox drains

Both exist, both work, and they have **opposite semantics**:

| | `consumers/outbox.consumer.js` | `modules/outbox/outbox.worker.js` |
|---|---|---|
| Started by | `startAllConsumers()` — in-process | Manually, as a separate process |
| Interval | 1s | 2s |
| Transport | JetStream (`publishEvent`) | **Core NATS** (`nc.publish`) |
| After publishing | **DELETEs** the row | Sets `published = true` |
| Reads | All rows, ignores `published` | `WHERE published = false` |

`backend/startup.text` instructs you to run the worker. `server.js` already runs the consumer.
**Running both double-publishes every event.**

## Dedupe — two schemes, both broken

| Implementation | Table it uses | Why it fails |
|---|---|---|
| `consumers/utils/dedupe.js` | `event_dedupe(event_id)` ✅ exists | **No publisher ever puts `eventId` in a payload**, so the key is always `undefined` and the second event violates the PK |
| `consumers/utils/js-consumer.js` | `event_dedup(message_id)` ❌ does not exist | Throws on every message, before the handler runs, killing the subscription loop |

`createConsumer` also catches handler errors and **neither acks nor naks** — a failing message
stalls until the ack wait expires.

> The one idempotency mechanism that **does** work is a domain constraint:
> `uq_product_delivery_order_bill` on `product_delivery_log`. That is the pattern to copy.

## `consumers1/` — abandoned predecessor

Never imported. Kept here so you recognise it as dead:

- `consumers1/inventory.consumer.js` — creates its own `ORDERS` stream; calls
  `updateInventory(...)` when the function is named `updateRetailerInventory` → `ReferenceError`.
- `consumers1/notifications.consumer.js` — **the only code in the repository that actually
  persists notification rows.** Unreachable: it imports
  `../api-gateway/routes/config/nats.js`, a path that does not exist.
- `consumers1/payments.consumer.js` — **not a consumer at all**; a verbatim older copy of
  `payments.service.js` with wrong import depths.

## Realtime (Socket.IO)

Live file: `backend/src/realtime/socket.server.js`.
Dead duplicate: `backend/realtime/socket.server.js` (imports `../config/nats.js`, resolving to
a directory that does not exist).

**Handshake:** token from `handshake.query.token` or `handshake.auth.token`, verified with
`jwt.verify` using a *local* copy of the verify logic (duplicating `AuthService.verifyToken`).

**Rooms joined on connect:** `user:<payload.id>` and `role:<payload.role>`.

**Subscribed subjects:** `orders.created`, `orders.modified`, `orders.accepted`,
`orders.status.updated`, `orders.completed`, `connections.requested`, `connections.approved`,
`connections.rejected`, `inventory.variant_added`, `inventory.updated_after_order`,
`notifications.>`.

**Fan-out:** builds a target list from `payload.order.retailerId`,
`payload.order.distributorId`, `payload.retailerId`, `payload.distributorId`,
`payload.userId`, `payload.role`; deduplicates; emits `"event"` with `{ subject, payload }` to
each room. **If no target can be derived, it calls `io.emit` — broadcasting to every connected
client.**

> ⚠️ **Targeted delivery never matches.** Rooms are keyed `user:<users.id>`, but payloads carry
> `retailerId` / `distributorId`, which are *profile* ids. The room name is therefore never
> found, and virtually every event falls through to the `io.emit` broadcast. **Every connected
> client receives every order and connection event in the system**, including other businesses'.
> This is both a correctness bug and a data-leak.

Two further notes: `notifications.>` is subscribed with `opts.durable(...)` on a **wildcard**
filter — the older root copy explicitly avoided this with the comment "wildcards cannot be
durable" — and the delivery inbox is suffixed `Date.now()`, so the durable is rebound to a new
delivery subject on every restart.
