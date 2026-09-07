# Offline-First

**Built.** Backend: `modules/sync/`, `modules/sales/` (op appliers, `bill-number.js`),
migration `0008_offline_sync`. Frontend: `src/offline/` (Dexie, outbox, sync loop),
`vite.config.js` (`vite-plugin-pwa`), `public/sledje-sync-sw.js`.

Verified end to end — see **Verification** at the bottom of this page. The design below is
what was implemented; the sections marked *as built* record where reality needed more than
the sketch.

## Why this is not optional

A kirana counter has intermittent connectivity. If billing a customer stops when the network
does, the shopkeeper reaches for the notebook — and does not come back. Offline capability is
the difference between software a shop *uses* and software a shop *tried*.

It is also far cheaper to decide now. The sell-side does not exist yet
([12-target-model.md](12-target-model.md)), so its schema and API can be designed
sync-friendly from the first line. Retrofitting offline onto a server-authoritative POS means
rewriting it.

## What must work offline, and what must not

Not everything deserves the complexity. Be deliberate:

| Capability | Offline? | Why |
|---|---|---|
| **Bill a customer (POS)** | **Must** | The whole argument. A sale must never be blocked. |
| **View shelf / stock / prices** | **Must** | Read cache; useless if it needs the network |
| **Add a customer, record khata payment** | **Must** | Part of the counter flow |
| **Day close** | **Must** | Happens at closing time, often on a dying connection |
| **Delivery confirmation (agent app)** | **Should** | Agents are outdoors on mobile data — see below |
| **Order to distributor** | **Should queue** | Not urgent, but should not fail; queue and send |
| **Catalogue browse / search** | Partial | Cache what the retailer stocks; full search needs the server |
| **Connections, distributor discovery** | **No** | Inherently online, and rare |
| **Payments to distributor** | **No** | Money movement must be server-authoritative |
| **Invoices / GST documents** | **No** | Statutory, server-generated |

## Architecture

```mermaid
flowchart LR
    subgraph device[Device — works with no network]
        UI[POS UI]
        DB[(IndexedDB<br/>Dexie)]
        OB[(outbox<br/>append-only)]
        SW[Service worker<br/>Workbox]
    end
    subgraph server[Server]
        API[POST /sync]
        PG[(Postgres)]
    end
    UI -->|write| DB
    UI -->|enqueue op| OB
    DB -->|read| UI
    OB -->|batch, when online| API
    API -->|idempotent apply| PG
    PG -->|changed-since pull| DB
    SW -.->|cache app shell + assets| UI
```

## The five decisions that make it work

### 1. Client-generated identifiers

Sales get **ULIDs generated on the device**, never server-assigned ids.

```js
import { ulid } from "ulid";
const saleId = ulid();   // 01JQ... — sortable, monotonic, collision-free across devices
```

Without this, a sale cannot exist until the server responds — which is precisely what offline
means it cannot do. ULID over UUIDv4 because it sorts by creation time, which makes sync
ordering and index locality free.

**As built.** `sales.id`, `sale_items.id` and `sale_payments.id` are `varchar(26)`, minted on
the device (`0008_offline_sync`). `sales` also gained `device_id`, `synced_at`, `voided_at`
and `void_reason`. `ledger.reference_id` had to widen from `uuid` to `text` — it is a
polymorphic reference and cannot be narrower than the widest id it points at.

Customers are the deliberate exception: they stay server-generated and are merged on
`(retailer_id, phone)` by the existing `uq_customer_phone` constraint, so a `sale.create` op
carries `{name, phone}` inline rather than a client id. Two devices adding the same walk-in
therefore converge with no alias table, which is the outcome the conflict table below asks
for by a simpler route.

### 2. An append-only device outbox

Every mutation is an **operation record**, not a state diff:

