# Uptown Gas Hub Affiliate Portal

An affiliate portal for managing partner applications, LPG refill referrals, commissions, and payout records.

## Run & operate

- Web portal: `pnpm --filter @workspace/uptown-affiliate-portal run dev`
- API server: `pnpm --filter @workspace/api-server run dev`
- Full typecheck: `pnpm run typecheck`
- Build: `pnpm run build`
- Regenerate API types: `pnpm run --filter @workspace/api-spec codegen`
- Push schema to the development database only: `pnpm --filter @workspace/db run push`
- Run generated migrations: `pnpm --filter @workspace/db run migrate`
- Seed tiers, settings, and an optional bootstrap administrator: `pnpm --filter @workspace/api-server run seed`

## Stack and source of truth

- React, Vite, TypeScript, and generated React Query clients for the web app.
- Express API in `artifacts/api-server`.
- PostgreSQL and Drizzle schema in `lib/db/src/schema`.
- OpenAPI contract in `lib/api-spec/openapi.yaml`; regenerate hooks and Zod validators after every contract change.
- Product setup and runbook: `README.md`; endpoint summary: `docs/API.md`.

## Current product scope

- Affiliate signup, admin approval, referral codes and share cards, refill entry/review, commission ledger, tier settings, leaderboard, CSV export, notification queue, and manual payout records.
- Password reset email requires SMTP configuration.
- WhatsApp follow-ups use a queue and click-to-chat links; sending remains manual.
- M-Pesa payouts are manual: admins record the transaction reference after confirming payment outside the portal. Automated payment-provider integration is deferred until the core portal is finished and separately approved.

## Important operating rules

- There is no default administrator login. Bootstrap one with `UPTOWN_ADMIN_EMAIL`, `UPTOWN_ADMIN_PHONE`, and `UPTOWN_ADMIN_PASSWORD` in Replit Secrets, then run the seed command once. Never put passwords in chat or source files.
- Seeded tier rates, refill thresholds, and the KES 1,000 minimum are example starting values. The business owner must confirm them before accepting real sales or payout requests.
- Use the development schema push only for development. Generate and review migrations for any production database changes.
- Node.js and PostgreSQL are required. Use a VPS or a cPanel plan that supports long-running Node.js services and PostgreSQL; a PHP-only shared hosting plan is not sufficient.
