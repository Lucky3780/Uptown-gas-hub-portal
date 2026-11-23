CREATE TYPE "public"."account_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('affiliate', 'admin');--> statement-breakpoint
CREATE TYPE "public"."tier_metric" AS ENUM('refills', 'revenue');--> statement-breakpoint
CREATE TYPE "public"."tier_period" AS ENUM('monthly', 'lifetime');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('available', 'reserved', 'paid', 'voided');--> statement-breakpoint
CREATE TYPE "public"."refill_status" AS ENUM('pending', 'approved', 'voided');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."mpesa_mode" AS ENUM('manual', 'daraja');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_provider" AS ENUM('wa_me', 'meta_cloud');--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"phone" text NOT NULL,
	"role" "user_role" DEFAULT 'affiliate' NOT NULL,
	"status" "account_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"referral_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliates_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "affiliate_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"threshold_metric" "tier_metric" DEFAULT 'refills' NOT NULL,
	"threshold_value" integer NOT NULL,
	"commission_bps" integer NOT NULL,
	"period" "tier_period" DEFAULT 'lifetime' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_tiers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "commission_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"refill_id" uuid NOT NULL,
	"amount_kes" integer NOT NULL,
	"commission_bps" integer NOT NULL,
	"tier_name" text NOT NULL,
	"status" "commission_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"litres" numeric(10, 2) NOT NULL,
	"amount_kes" integer NOT NULL,
	"status" "refill_status" DEFAULT 'pending' NOT NULL,
	"refill_date" date NOT NULL,
	"notes" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_commissions" (
	"payout_id" uuid NOT NULL,
	"commission_id" uuid NOT NULL,
	"amount_kes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"amount_kes" integer NOT NULL,
	"phone" text NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"transaction_reference" text,
	"rejection_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"delivery_status" "notification_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"minimum_payout_kes" integer DEFAULT 1000 NOT NULL,
	"referral_base_url" text DEFAULT '' NOT NULL,
	"whatsapp_provider" "whatsapp_provider" DEFAULT 'wa_me' NOT NULL,
	"whatsapp_enabled" boolean DEFAULT true NOT NULL,
	"mpesa_mode" "mpesa_mode" DEFAULT 'manual' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_refill_id_refills_id_fk" FOREIGN KEY ("refill_id") REFERENCES "public"."refills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refills" ADD CONSTRAINT "refills_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refills" ADD CONSTRAINT "refills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refills" ADD CONSTRAINT "refills_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_commissions" ADD CONSTRAINT "payout_commissions_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_commissions" ADD CONSTRAINT "payout_commissions_commission_id_commission_ledger_id_fk" FOREIGN KEY ("commission_id") REFERENCES "public"."commission_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_expiry_idx" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_status_created_idx" ON "users" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliates_referral_code_unique" ON "affiliates" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "affiliates_created_idx" ON "affiliates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "affiliate_tiers_order_idx" ON "affiliate_tiers" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_refill_unique" ON "commission_ledger" USING btree ("refill_id");--> statement-breakpoint
CREATE INDEX "commission_affiliate_status_idx" ON "commission_ledger" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE INDEX "refills_affiliate_date_idx" ON "refills" USING btree ("affiliate_id","refill_date");--> statement-breakpoint
CREATE INDEX "refills_status_date_idx" ON "refills" USING btree ("status","refill_date");--> statement-breakpoint
CREATE INDEX "payout_commissions_payout_idx" ON "payout_commissions" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "payout_commissions_commission_idx" ON "payout_commissions" USING btree ("commission_id");--> statement-breakpoint
CREATE INDEX "payouts_affiliate_created_idx" ON "payouts" USING btree ("affiliate_id","created_at");--> statement-breakpoint
CREATE INDEX "payouts_status_created_idx" ON "payouts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notifications_affiliate_created_idx" ON "notifications" USING btree ("affiliate_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("delivery_status","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");