```js
// Dexie schema
db.version(1).stores({
  sales:        "id, soldAt, syncState",
  saleItems:    "id, saleId",
  salePayments: "id, saleId",
  customers:    "id, phone",
  stockCache:   "variantId",
  priceCache:   "variantId",
  outbox:       "++seq, opId, type, syncState"   // append-only, ordered
});
```

Operations are `sale.create`, `sale.void`, `customer.create`, `khata.payment`,
`day.close`, `order.create`, `delivery.confirm`. Each carries an `opId` (a ULID) and is never
mutated after being written — replay is always safe.

**As built** (`frontend/src/offline/db.js`):

```js
db.version(1).stores({
  sales:        "id, soldAt, syncState, billNumber",
  saleItems:    "id, saleId, variantId",
  salePayments: "id, saleId",
  shelf:        "variantId, lastUpdated",   // price cache lives on the same row
  outbox:       "++seq, opId, type",        // append-only
  acks:         "opId, status, at",         // written when the server answers
  meta:         "key",                      // deviceId, deviceCode, billCounter, cursor
});
```

Note `acks` as a **separate table**. "Never mutate a queued op" has to mean literally never,
so acknowledgement cannot be a status column on the op — an op you can edit is an op whose
replay is no longer safe, and replay safety is the entire basis of the protocol. *Pending* is
therefore a derived question ("an outbox row with no ack"), not a flag somebody has to
remember to clear.

Three op types are implemented: `sale.create`, `sale.void` and `price.set`. `khata.payment`
and `day.close` are not, because the tables they would write (`customer_ledger`, `day_close`)
do not exist yet — they are Stage 2 leftovers. Adding them is one entry in `OP_APPLIERS`
each; the protocol does not change.

### 3. An idempotent batch sync endpoint

```
POST /sync
{
  "deviceId": "dev_01JQ...",
  "ops": [
    { "opId": "01JQ...", "type": "sale.create", "at": "...", "payload": { ... } },
    { "opId": "01JQ...", "type": "khata.payment", "at": "...", "payload": { ... } }
  ],
  "cursor": "2026-09-07T10:00:00Z"
}
```

Server behaviour:

- **Idempotency by `(device_id, op_id)`** in a `sync_ops` table with a unique constraint.
  A replayed op is acknowledged, not reapplied. This is the same discipline as
  `uq_product_delivery_order_bill` — let the database enforce exactly-once.
- Ops applied **in order**, each in its own transaction. First failure stops the batch and
  returns the failing `opId`, so the device does not skip past it.
- Response carries a new `cursor` plus rows changed since the old one (prices, catalogue,
  order statuses, delivery states) for the device to merge.

Batch, don't drip: a shop coming back online after four hours has hundreds of ops, and one
request per sale will not survive a weak connection.

**As built** — `POST /sync`, `modules/sync/sync.service.js`. Request adds `deviceCode` and an
optional `deviceLabel`; the response is:

```jsonc
{
  "device":  { "id": "01JQ…", "deviceCode": "K7Q3M9", "codeConflict": false },
  "results": [ { "opId": "01JQ…", "status": "applied",   "data": { "billNumber": "K7Q3M9-00042", … } },
               { "opId": "01JQ…", "status": "duplicate", "data": { … the FIRST application's result … } } ],
  "failed":  null,                      // or { opId, code, message }
  "cursor":  "2026-09-08T10:05:00.000Z",
  "changed": { "sellable": [ … ], "sales": [ … ] }
}
```

Four properties are worth spelling out, because each of them is a bug if you get it backwards:

* **The claim is inside the op's own transaction.** `sync_ops` is inserted with
  `ON CONFLICT DO NOTHING`; nothing returned means we have applied this op before, so it is
  acknowledged and *not* re-run. Because the claim commits or rolls back with the effects, a
  failed apply genuinely retries rather than being permanently marked done.
* **A replay is answered from the stored result**, not with a bare "ok". A device that never
  saw the original response still learns the bill number the server assigned it.
* **`sales.id` is a second, independent guard.** Even with the `sync_ops` row bypassed
  entirely, a duplicate sale insert violates the primary key rather than double-counting.
