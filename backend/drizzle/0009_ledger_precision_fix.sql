-- 0009_ledger_precision_fix.sql
--
-- HAND-WRITTEN — no DATABASE_URL / drizzle-kit binary was available in this
-- worktree to run `drizzle-kit generate`. This file mirrors the style of the
-- other hand-adjusted migration (0008_offline_sync.sql) but has NOT been
-- verified against a real drizzle-kit diff. Run `npx drizzle-kit generate`
-- against schema.js before merging to confirm it reports no further drift,
-- and reconcile this file's number (0009) against whatever other Phase
-- migrations land first — this was the next free slot in
-- backend/drizzle/meta/_journal.json at the time this was written (last
-- entry was idx 8 / 0008_offline_sync).
--
-- 1. `ledger.amount` / `ledger.balance` were numeric(10,2) while the
--    product_bills and invoices rows that feed them are numeric(14,2) — a
--    representable bill/invoice balance can overflow the ledger row that
--    records it. Widening is non-destructive and safe on existing data.
-- 2. `ledger.billId` was the only camelCase PHYSICAL column name in the
--    schema ("productBillId"); every other column is snake_case. Renaming
--    the physical column only — the JS property name (`billId`) is
--    unchanged in schema.js, and no raw SQL in backend/src references the
--    literal string "productBillId" or "product_bill_id" on the ledger
--    table (checked via grep), so no other file needs updating for this
--    rename.

ALTER TABLE "ledger" ALTER COLUMN "amount" SET DATA TYPE numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "ledger" ALTER COLUMN "balance" SET DATA TYPE numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "ledger" RENAME COLUMN "productBillId" TO "product_bill_id";
