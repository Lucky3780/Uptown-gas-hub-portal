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

export const notificationStatusEnum = pgEnum("notification_status", [
  "queued",
  "sent",
  "failed",
]);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliatesTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    deliveryStatus: notificationStatusEnum("delivery_status")
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_affiliate_created_idx").on(
      table.affiliateId,
      table.createdAt,
    ),
    index("notifications_status_idx").on(table.deliveryStatus, table.createdAt),
  ],
);

export type Notification = typeof notificationsTable.$inferSelect;