* **The cursor is taken before the changed rows are read**, so a write that lands mid-read is
  picked up by the next pull instead of falling into the gap between the two.

### Bill numbers, as built

`SalesRepo.nextBillNumber()` computed `count(*) + 1`. That is broken twice over: it cannot run
offline at all, and online it is a lost-update race — two devices both read `count = 2`, both
mint `BILL-00003`, and `uq_sale_bill(retailer_id, bill_number)` fails the second one *after*
the customer has paid and left.

The scheme (`backend/src/modules/sales/bill-number.js`, `frontend/src/offline/device.js`):

```
billNumber = "<DEVICECODE>-<counter>"       e.g.  "K7Q3M9-00042"
```

* `DEVICECODE` — six Crockford-base32 characters taken from the **tail** of the device's own
  ULID. The tail, not the head: a ULID's leading 10 characters are its millisecond timestamp,
  so two tills set up in the same shop on the same afternoon would share them.
* `counter` — a per-device monotonic integer in the device's own database, incremented in the
  same Dexie transaction that writes the sale.

Uniqueness holds because the counter is unique within a device and the code is unique across
devices. Nothing is asked of anyone.

**Why not just use the ULID as the bill number?** Because a bill number is read aloud, written
on a paper slip and searched for later. The ULID is the *identity*; the bill number is the
human handle, and a shopkeeper wants "42" to mean the forty-second bill on that till. Giving
up per-till sequence to gain uniqueness the ULID already provides is a bad trade.

**And when two devices do draw the same six characters?** Only devices of the same retailer can
collide, at roughly one in a billion — but "unlikely" is not an answer on the money path, and
the op carrying the number is append-only and must not be rewritten. So the **server**
resolves it: `SalesRepo.claimBillNumber` walks past a taken number, and the assigned value
comes back in the op's result for the device to adopt. That is server → client state, not a
mutated op. `sync_devices` carries `uq_sync_device_code(retailer_id, device_code)` so a device
registering a prefix another till already holds is told to rotate for *future* bills; bills
already queued keep the numbers they were written with.

### 4. Conflict policy — stated, not discovered

The only conflict rules that survive contact with a real shop:

| Situation | Rule |
|---|---|
| A synced sale is edited | **Not allowed.** Sales are immutable once synced. A correction is a **new** op — a void plus a re-bill, or a `return_in` movement. Same append-only discipline as the money ledger. |
| Two devices sell the last unit | **Both sales stand.** On-hand goes negative; the shop is told to reconcile. Refusing a sale that physically happened is worse than a negative number. |
| Price changed on the server mid-offline | The **device's cached price at time of sale** is authoritative for that sale. It is what the customer paid. New price applies to the next sale. |
| Same customer created on two devices | Merge on `(retailer_id, phone)`; the earlier ULID wins the id, the other becomes an alias. |
| Day close submitted twice | Idempotent on `(retailer_id, business_date)` — the existing unique constraint. |

**Never last-write-wins on a sale.** It silently destroys revenue records.

**As built.** Immutability is enforced by there being no edit path at all: `sales` has no
update route, and the only correction is `POST /sales/:saleId/void` or a `sale.void` op.
`applySaleVoid` is the exact inverse of `applySaleCreate` — units back on the shelf, units
back into the *specific* FIFO layers they came from, the accrual reversed out of money due and
back into consignment, and an offsetting ledger credit.

That "specific layers" part needed one addition: `recordSaleAccrual` now writes the layer
breakdown (`[{layerId, qty, unitCost}]`) into the accrual transaction's `metadata`. Without it
a void has to *guess* which layers to give the units back to, and guessing wrong silently
changes what the retailer owes. `idx_pbt_sale` indexes `metadata->>'saleId'` so the reversal
is not a scan of every transaction the shop has ever written.

