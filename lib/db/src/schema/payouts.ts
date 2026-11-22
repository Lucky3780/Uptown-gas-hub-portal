import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { affiliatesTable } from "./affiliates";
import { commissionsTable } from "./refills";
import { usersTable } from "./auth";

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "approved",
  "rejected",
  "paid",
]);

export const payoutsTable = pgTable(
  "payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliatesTable.id, { onDelete: "restrict" }),
    amountKES: integer("amount_kes").notNull(),
    phone: text("phone").notNull(),
    status: payoutStatusEnum("status").notNull().default("pending"),
    transactionReference: text("transaction_reference"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: uuid("reviewed_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("payouts_affiliate_created_idx").on(table.affiliateId, table.createdAt),
    index("payouts_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const payoutCommissionsTable = pgTable(
  "payout_commissions",
  {
    payoutId: uuid("payout_id")
      .notNull()
      .references(() => payoutsTable.id, { onDelete: "cascade" }),
    commissionId: uuid("commission_id")
      .notNull()
      .references(() => commissionsTable.id, { onDelete: "restrict" }),
    amountKES: integer("amount_kes").notNull(),
  },
  (table) => [
    index("payout_commissions_payout_idx").on(table.payoutId),
    index("payout_commissions_commission_idx").on(table.commissionId),
  ],
);

export type Payout = typeof payoutsTable.$inferSelect;
