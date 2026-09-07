ALTER TABLE "distributor_inventory" ADD COLUMN "low_stock_threshold" integer DEFAULT 5;--> statement-breakpoint
ALTER TABLE "distributors" ADD COLUMN "profile_picture_url" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "mrp" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "profile_picture_url" text;