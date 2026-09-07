-- 0008_offline_sync.sql  —  offline-first POS (docs/16-offline-first.md)
--
-- Hand-adjusted from drizzle-kit's generated diff. Two things the generator
-- could not know:
--
--  1. Ordering. It emitted `sale_items.sale_id -> varchar(26)` BEFORE
--     `sales.id -> varchar(26)`, which Postgres rejects: a foreign key cannot
--     straddle two different types even for one statement. The FKs are dropped
--     first and re-added at the end.
--  2. `USING`. uuid -> varchar has no assignment cast, so each conversion
--     spells out `USING col::text`. Existing sales keep their identity (their
--     uuid, as a string) instead of being dropped on the floor.
--
--     LENGTH: varchar(36), not varchar(26). A ULID is 26 characters, but a
--     uuid rendered as text is 36, so varchar(26) would abort this migration
--     with "value too long" on any database that already holds a sale. New
--     ids are ULIDs; the extra ten characters exist only so pre-0008 rows
--     survive.
--
-- After this migration sales, sale_items and sale_payments carry
-- CLIENT-GENERATED ULIDs. A sale must be able to exist before the server has
-- ever heard of it - that is what "offline" means.

CREATE TABLE "sync_devices" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"retailer_id" uuid NOT NULL,
	"device_code" text NOT NULL,
	"label" text,
	"last_cursor" timestamp,
	"last_seen_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_sync_device_code" UNIQUE("retailer_id","device_code")
);
--> statement-breakpoint
-- uq_sync_op(device_id, op_id) is the exactly-once guarantee for the entire
-- sync protocol. A replayed batch loses the race to insert and is therefore
-- ACKNOWLEDGED rather than reapplied. A database constraint, not a cache:
-- caches do not survive a restart, a second process, or a deploy, and "the
-- shop's sales got counted twice because we redeployed" is not recoverable.
CREATE TABLE "sync_ops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" varchar(26) NOT NULL,
	"op_id" varchar(26) NOT NULL,
	"retailer_id" uuid,
	"type" text NOT NULL,
	"op_at" timestamp,
	"applied_at" timestamp DEFAULT now(),
	"result" jsonb,
	CONSTRAINT "uq_sync_op" UNIQUE("device_id","op_id")
);
--> statement-breakpoint
-- reference_id is polymorphic (invoice | payment | adjustment | sale). It
-- cannot be narrower than the widest id it has to point at, and a sale id is
-- now a ULID.
ALTER TABLE "ledger" ALTER COLUMN "reference_id" SET DATA TYPE text USING "reference_id"::text;--> statement-breakpoint
ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "sale_items_sale_id_sales_id_fk";--> statement-breakpoint
ALTER TABLE "sale_payments" DROP CONSTRAINT IF EXISTS "sale_payments_sale_id_sales_id_fk";--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "id" SET DATA TYPE varchar(36) USING "id"::text;--> statement-breakpoint
ALTER TABLE "sale_items" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sale_items" ALTER COLUMN "id" SET DATA TYPE varchar(36) USING "id"::text;--> statement-breakpoint
ALTER TABLE "sale_items" ALTER COLUMN "sale_id" SET DATA TYPE varchar(36) USING "sale_id"::text;--> statement-breakpoint
ALTER TABLE "sale_payments" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sale_payments" ALTER COLUMN "id" SET DATA TYPE varchar(36) USING "id"::text;--> statement-breakpoint
ALTER TABLE "sale_payments" ALTER COLUMN "sale_id" SET DATA TYPE varchar(36) USING "sale_id"::text;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "device_id" varchar(26);--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_ops" ADD CONSTRAINT "sync_ops_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sync_ops_retailer" ON "sync_ops" USING btree ("retailer_id","applied_at");--> statement-breakpoint
-- A void must undo exactly the FIFO layers its sale consumed, which are
-- recorded on the accrual transaction's metadata. Without this index that is a
-- sequential scan of every transaction the shop has ever written.
CREATE INDEX "idx_pbt_sale" ON "product_bill_transactions" ((metadata ->> 'saleId')) WHERE metadata ? 'saleId';
