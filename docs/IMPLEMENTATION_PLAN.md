# Delivery plan

The delivery order keeps the core affiliate operation usable before payment-provider work begins.

## Core portal

- Role-based account access, affiliate registration, and administrator review.
- Referral links and QR share cards.
- Refill capture, approval/voiding, commission ledger, and configurable tiers.
- Dashboards, leaderboard, payout requests, manual payout recording, notification queue, and CSV reports.
- Setup instructions, environment example, schema migrations, and deployment guidance.

## Operational readiness

- Confirm commission percentages, tier thresholds, payout minimum, support contacts, and any required retention rules with Uptown Gas Hub.
- Configure production database, strong session secret, administrator account, public HTTPS URL, and SMTP.
- Verify backups, access roles, and the manual refill-to-payout process with the operations team.

## Deferred: payment automation

No Daraja API requests, transfer credentials, provider callbacks, or automated payouts are part of the current build. Add payment-provider integration only after the core portal is accepted and the business confirms the provider account, payout policy, callback domain, and reconciliation process.
