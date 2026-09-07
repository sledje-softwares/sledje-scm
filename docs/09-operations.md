# Operations

## Prerequisites

- Node.js 18+ (the code uses ESM throughout and relies on a global `crypto`, so 19+ is safer)
- Docker + Docker Compose (for Postgres and NATS)
- npm

## Local setup

### 1. Infrastructure

```bash
cd backend
# POSTGRES_USER / POSTGRES_PASSWORD are read from your shell or a .env in this directory
docker compose up -d
```

`backend/docker-compose.yml` provides three services. **There is no container for the backend
or frontend, and no Dockerfile anywhere.**

| Service | Image | Host port | Notes |
|---|---|---|---|
| `postgres` | `postgres:15` | **5433** → 5432 | Database `sledje`; credentials from `${POSTGRES_USER}` / `${POSTGRES_PASSWORD}`; volume `pgdata` |
| `nats` | `nats:latest` | 4222, 8222 | Started with `-js --store_dir=/data`; volume `natsdata` |
| `pgadmin4` | | 8080 | Hardcoded login `admin@local.com` / `admin` |

> ⚠️ Postgres is on host port **5433**, not 5432. Your `POSTGRES_URL` must say `5433`.

### 2. Backend

```bash
cd backend
cp .env.example .env      # then fill in the values
npm install
npm run migrate           # drizzle-kit migrate
npm run dev               # nodemon src/server.js  -> http://localhost:5000
```

> `drizzle.config.js` **never calls `dotenv.config()`**, so `drizzle-kit` only sees
> `POSTGRES_URL` if it is exported in your shell. If `npm run migrate` reports a missing URL,
> `export POSTGRES_URL=...` first. This is a known defect, not your setup.

Smoke test:

```bash
curl -i http://localhost:5000/products/get
```

### 3. Seed catalogue data

```bash
cd backend
node scripts/seed_test_data.js
node scripts/seed_more_data.js
```

These insert distributorships, products and variants only. **They create no users, retailers,
distributors, connections or orders** — register accounts through the API first if you want a
full flow.

### 4. Frontend

```bash
cd frontend
npm install
npm start                 # -> http://localhost:3000
```

> ⚠️ **You must edit `src/api.js` by hand to point at localhost.** The `baseURL` is hardcoded
> to the Render production host, and `REACT_APP_API_URL` is not wired up. Remember not to
> commit that edit. See [08-frontend.md](08-frontend.md).

## Separate processes

`backend/startup.text` is the original runbook. `server.js` already starts all NATS consumers
in-process, so **do not also run the outbox worker** unless you have removed
`consumers/outbox.consumer.js` from `consumers/index.js` — running both double-publishes every
event ([06-events.md](06-events.md)).

```bash
# Outbox worker — COMPETES with consumers/outbox.consumer.js, pick one
node src/modules/outbox/outbox.worker.js

# Settlement worker (currently cannot start — see below)
node src/workers/settlement.worker.js --period=weekly
node src/workers/settlement.worker.js --period=monthly
```

Intended cron schedule:

```cron
0 1 * * 1  node /path/to/backend/src/workers/settlement.worker.js --period=weekly    # Mon 01:00
0 2 1 * *  node /path/to/backend/src/workers/settlement.worker.js --period=monthly   # 1st 02:00
```

> The settlement worker **cannot currently run** — it has three runtime defects (wrong import
> name, non-Drizzle query API, and a `JSON.stringify` into a `jsonb` column). It also imports
> `minimist`, which is not a declared dependency. See
> [10-known-issues.md](10-known-issues.md).

## Environment variables

Key names only. `backend/.env` and `frontend/.env` are gitignored and untracked. Templates are
provided at `backend/.env.example` and `frontend/.env.example`.

### Backend

| Key | Read by | In `.env` today |
|---|---|---|
| `PORT` | `src/server.js` | ✅ |
| `NODE_ENV` | *(declared; no code reads it)* | ✅ |
| `POSTGRES_URL` | `config/postgres.js`, `drizzle.config.js` | ✅ |
| `JWT_SECRET` | `modules/auth/auth.service.js`, `realtime/socket.server.js` | ✅ |
| `JWT_EXPIRES_IN` | `modules/auth/auth.service.js` | ✅ |
| `OTP_TTL_MINUTES` | `utils/otp.js` *(which nothing calls)* | ✅ |
| `NATS_URL` | `config/nats.js` | ✅ |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | `modules/auth/email.service.js`, `utils/email.js` | ✅ |
| `SMTP_FROM` | same | ❌ **missing** |
| `MAIL_USER` / `MAIL_PASS` | `utils/email.js` *(second mail config)* | ❌ **missing** |
| `CLIENT_ORIGIN` | `realtime/socket.server.js` | ❌ **missing** |
| `DRIVE_FOLDER_ID` | `services/drive.service.js`, `upload.routes.js` | ❌ **missing** |
| `RAZORPAY_WEBHOOK_SECRET` | `payments.webhook.controller.js` | ❌ **missing** |
| `SETTLEMENT_PERIOD` | `workers/settlement.worker.js` | ❌ **missing** |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | `docker-compose.yml` | ❌ **missing** |

**Nine keys are read by code or compose and absent from `backend/.env`.** Until now there was
no `.env.example`, so a new developer had no way to discover them.

> Two competing mail configurations exist: `SMTP_*` (used by
> `modules/auth/email.service.js`, which is the live path) and `MAIL_USER`/`MAIL_PASS` (used by
> `utils/email.js`, which nothing imports). Prefer `SMTP_*`.

### Frontend

| Key | Status |
|---|---|
| `REACT_APP_API_URL` | Declared in `.env`, **referenced nowhere in `src/`**. Dead until `api.js` is wired to it. |
| `PUBLIC_URL` | CRA built-in; used at `distributorLayout.js:99` |

### Optional: Google Drive uploads

`/api/upload/profile-picture` needs a `service-account.json` in the **backend working
directory** (`process.cwd()`) and `DRIVE_FOLDER_ID` set. Without it the service logs a warning
and returns `null`. Uploaded files are made **publicly readable**.

### Optional: invoice PDFs

`utils/invoice-pdf.js` writes to `./invoices/invoice-<id>.pdf` relative to cwd and **does not
create the directory**. Create `backend/invoices/` before generating a PDF, or the write stream
errors.

## Deployment

What is known:

- The frontend is deployed to **Render** — `src/api.js` points at
  `https://sledjeweb-2.onrender.com/api`.
- `frontend/build/` is committed to the repository.

Everything else is **undocumented**: there is no CI configuration (no `.github/`), no
Dockerfile, no deploy script, no infrastructure-as-code, and no record of where the backend,
Postgres or NATS run in production. Do not assume the local compose setup mirrors production.

## Quality tooling

Honest summary: there is none.

| | Status |
|---|---|
| Tests | ❌ `backend` `npm test` is the npm default stub. `frontend/src/App.test.js` is CRA boilerplate that fails. `backend/src/test/drizzleTest.js` is a scratch script that **logs `POSTGRES_URL` to stdout**. |
| Linter | ⚠️ Only the `eslintConfig` block in `frontend/package.json` (`react-app`), which runs during `react-scripts start/build` and produces non-fatal warnings. Nothing for the backend. |
| Formatter | ❌ No Prettier, no `.editorconfig` |
| CI | ❌ No `.github/` directory |
| Type checking | ❌ Plain JavaScript throughout |

The only configured tooling in the repository is the `code-review-graph` MCP integration
(`.mcp.json`, `.opencode.json`, `.claude/settings.json` hooks, `.claude/skills/`) and the five
identical agent rule files at the root.
