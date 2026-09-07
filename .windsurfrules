# Sledje — project orientation

**Stack:** React (CRA) frontend; Node/Express 5 (ESM) + Drizzle/Postgres + NATS JetStream +
Socket.IO backend. An event-driven modular monolith.

**Documentation lives in `docs/`.** Start at `docs/README.md`. The most important pages:

- `docs/02-product-billing.md` — the core design decision. Credit is tracked per **product**
  (retailer, distributor, variant), not per order or invoice. Nothing else in the backend makes
  sense without this.
- `docs/04-data-model.md` — the authoritative schema is `backend/src/db/schema.js`.
  `backend/src/db/schema.sql` is stale and contradicts it; ignore that file.
- `docs/10-known-issues.md` — **read this before trusting any flow.** A significant share of
  the codebase does not execute: order creation, cart checkout, the delivery→billing→ledger
  event chain, notifications, OTP reset and the settlement worker are all currently broken.

**Layering convention:** `api-gateway/routes` → `api-gateway/controllers` →
`modules/<domain>/<domain>.service.js` → `modules/<domain>/<domain>.repository.js`. Several
existing modules bypass the repository layer; follow the convention when writing new code, do
not assume it when reading existing code.

**Watch out for duplicates.** The repository contains two socket servers, two event publishers,
two outbox drains, two dedupe schemes, two bill-payment modules, two PDF generators, two email
helpers and two consumer directories. `docs/03-architecture.md` has the table of which copy is
live. Check before editing.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