The reversal deliberately does **not** clamp `outstanding_balance` at zero. If the retailer had
already paid for units they have now voided, the balance *should* go negative — that is a
credit they are owed, and clamping it away is destroying money.

### 5. Stock is derived, which is what makes this tractable

This is why [12-target-model.md](12-target-model.md) moves stock to `stock_movements`. An
append-only movement log **merges without conflict** — two devices each append their own
`sale_out` rows and the sum is correct. A mutable `stock = stock - qty` counter cannot merge:
two offline devices both write `stock = 40` and one sale vanishes.

**Offline-first and the stock-ledger redesign are the same decision.** Doing one without the
other does not work.

### What was actually built, and where the deferral stops being safe

`stock_movements` (Stage 1 of [13-migration-path.md](13-migration-path.md)) is **still
unbuilt**. `inventory.qty` is still a mutable counter. Offline sync was built anyway, on one
condition that makes the deferral survivable:

> **Sync applies OPERATIONS, never absolute state.**

Every write is a delta — `qty = qty - n` in SQL (`RetailerInventoryRepo.addToShelf`), never
`qty = 40`. Deltas from two devices commute; absolute writes do not. Two devices that each
computed "on-hand is now 40" and wrote it would erase one another, and one sale would vanish
with nothing left to notice it by. That is the lost-update bug the movement log exists to
prevent, and applying deltas avoids it *for concurrent sales* without the table.

The same discipline is mirrored on the client. `shelf.qty` is the server's last word — a
snapshot of a mutable counter, and therefore a **cache to display, never a value to write
back**. What the POS actually shows is `serverQty − pendingOutflow`: the snapshot minus every
queued sale the snapshot does not yet know about (`frontend/src/offline/pos.js`). Displaying
the raw cached number would show a shopkeeper stock they have already sold, and a later pull
would appear to "restore" it.

**Where this stops being enough.** Deltas are safe as long as every writer is expressing a
*change*. The deferral breaks the moment something wants to express a *level*:

| Situation | Why the counter fails | Status |
|---|---|---|
| Two tills selling concurrently | Safe — both deltas apply, on-hand can go negative and the shop reconciles | **Works today** |
| **Stock-take / physical count** | "There are 37 on the shelf" is an absolute. Written as `qty = 37` it silently discards every sale still queued on another device. Written as a delta it needs a *baseline*, and a mutable counter has no history to take one from. | **Not safe. Do not build stock-take before Stage 1.** |
| **Two devices, one long offline** | The negative on-hand is recoverable, but there is no record of *when* each unit left, so the shop cannot tell a genuine oversell from a mis-scan. `sale_items` carries the sales; nothing carries receipts, returns, damage or transfers. | Degraded — usable, not auditable |
| Returns, damage, expiry write-offs | Each is a movement type with no home. They would have to become ad-hoc counter edits, which is how a counter starts drifting from reality. | Blocked on Stage 1 |
| Reconciling a negative on-hand | The prompt exists (the POS shows it); the *fix* is a stock-take, so it hits the first row of this table. | Prompt only |

In short: **Stage 1 is now the gating dependency for stock-take and reconciliation**, not for
offline billing. Sales and voids are safe under the counter because they are deltas. Anything
that states a level is not, and must wait for the movement log.

## Tooling

| Concern | Choice | Note |
|---|---|---|
| Local database | **Dexie.js** | Best IndexedDB ergonomics; typed tables, live queries via `dexie-react-hooks` |
| Ids | **`ulid`** | Sortable, offline-safe |
| Service worker | **Workbox** | App-shell precache, runtime caching for catalogue images |
| Build / PWA | **Vite + `vite-plugin-pwa`** | See migration note below |
| Background flush | **Background Sync API**, with a fallback | Chrome/Android support is good; Safari has none — fall back to flush on `online` + a 60 s timer + flush on app focus |
| Server dedupe | Postgres unique index | Not an in-memory cache |

### As built — two things the table above got wrong

