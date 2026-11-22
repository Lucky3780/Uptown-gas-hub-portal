import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  db,
  pool,
  portalSettingsTable,
  tiersTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./lib/logger";
import { normalizeEmail, normalizeKenyanPhone } from "./lib/portal";

const defaultTiers = [
  {
    name: "Starter",
    sortOrder: 1,
    thresholdMetric: "refills" as const,
    thresholdValue: 0,
    commissionBps: 200,
    period: "lifetime" as const,
    active: true,
  },
  {
    name: "Silver",
    sortOrder: 2,
    thresholdMetric: "refills" as const,
    thresholdValue: 10,
    commissionBps: 300,
    period: "lifetime" as const,
    active: true,
  },
  {
    name: "Gold",
    sortOrder: 3,
    thresholdMetric: "refills" as const,
    thresholdValue: 25,
    commissionBps: 400,
    period: "lifetime" as const,
    active: true,
  },
  {
    name: "Platinum",
    sortOrder: 4,
    thresholdMetric: "refills" as const,
    thresholdValue: 50,
    commissionBps: 500,
    period: "lifetime" as const,
    active: true,
  },
];

async function seed(): Promise<void> {
  await db
    .insert(tiersTable)
    .values(defaultTiers)
    .onConflictDoNothing({ target: tiersTable.name });
  await db
    .insert(portalSettingsTable)
    .values({
      id: 1,
      minimumPayoutKES: 1000,
      referralBaseUrl: process.env.PORTAL_PUBLIC_URL ?? "",
      whatsappProvider: "wa_me",
      whatsappEnabled: true,
      mpesaMode: "manual",
    })
    .onConflictDoNothing({ target: portalSettingsTable.id });

  const email = process.env.UPTOWN_ADMIN_EMAIL?.trim();
  const password = process.env.UPTOWN_ADMIN_PASSWORD;
  const phoneValue = process.env.UPTOWN_ADMIN_PHONE;
  if (!email && !password) {
    logger.warn(
      "No bootstrap admin was created. Set UPTOWN_ADMIN_EMAIL and UPTOWN_ADMIN_PASSWORD, then run the seed command.",
    );
    return;
  }
  if (!email || !password || password.length < 14) {
    throw new Error(
      "Set both UPTOWN_ADMIN_EMAIL and a UPTOWN_ADMIN_PASSWORD of at least 14 characters.",
    );
  }
  const [existing] = await db
    .select({
      id: usersTable.id,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.email, normalizeEmail(email)))
    .limit(1);
  if (existing) {
    if (existing.role !== "admin") {
      throw new Error(
        "The bootstrap email belongs to an affiliate account; refusing to elevate it.",
      );
    }
    logger.info("Bootstrap administrator already exists; no account changes made");
    return;
  }
  const phone = normalizeKenyanPhone(phoneValue ?? "");
  if (!phone) {
    throw new Error(
      "Set UPTOWN_ADMIN_PHONE to a valid Kenyan phone number before creating an administrator.",
    );
  }
  await db.insert(usersTable).values({
    name: "Portal Administrator",
    email: normalizeEmail(email),
    passwordHash: await bcrypt.hash(password, 12),
    phone,
    role: "admin",
    status: "approved",
  });
  logger.info("Bootstrap administrator created");
}

seed()
  .catch((error: unknown) => {
    logger.error({ err: error }, "Portal seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
