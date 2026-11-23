# Uptown Gas Hub Affiliate Portal

A role-based partner portal for referral-based LPG refill sales in Kenya. Affiliates can share referral links, follow refill and commission activity, and request payouts. Administrators approve partners and refill records, configure tiers, review payouts, manage settings, and export reports.

## What is included

- Secure email/password registration and login, role-aware sessions, password-reset flow, and CSRF protection.
- Affiliate applications that remain pending until an administrator approves them.
- Referral codes, shareable links, printable QR cards, and manual refill capture using an affiliate's code.
- Refill approval and voiding with an auditable commission ledger.
- Configurable monthly or lifetime tiers and commission rates.
- Affiliate and admin dashboards, performance leaderboard, and CSV reporting.
- A WhatsApp follow-up queue with `wa.me` click-to-chat links.
- Payout requests, approval/rejection, and manual M-Pesa transaction recording.

Automated M-Pesa/Daraja integration is intentionally out of scope for the current delivery. The portal does not initiate money transfers. An administrator must confirm the transfer outside the portal before marking a payout paid.

## Local development

This is a pnpm workspace with a React/Vite web app, Express API, and PostgreSQL database.

1. Install the workspace dependencies with `pnpm install`.
2. Configure the environment variables described in `.env.example`. In Replit, use the project's Secrets and environment-variable tools rather than committing a local `.env`.
3. Push the Drizzle schema to the development database: `pnpm --filter @workspace/db run push`.
4. Seed the initial tiers and settings: `pnpm --filter @workspace/api-server run seed`.
5. Start the managed web and API workflows, or run them with:
   - `pnpm --filter @workspace/uptown-affiliate-portal run dev`
   - `pnpm --filter @workspace/api-server run dev`

Run `pnpm run typecheck` and `pnpm run build` before delivery.

## First administrator

There are no default administrator credentials. Public registration only creates a pending affiliate account.

To create an administrator, add these variables in Replit Secrets:

- `UPTOWN_ADMIN_EMAIL`
- `UPTOWN_ADMIN_PHONE` (Kenyan mobile number)
- `UPTOWN_ADMIN_PASSWORD` (at least 14 characters)

Then run `pnpm --filter @workspace/api-server run seed`. The seed command will not elevate an existing affiliate account. It will leave an existing administrator unchanged. Sign in at `/login` with the email and password you supplied through the secure environment settings.

## Before real business use

Seeded defaults are examples, not approved commercial terms:

- Starter: 2% from 0 lifetime refills
- Silver: 3% from 10 lifetime refills
- Gold: 4% from 25 lifetime refills
- Platinum: 5% from 50 lifetime refills
- Minimum payout: KES 1,000

Review the tiers and minimum payout in the admin portal before accepting real transactions. Configure a strong `SESSION_SECRET`, a public HTTPS `PORTAL_PUBLIC_URL`, and SMTP delivery for password-reset emails. Keep the administrator credentials and database credentials in Replit Secrets.

## Database and deployment

The app uses PostgreSQL. Use `pnpm --filter @workspace/db run push` only to apply schema changes to a development database. For a deployment, generate migration files with `pnpm --filter @workspace/db run generate`, review them, back up production data, and apply reviewed migrations with `pnpm --filter @workspace/db run migrate`.

The application needs a Node.js runtime that can keep the Express API running and a persistent PostgreSQL database. A Kenyan VPS is suitable. Shared cPanel is suitable only when the hosting plan supports Node.js applications and PostgreSQL; PHP-only shared hosting is not sufficient.

See [the API overview](docs/API.md) and [the delivery plan](docs/IMPLEMENTATION_PLAN.md) for operational detail and the deferred payments phase.