**Background Sync is a doorbell, not a door.** `public/sledje-sync-sw.js` listens for the
`sledje-flush` sync tag and `postMessage`s any open page. The flush itself stays *in the page*:
the auth token lives in `localStorage`, which a service worker cannot read, and duplicating the
sync client into a second execution context would leave two implementations of the money path
to keep in step. Chrome-only, and the page's own `online` + `focus` + 60-second timer triad is
the real mechanism — which is what the fallback row was already saying, but it is worth being
blunt that the fallback carries the load on every iPhone.

**`generateSW`, not `injectManifest`.** The only custom service-worker code needed is that
doorbell, and `workbox.importScripts` carries it without pulling the Workbox runtime into
application source.

### The precache trap this walked into

Workbox's install is **all-or-nothing**: one precache entry that 404s or 500s and the whole
service worker goes `redundant`. There is no offline app at all — silently, with a perfectly
working online app to hide it.

That is exactly what happened. `frontend/public/%PUBLIC_URL%/` is CRA-era junk containing a
screenshot whose filename holds a U+202F narrow no-break space; the static server answers it
with a 500. A `globPatterns: ["**/*.{js,css,html,ico,png,…}"]` swept it into the manifest and
the service worker never activated once. Compile-time checks were entirely green.

Two lessons, both now encoded in `vite.config.js`:

1. **Precache the shell, and only the shell.** Every entry in that list is a way for the
   offline POS to stop existing. `globIgnores` excludes `%PUBLIC_URL%/`.
2. **Weight is a correctness problem, not a performance one.** The marketing pages carry
   ~11 MB of PNGs. A shopkeeper on a weak connection never finishes an 11 MB install, and an
   unfinished install is an uninstalled service worker. Excluding `assets/*.png` took the
   precache from 11.7 MB / 29 entries to 1.6 MB / 13.

### The CRA problem — resolved

The frontend **was** Create React App 5 (deprecated, unmaintained, PWA support removed from the
template). **It is now Vite 6** ([08-frontend.md](08-frontend.md) → Toolchain): `index.html`
relocated to the frontend root, `process.env.REACT_APP_API_URL` → `import.meta.env.VITE_API_URL`,
JSX-in-`.js` handled via the esbuild loader (no file renames), `build.outDir` kept at `build/`,
and `react-scripts test` → Vitest. No `svgr` plugin was needed (zero SVG imports). The next
step here is adding **`vite-plugin-pwa`** for the Workbox service worker.

## The agent app is offline too

A delivery agent standing in a shop doorway is the *most* likely person to have no signal, and
[15-delivery-confirmation.md](15-delivery-confirmation.md) requires server-side code
verification.

Resolution: when a run is assigned, the server issues the agent a **signed delivery token**
containing an HMAC of the code (not the code):

```
token = sign({ deliveryId, codeHmac: HMAC(serverKey, code), exp })
```

The agent's device verifies the entered code against `codeHmac` **locally**, shows success, and
queues a `delivery.confirm` op. The server re-verifies on sync — the offline check is a UX
affordance, not the authority. If the server rejects, the delivery reverts to `picked_up` and
both parties are notified.

Brute-force protection must stay **server-side**; the local check is advisory only, since a
determined agent controls their own device.

## Sequencing

Offline work depends on the sell-side existing, which depends on the system running.

1. **Stage 0** — make it run ([13-migration-path.md](13-migration-path.md)). Nothing below is
   verifiable until order creation works.
2. **Vite migration** — before the POS, not after.
3. **Stage 1** — stock as movements. *Prerequisite:* mutable stock cannot sync.
4. **Stage 2** — the sell-side, built online-first but with ULIDs, op-shaped writes and a
   `/sync`-compatible API from day one. Costs almost nothing; saves the rewrite.
5. **Stage 7** — Dexie, the outbox, the service worker, and the sync loop.

Building Stage 2 with server-assigned ids and REST-shaped mutations, then trying to add offline
in Stage 7, is the single most expensive mistake available here.

