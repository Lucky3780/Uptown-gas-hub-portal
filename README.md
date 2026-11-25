# Uptown Gas Hub Affiliate Portal

A role-based partner portal for referral-based LPG refill sales in Kenya. Affiliates can share referral links, follow refill and commission activity, and request payouts. Administrators approve partners and refill records, configure tiers, review payouts, manage settings, and export reports.

## What is included

- Secure email/password registration and login, role-aware sessions, password-reset flow, and CSRF protection.
- Affiliate applications that remain pending until an administrator approves them.
- Referral codes, shareable links, printable QR cards, and manual refill capture using an affiliate's code.
- Refill approval and voiding with an auditable commission ledger.
- Configurable monthly or lifetime tiers with fixed KES commission amounts per approved refill.
- Affiliate and admin dashboards, performance leaderboard, and CSV reporting.
- A WhatsApp follow-up queue with `wa.me` click-to-chat links.
- Payout requests, approval/rejection, and manual M-Pesa transaction recording.

Automated M-Pesa/Daraja integration is intentionally out of scope for the current delivery. The portal does not initiate money transfers. An administrator must confirm the transfer outside the portal before marking a payout paid.

## Local development

This is a pnpm workspace with a React/Vite web app, Express API, and Supabase-hosted PostgreSQL database.

1. Install the workspace dependencies with `pnpm install`.
2. Create a Supabase project and run [`supabase/setup.sql`](supabase/setup.sql) once in the Supabase SQL Editor. It preserves any existing draft tables under a private `legacy` schema, imports legacy tier thresholds and fixed KES rewards when present, creates this portal's tables, and creates a private `affiliate-private-files` Storage bucket.
3. In Supabase, open **Connect** and copy the **Session pooler** PostgreSQL connection string into `DATABASE_URL` in the root `.env` file. Use `sslmode=verify-full`. If Node reports a certificate-chain error, download the database CA certificate from Supabase's database SSL settings and add `&sslrootcert=/absolute/path/to/the-downloaded-ca.crt` to the URL. Keep the URL in single quotes and URL-encode special characters in the password. Use the direct connection only if the host supports IPv6.
4. Configure the remaining environment variables described in `.env.example`.
5. Seed the initial tiers and settings: `pnpm --filter @workspace/api-server run seed`.
6. Start the managed web and API workflows, or run them with:
   - `pnpm --filter @workspace/uptown-affiliate-portal run dev`
   - `pnpm --filter @workspace/api-server run dev`

Run `pnpm run typecheck` and `pnpm run build` before delivery.

The portal's Express API connects directly to Postgres; it does not use Supabase Auth or the Supabase browser SDK. Application tables have row-level security enabled and are not granted to the browser-facing `anon` and `authenticated` roles. Keep `DATABASE_URL` and any future Supabase service-role key on the server only. The private storage bucket is provisioned for future server-mediated file uploads; the portal does not currently have an upload feature or need a storage key.

## First administrator

There are no default administrator credentials. Public registration only creates a pending affiliate account.


- `UPTOWN_ADMIN_EMAIL`
- `UPTOWN_ADMIN_PHONE` (Kenyan mobile number)
- `UPTOWN_ADMIN_PASSWORD` (at least 14 characters)

Then run `pnpm --filter @workspace/api-server run seed`. The seed command will not elevate an existing affiliate account. It will leave an existing administrator unchanged. Sign in at `/login` with the email and password you supplied through the secure environment settings.

## Before real business use

Initial tier amounts and thresholds are examples; review and approve them before business use:

- Starter: KES 20 per refill from 1 lifetime refill
- Bronze: KES 30 per refill from 5 lifetime refills
- Silver: KES 40 per refill from 10 lifetime refills
- Gold: KES 50 per refill from 20 lifetime refills
- Platinum: KES 60 per refill from 40 lifetime refills
- Minimum payout: KES 1,000

Review the tiers and minimum payout in the admin portal before accepting real transactions. Configure a strong `SESSION_SECRET`, a public HTTPS `PORTAL_PUBLIC_URL`, and SMTP delivery for password-reset emails. Keep the administrator credentials and database credentials in  Secrets.

## Database and deployment

The app uses Supabase PostgreSQL. For initial setup, run [`supabase/setup.sql`](supabase/setup.sql) once. On a project with the earlier schema, it moves the old tables to `legacy` instead of deleting them; the old profile stays archived because it has no password hash and cannot be used to sign in to this portal. For later schema changes, generate migration files with `pnpm --filter @workspace/db run generate`, review them, back up production data, and apply reviewed migrations with `pnpm --filter @workspace/db run migrate`. Do not rerun `setup.sql` after setup or use `push-force` on a database containing data.

## Vercel frontend and Render API

The repository includes [`vercel.json`](./vercel.json) and [`render.yaml`](./render.yaml) for a split deployment. Set the Vercel project **Root Directory** to the repository root; the Vercel config installs the pnpm workspace, builds only the Vite app, and publishes its static output. Create the Render service from the repository's Blueprint; it builds and runs the Express API and uses `/api/healthz` for health checks.

Use a custom domain on the same parent domain for both services, for example `portal.example.com` on Vercel and `api.example.com` on Render. The portal uses secure, host-only session cookies; using unrelated default `vercel.app` and `onrender.com` domains prevents those cookies from working reliably across the split.

Configure these production variables:

- **Vercel**: `VITE_API_URL` = the Render API's HTTPS origin, with no trailing slash or `/api` suffix (for example `https://api.example.com`). Set it for Production, then redeploy; Vite embeds it at build time. Preview deployments require a stable preview domain and a matching Render `APP_ORIGIN`; the API allows one exact origin.
- **Render**: `DATABASE_URL` = the Supabase session-pooler URL; `APP_ORIGIN` = the exact Vercel site origin (for example `https://portal.example.com`); `PORTAL_PUBLIC_URL` = that same public site URL; `SESSION_SECRET` = a unique random value of at least 32 characters. Render supplies `PORT` and the Blueprint sets `NODE_ENV=production`.
- **Render, optional**: configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` to deliver password-reset emails. Add `UPTOWN_ADMIN_EMAIL`, `UPTOWN_ADMIN_PHONE`, and `UPTOWN_ADMIN_PASSWORD` only when bootstrapping the first admin.

If Supabase requires a custom CA certificate, make it available to the Render service and set `sslrootcert` in `DATABASE_URL` to the certificate's absolute path inside that service. Do not use a path from your local machine. After the first deployment, run `pnpm --filter @workspace/api-server run seed` once from the Render shell to provision initial settings and the optional first administrator. Keep all database and mail credentials in hosting environment settings, never in the frontend.

See [the API overview](docs/API.md) and [the delivery plan](docs/IMPLEMENTATION_PLAN.md) for operational detail and the deferred payments phase.
