CREATE TABLE "order_delivery_codes" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"code_enc" text NOT NULL,
	"code_iv" text NOT NULL,
	"code_tag" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "order_delivery_codes" ADD CONSTRAINT "order_delivery_codes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;