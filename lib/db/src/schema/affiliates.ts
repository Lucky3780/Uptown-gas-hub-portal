import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const tierMetricEnum = pgEnum("tier_metric", ["refills", "revenue"]);
export const tierPeriodEnum = pgEnum("tier_period", ["monthly", "lifetime"]);

export const affiliatesTable = pgTable(
  "affiliates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    referralCode: text("referral_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("affiliates_referral_code_unique").on(table.referralCode),
    index("affiliates_created_idx").on(table.createdAt),
  ],
);

export const tiersTable = pgTable(
  "affiliate_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull().unique(),
    sortOrder: integer("sort_order").notNull(),
    thresholdMetric: tierMetricEnum("threshold_metric")
      .notNull()
      .default("refills"),
    thresholdValue: integer("threshold_value").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    period: tierPeriodEnum("period").notNull().default("lifetime"),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("affiliate_tiers_order_idx").on(table.sortOrder)],
);

export type Affiliate = typeof affiliatesTable.$inferSelect;
export type Tier = typeof tiersTable.$inferSelect;
