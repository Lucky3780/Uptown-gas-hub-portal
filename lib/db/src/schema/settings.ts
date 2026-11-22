import {
  integer,
  pgEnum,
  pgTable,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const whatsappProviderEnum = pgEnum("whatsapp_provider", [
  "wa_me",
  "meta_cloud",
]);
export const mpesaModeEnum = pgEnum("mpesa_mode", ["manual", "daraja"]);

export const portalSettingsTable = pgTable("portal_settings", {
  id: integer("id").primaryKey().default(1),
  minimumPayoutKES: integer("minimum_payout_kes").notNull().default(1000),
  referralBaseUrl: text("referral_base_url").notNull().default(""),
  whatsappProvider: whatsappProviderEnum("whatsapp_provider")
    .notNull()
    .default("wa_me"),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(true),
  mpesaMode: mpesaModeEnum("mpesa_mode").notNull().default("manual"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PortalSettings = typeof portalSettingsTable.$inferSelect;
