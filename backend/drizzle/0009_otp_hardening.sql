ALTER TABLE "otp_codes" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "locked_until" timestamp;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "consumed_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- otp_codes are 10-minute-lived (OTP_TTL_MINUTES) - safe to drop wholesale.
-- Existing duplicate-email rows would otherwise make the unique index below
-- fail to create.
DELETE FROM "otp_codes";--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "uq_otp_email" UNIQUE("email");