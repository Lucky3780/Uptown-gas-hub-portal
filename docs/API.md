# API overview

All API routes are mounted under `/api`. The OpenAPI contract in `lib/api-spec/openapi.yaml` is the source of truth. After editing it, regenerate the React Query hooks and Zod request/response validators:

```sh
pnpm run --filter @workspace/api-spec codegen
```

## Access and roles

- Public: health check, CSRF token, register, sign in, password-reset request, and reset.
- Signed-in affiliate: own dashboard, refill history, commission ledger, leaderboard, payout history and requests, notification history.
- Approved affiliate: refill and payout requests are enabled only after administrator approval.
- Administrator: affiliate review, refill capture/review, tier configuration, payout review, notification queue, settings, and CSV report.
- Write operations require the authenticated session and CSRF token.

## Main route groups

| Route | Purpose |
| --- | --- |
| `/api/auth/*` | CSRF token, current user, registration, login/logout, and password reset |
| `/api/dashboard` | Role-specific dashboard summary and balances |
| `/api/sales` | Affiliate refill history; administrators can capture and review refills |
| `/api/commissions` | Affiliate commission ledger |
| `/api/leaderboard` | Weekly, monthly, or all-time partner rankings |
| `/api/payouts` | Affiliate payout history and requests |
| `/api/notifications` | Affiliate notification history |
| `/api/admin/affiliates` | List and review affiliate applications |
| `/api/admin/sales` | List refills for administrator review |
| `/api/admin/tiers` | Configure commission tiers |
| `/api/admin/payouts` | Review, approve, reject, and record completed manual payouts |
| `/api/admin/notifications` | Work through the WhatsApp follow-up queue |
| `/api/admin/settings` | Minimum payout, referral URL, and notification settings |
| `/api/admin/reports.csv` | Download approved refill and commission report |

## Manual payout lifecycle

Affiliate requests reserve the available commission entries. An administrator approves or rejects the request. After making the transfer outside the portal, the administrator marks the approved request paid and enters the M-Pesa transaction reference. Rejected requests release reserved commissions. The API does not initiate payment transfers.

For the complete request/response schemas, see `lib/api-spec/openapi.yaml`.