**What actually happened.** Stage 2 *was* built with server-assigned uuids and a REST-shaped
`POST /sales`, so Stage 7 paid part of that bill: `0008_offline_sync` converts three primary
keys and a foreign-key pair in place. It was cheap only because the POS was new and the tables
were empty. The migration uses `USING id::text`, so existing sales keep their identity rather
than being dropped — but on a table with real history the `varchar(26)` width would have had to
widen to hold 36-character uuid strings.

Stage 3 (stock as movements) was **skipped**, deliberately and with a stated limit — see
*Where the deferral stops being safe* above.

The shape that avoided the rest of the rewrite: `POST /sales` and `POST /sync` now run the
**same op appliers** (`applySaleCreate`, `applySaleVoid`, `applyPriceSet` in
`modules/sales/sales.service.js`). Each takes an open transaction and a plain payload and knows
nothing about HTTP. If the two paths had separate implementations, the offline one would be the
one nobody tests — and it is the one handling sales made while the shop could not see the
server.

---

## Verification

Two suites, both run against a throwaway Postgres. Neither is a compile-time check: a
double-count bug and a white-screen bug in this repo both passed compile-only checks and were
caught only by running the app, and the service-worker failure above was a third.

### `backend/scripts/verify_offline_sync.js` — 42 assertions

Boots the real Express app against a real database and asserts with data:

1. **The worked example, sold through the offline path.** Receive 50 @ ₹10, receive 50 @ ₹12,
   sell 60 as a `sale.create` op, pay ₹500 → due **₹620**, consignment **₹480**, outstanding
   **₹120**, exposure ₹600.
2. **Replay.** The identical batch resent three times (including the same op twice within one
   batch): every op comes back `duplicate`, and sale count, shelf qty and the full product-bill
   row are byte-identical before and after.
3. **First-failure stop.** A three-op batch with a bad middle op applies the first, names the
   failing `opId`, and leaves the third queued. Retrying dedupes the first and stops on the
   same op again — nothing is skipped.
4. **Two devices.** Concurrent batches selling 4 + 4 of a 5-unit stock: both sales stand, both
   bill numbers differ, on-hand is −3, and only the 5 units with cost layers accrue.
5. **Void.** Shelf and product bill restored to the exact prior values; the replayed void is a
   duplicate.
6. **Pull side.** Cursor moves, unchanged rows are not re-sent, a variant that moved comes back.

```bash
docker run -d --name sledje-verify -e POSTGRES_PASSWORD=scratch \
  -e POSTGRES_USER=scratch -e POSTGRES_DB=sledje_offline -p 55432:5432 postgres:15
export POSTGRES_URL=postgresql://scratch:scratch@localhost:55432/sledje_offline
cd backend && npx drizzle-kit migrate
VERIFY_I_KNOW_THIS_TRUNCATES=1 node scripts/verify_offline_sync.js
```

### Browser — 31 assertions, real Chrome

Driven with Playwright against the production build (`vite preview`), with a real service
worker and the network genuinely cut at the browser:

* The shelf arrives over the `/sync` pull; nothing queued on a fresh till.
* **Network killed.** Three sales rung up through the actual UI. Bill numbers are issued with
  no server (`JGDP38-00001…3`), three "queued" chips appear, the server has heard nothing, and
  on-hand already shows 94 rather than the server's stale 100.
* **Reload while offline.** The app opens from the service-worker cache and all three queued
  sales are still there.
* **Network back.** The queue drains, chips flip to "synced", and the server holds exactly
  three sales, six units, shelf 94 — then every op is force-resent and *nothing moves*.
* **Two browser profiles = two devices.** Both sell 20 of a 30-unit stock while offline. Both
  sales survive, all 40 units are on the record, on-hand is −10, bill numbers differ, and the
  counter is prompted to reconcile.
* The worked example re-checked through the browser: ₹620 / ₹480 / ₹120.
