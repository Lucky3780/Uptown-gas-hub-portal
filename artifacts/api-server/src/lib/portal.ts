import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import { db, auditLogsTable, affiliatesTable, notificationsTable, portalSettingsTable, usersTable } from "@workspace/db";
import * as schema from "@workspace/db/schema";
import { logger } from "./logger";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeKenyanPhone(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");
  const normalized = digits.startsWith("0")
    ? `254${digits.slice(1)}`
    : digits.startsWith("254")
      ? digits
      : digits;
  return /^254[17]\d{8}$/.test(normalized) ? normalized : null;
}

export function makeReferralCode(): string {
  const random = randomBytes(6).toString("hex").toUpperCase();
  return `UGH${random}`;
}

type Transaction = NodePgTransaction<typeof schema, any>;

export async function writeAudit(
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  transaction: Transaction | typeof db = db,
): Promise<void> {
  await transaction.insert(auditLogsTable).values({
    actorUserId,
    action,
    entityType,
    entityId,
    before: before as object | null,
    after: after as object | null,
  });
}

export async function queueNotification(
  affiliateId: string,
  eventType: string,
  title: string,
  message: string,
  transaction: Transaction | typeof db = db,
): Promise<void> {
  await transaction.insert(notificationsTable).values({
    affiliateId,
    eventType,
    title,
    message,
    deliveryStatus: "queued",
  });
}

export async function getSettings() {
  const [settings] = await db.select().from(portalSettingsTable).limit(1);
  if (settings) return settings;

  const [inserted] = await db
    .insert(portalSettingsTable)
    .values({
      referralBaseUrl: process.env.PORTAL_PUBLIC_URL ?? "",
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;
  const [reloaded] = await db.select().from(portalSettingsTable).limit(1);
  if (!reloaded) throw new Error("Portal settings are not available.");
  return reloaded;
}

export async function getAffiliateForUser(userId: string) {
  const [affiliate] = await db
    .select()
    .from(affiliatesTable)
    .where(eq(affiliatesTable.userId, userId))
    .limit(1);
  return affiliate;
}

export function buildWhatsAppUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  if (!phone) return null;
  const normalized = normalizeKenyanPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export async function notificationsForAffiliate(affiliateId: string) {
  const rows = await db
    .select({
      id: notificationsTable.id,
      eventType: notificationsTable.eventType,
      title: notificationsTable.title,
      message: notificationsTable.message,
      deliveryStatus: notificationsTable.deliveryStatus,
      attempts: notificationsTable.attempts,
      createdAt: notificationsTable.createdAt,
      phone: usersTable.phone,
    })
    .from(notificationsTable)
    .innerJoin(affiliatesTable, eq(notificationsTable.affiliateId, affiliatesTable.id))
    .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
    .where(eq(notificationsTable.affiliateId, affiliateId));
  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(({ phone, ...row }) => ({
      ...row,
      whatsappUrl: buildWhatsAppUrl(phone, row.message),
    }));
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  origin: string,
): Promise<boolean> {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM,
    PORTAL_PUBLIC_URL,
  } = process.env;
  if (
    !SMTP_HOST ||
    !SMTP_PORT ||
    !SMTP_USER ||
    !SMTP_PASSWORD ||
    !SMTP_FROM
  ) {
    logger.warn("Password reset email skipped because SMTP is not configured");
    return false;
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  const baseUrl = (PORTAL_PUBLIC_URL || origin).replace(/\/+$/, "");
  const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: "Reset your Uptown Gas Hub affiliate password",
      text: `Use this one-time link to reset your password. It expires in 30 minutes: ${resetLink}`,
    });
    return true;
  } catch (error) {
    logger.error({ err: error }, "Password reset email delivery failed");
    return false;
  } finally {
    transport.close();
  }
}

export function passwordResetTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function auditSnapshot(
  entityType: string,
  entityId: string,
): Promise<unknown> {
  if (entityType === "affiliate") {
    const [row] = await db
      .select({
        id: affiliatesTable.id,
        referralCode: affiliatesTable.referralCode,
        status: usersTable.status,
      })
      .from(affiliatesTable)
      .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
      .where(eq(affiliatesTable.id, entityId))
      .limit(1);
    return row ?? null;
  }
  return null;
}

