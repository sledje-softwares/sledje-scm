# Deployment

**Status: not deployed.** This is the plan and the runbook. Nothing below has
been provisioned.

## Shape

| Piece | Where | Why |
|---|---|---|
| Frontend | Cloudflare Pages | Static Vite build, CDN, free. Serving it from Node buys nothing — and once it moves, `frontend/build` no longer needs to be committed. |
| Database | Supabase Postgres, **Mumbai (ap-south-1)** | Point-in-time recovery is the whole argument. This is a financial ledger; losing it is not an outage, it is the end of the business using it. |
| Backend | A small instance **in the same region as the database** | See latency, below. |
| NATS | **Not deployed** | It only drives Socket.IO fan-out, and `server.js` already degrades gracefully without it. Don't operate a broker you don't need yet. |

Project naming: **`sledje-scm`** (distinct from the other "sledje" /
"sledje software" resources on the same accounts).

## Two things that will bite

### 1. Supabase's pooler breaks transactions

Supabase's default connection string points at **pgBouncer in transaction
mode**, which does not support the session state `node-postgres` and Drizzle
rely on for `db.transaction()` and prepared statements.

This codebase has **22 `db.transaction` call sites**. Every sale, every
delivery confirmation and every synced operation runs inside one. A sale that
half-commits is the worst failure this system can have.

Use the **direct connection** (port 5432) or the **session-mode pooler**, not
the default transaction pooler. Verify before trusting it:

```sql
-- must return the same pid twice in one session
SELECT pg_backend_pid(); SELECT pg_backend_pid();
```

Then run `node scripts/verify_offline_sync.js` against the deployed database.
If transactions are being broken by the pooler, that suite fails loudly rather
than silently corrupting a bill.

### 2. Co-locate the app and the database

One sale is not one query. `consumeLayersForVariant` issues a `consumeLayer`
per FIFO cost layer plus a `getBillById` per accrual, all inside one
transaction. Chatty transactions punish cross-region latency brutally: the
difference between a 200 ms sale and a 2 s sale at the counter.

App region must match database region. Mumbai for both.

## Secrets

Generated per environment, never committed. `backend/.env.example` lists every
key.

```bash
# both are 32 bytes of hex
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # DELIVERY_CODE_KEY
```

`DELIVERY_CODE_KEY` encrypts delivery confirmation codes at rest. **Rotating it
makes every outstanding delivery code undecryptable**, so any order already in
transit can never be confirmed. Rotate only with no deliveries in flight.

Set `CLIENT_ORIGIN` to the Pages URL, or CORS reflects every origin.

## Runbook

```bash
# 1. Database — Supabase project "sledje-scm", region ap-south-1 (Mumbai)
#    Take the DIRECT connection string, not the transaction pooler.
export POSTGRES_URL='postgresql://...:5432/postgres'

# 2. Schema
cd backend && npx drizzle-kit migrate

# 3. Prove the deployed database actually works
VERIFY_I_KNOW_THIS_TRUNCATES=1 node scripts/verify_offline_sync.js
#    ^ TRUNCATES. Only ever against a fresh database, never one with real sales.

# 4. Frontend
cd ../frontend
VITE_API_URL=https://<backend-host> npm run build
#    deploy build/ to Cloudflare Pages (project: sledje-scm)

# 5. Backend — same region as the DB, with:
#    POSTGRES_URL, JWT_SECRET, JWT_EXPIRES_IN, DELIVERY_CODE_KEY,
#    CLIENT_ORIGIN=https://<pages-url>
```

## Before first real shop

- [ ] Confirm PITR is on. It is the reason for choosing managed Postgres.
- [ ] Restore-test it once. An untested backup is not a backup.
- [ ] `CLIENT_ORIGIN` set (otherwise CORS is open).
- [ ] Verify the pooler mode preserves transactions (above).
- [ ] Free tiers **suspend idle databases** — fine for staging, unacceptable for
      a shop that opens at 7am. Use a paid tier for anything real.
