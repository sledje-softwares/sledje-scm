CREATE TABLE "distributorship_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"distributor_id" uuid NOT NULL,
	"distributorship_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_distributorship_member" UNIQUE("distributor_id","distributorship_id")
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "created_by_distributor_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "distributorship_members" ADD CONSTRAINT "distributorship_members_distributor_id_distributors_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributorship_members" ADD CONSTRAINT "distributorship_members_distributorship_id_distributorships_id_fk" FOREIGN KEY ("distributorship_id") REFERENCES "public"."distributorships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributorship_members" ADD CONSTRAINT "distributorship_members_invited_by_distributors_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."distributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_distributor_id_distributors_id_fk" FOREIGN KEY ("created_by_distributor_id") REFERENCES "public"."distributors"("id") ON DELETE no action ON UPDATE no action;