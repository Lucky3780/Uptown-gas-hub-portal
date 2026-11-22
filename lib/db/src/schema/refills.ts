import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { affiliatesTable } from "./affiliates";
import { usersTable } from "./auth";

export const refillStatusEnum = pgEnum("refill_status", [
  "pending",
  "approved",
  "voided",
]);
export const commissionStatusEnum = pgEnum("commission_status", [
  "available",
  "reserved",
  "paid",
  "voided",
]);

export const refillsTable = pgTable(
  "refills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliatesTable.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    litres: numeric("litres", { precision: 10, scale: 2, mode: "number" }).notNull(),
    amountKES: integer("amount_kes").notNull(),
    status: refillStatusEnum("status").notNull().default("pending"),
    refillDate: date("refill_date", { mode: "string" }).notNull(),
    notes: text("notes"),
    approvedBy: uuid("approved_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("refills_affiliate_date_idx").on(table.affiliateId, table.refillDate),
    index("refills_status_date_idx").on(table.status, table.refillDate),
  ],
);

export const commissionsTable = pgTable(
  "commission_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliatesTable.id, { onDelete: "restrict" }),
    refillId: uuid("refill_id")
      .notNull()
      .references(() => refillsTable.id, { onDelete: "restrict" }),
    amountKES: integer("amount_kes").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    tierName: text("tier_name").notNull(),
    status: commissionStatusEnum("status").notNull().default("available"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("commission_refill_unique").on(table.refillId),
    index("commission_affiliate_status_idx").on(table.affiliateId, table.status),
  ],
);

export type Refill = typeof refillsTable.$inferSelect;
export type Commission = typeof commissionsTable.$inferSelect;
