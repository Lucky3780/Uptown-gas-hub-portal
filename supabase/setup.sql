-- Run once in the Supabase SQL Editor. Existing draft tables are moved intact
-- to the private legacy schema before the portal's schema is created.
-- The Express API connects directly to Postgres; Supabase Auth is not used.

BEGIN;

DO $$
DECLARE
  table_name text;
  legacy_tables text[] := ARRAY[
    'affiliates',
    'audit_logs',
    'commission_ledger',
    'payouts',
    'profiles',
    'sales',
    'commission_tiers'
  ];
  portal_tables text[] := ARRAY[
    'password_reset_tokens',
    'user_sessions',
    'users',
    'affiliate_tiers',
    'refills',
    'payout_commissions',
    'notifications',
    'portal_settings'
  ];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(portal_tables) AS expected(name)
    WHERE to_regclass(format('public.%I', expected.name)) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Portal tables already exist. Do not rerun this setup script; inspect the database before migrating.';
  END IF;

  CREATE SCHEMA IF NOT EXISTS legacy;
  FOREACH table_name IN ARRAY legacy_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      IF to_regclass(format('legacy.%I', table_name)) IS NOT NULL THEN
        RAISE EXCEPTION 'Both public.% and legacy.% exist. Resolve the legacy table collision before continuing.', table_name, table_name;
      END IF;
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA legacy', table_name);
    END IF;
  END LOOP;
END $$;

CREATE TYPE "public"."account_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE "public"."user_role" AS ENUM('affiliate', 'admin');
CREATE TYPE "public"."tier_metric" AS ENUM('refills', 'revenue');
CREATE TYPE "public"."tier_period" AS ENUM('monthly', 'lifetime');
CREATE TYPE "public"."commission_status" AS ENUM('available', 'reserved', 'paid', 'voided');
CREATE TYPE "public"."refill_status" AS ENUM('pending', 'approved', 'voided');
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'approved', 'rejected', 'paid');
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed');
CREATE TYPE "public"."mpesa_mode" AS ENUM('manual', 'daraja');
CREATE TYPE "public"."whatsapp_provider" AS ENUM('wa_me', 'meta_cloud');

CREATE TABLE "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
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
CREATE TABLE "affiliates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "referral_code" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "affiliates_user_id_unique" UNIQUE("user_id")
);
CREATE TABLE "affiliate_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer NOT NULL,
  "threshold_metric" "tier_metric" DEFAULT 'refills' NOT NULL,
  "threshold_value" integer NOT NULL,
  "commission_per_refill_kes" integer NOT NULL,
  "period" "tier_period" DEFAULT 'lifetime' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "affiliate_tiers_name_unique" UNIQUE("name")
);
CREATE TABLE "commission_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "affiliate_id" uuid NOT NULL,
  "refill_id" uuid NOT NULL,
  "amount_kes" integer NOT NULL,
  "commission_per_refill_kes" integer NOT NULL,
  "tier_name" text NOT NULL,
  "status" "commission_status" DEFAULT 'available' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
CREATE TABLE "payout_commissions" (
  "payout_id" uuid NOT NULL,
  "commission_id" uuid NOT NULL,
  "amount_kes" integer NOT NULL
);
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
CREATE TABLE "portal_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "minimum_payout_kes" integer DEFAULT 1000 NOT NULL,
  "referral_base_url" text DEFAULT '' NOT NULL,
  "whatsapp_provider" "whatsapp_provider" DEFAULT 'wa_me' NOT NULL,
  "whatsapp_enabled" boolean DEFAULT true NOT NULL,
  "mpesa_mode" "mpesa_mode" DEFAULT 'manual' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
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

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict;
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_refill_id_refills_id_fk" FOREIGN KEY ("refill_id") REFERENCES "public"."refills"("id") ON DELETE restrict;
ALTER TABLE "refills" ADD CONSTRAINT "refills_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict;
ALTER TABLE "refills" ADD CONSTRAINT "refills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict;
ALTER TABLE "refills" ADD CONSTRAINT "refills_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "payout_commissions" ADD CONSTRAINT "payout_commissions_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE cascade;
ALTER TABLE "payout_commissions" ADD CONSTRAINT "payout_commissions_commission_id_commission_ledger_id_fk" FOREIGN KEY ("commission_id") REFERENCES "public"."commission_ledger"("id") ON DELETE restrict;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null;

CREATE INDEX "password_reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");
CREATE INDEX "user_sessions_expiry_idx" ON "user_sessions" USING btree ("expires_at");
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
CREATE INDEX "users_status_created_idx" ON "users" USING btree ("status","created_at");
CREATE UNIQUE INDEX "affiliates_referral_code_unique" ON "affiliates" USING btree ("referral_code");
CREATE INDEX "affiliates_created_idx" ON "affiliates" USING btree ("created_at");
CREATE INDEX "affiliate_tiers_order_idx" ON "affiliate_tiers" USING btree ("sort_order");
CREATE UNIQUE INDEX "commission_refill_unique" ON "commission_ledger" USING btree ("refill_id");
CREATE INDEX "commission_affiliate_status_idx" ON "commission_ledger" USING btree ("affiliate_id","status");
CREATE INDEX "refills_affiliate_date_idx" ON "refills" USING btree ("affiliate_id","refill_date");
CREATE INDEX "refills_status_date_idx" ON "refills" USING btree ("status","refill_date");
CREATE INDEX "payout_commissions_payout_idx" ON "payout_commissions" USING btree ("payout_id");
CREATE INDEX "payout_commissions_commission_idx" ON "payout_commissions" USING btree ("commission_id");
CREATE INDEX "payouts_affiliate_created_idx" ON "payouts" USING btree ("affiliate_id","created_at");
CREATE INDEX "payouts_status_created_idx" ON "payouts" USING btree ("status","created_at");
CREATE INDEX "notifications_affiliate_created_idx" ON "notifications" USING btree ("affiliate_id","created_at");
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("delivery_status","created_at");
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");

-- Preserve legacy tiers and use their fixed KES rewards in the portal.
DO $$
BEGIN
  IF to_regclass('legacy.commission_tiers') IS NOT NULL THEN
    INSERT INTO public.affiliate_tiers (
      id,
      name,
      sort_order,
      threshold_metric,
      threshold_value,
      commission_per_refill_kes,
      period,
      active
    )
    SELECT
      id,
      tier_name,
      row_number() OVER (ORDER BY min_refills, tier_name)::integer,
      'refills',
      min_refills,
      round(commission_per_refill)::integer,
      'lifetime',
      true
    FROM legacy.commission_tiers
    ORDER BY min_refills, tier_name;
  END IF;
END $$;

-- This application uses its Express API for all database access. Do not expose
-- application tables to Supabase's browser-facing anon/authenticated roles.
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
REVOKE ALL ON SCHEMA legacy FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA legacy FROM PUBLIC, anon, authenticated;

-- Private bucket for future server-mediated affiliate document uploads.
-- There are currently no upload routes; do not make this bucket public.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'affiliate-private-files',
  'affiliate-private-files',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
