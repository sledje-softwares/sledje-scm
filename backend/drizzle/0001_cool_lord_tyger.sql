CREATE TABLE "distributor_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"distributor_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"stock" integer DEFAULT 0,
	"selling_price" numeric(10, 2) DEFAULT '0',
	"cost_price" numeric(10, 2) DEFAULT '0',
	"expiry" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "distributorships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "distributorships_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "event_dedupe" (
	"event_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"title" text,
	"body" text,
	"event_type" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "retailer_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retailer_id" uuid,
	"variant_id" uuid,
	"quantity" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_distributor_id_distributors_id_fk";
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "distributorship_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "distributor_inventory" ADD CONSTRAINT "distributor_inventory_distributor_id_distributors_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributor_inventory" ADD CONSTRAINT "distributor_inventory_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailer_inventory" ADD CONSTRAINT "retailer_inventory_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailer_inventory" ADD CONSTRAINT "retailer_inventory_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_distributorship_id_distributorships_id_fk" FOREIGN KEY ("distributorship_id") REFERENCES "public"."distributorships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" DROP COLUMN "stock";--> statement-breakpoint
ALTER TABLE "product_variants" DROP COLUMN "selling_price";--> statement-breakpoint
ALTER TABLE "product_variants" DROP COLUMN "cost_price";--> statement-breakpoint
ALTER TABLE "product_variants" DROP COLUMN "expiry";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "distributor_id";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "icon";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "reorder_level";