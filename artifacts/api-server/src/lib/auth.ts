import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, affiliatesTable, sessionsTable, usersTable } from "@workspace/db";

export type AuthContext = {
  sessionId: string;
  userId: string;
  role: "affiliate" | "admin";
  status: "pending" | "approved" | "rejected" | "suspended";
  csrfHash: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const isProduction = process.env.NODE_ENV === "production";
const sessionCookie = isProduction
  ? "__Host-uptown-session"
  : "uptown_session";
const csrfCookie = isProduction ? "__Host-uptown-csrf" : "uptown_csrf";
const cookieBase = {
  path: "/",
  sameSite: "strict" as const,
  secure: isProduction,
};
const sessionSecret =
  process.env.SESSION_SECRET ??
  (isProduction ? "" : randomBytes(32).toString("hex"));

if (isProduction && sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters in production.");
}

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function newCsrfToken(): string {
  const nonce = randomBytes(32).toString("hex");
  const signature = createHmac("sha256", sessionSecret)
    .update(nonce)
    .digest("hex");
  return `${nonce}.${signature}`;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isValidCsrfToken(token: string): boolean {
  const [nonce, signature, extra] = token.split(".");
  if (!nonce || !signature || extra !== undefined) return false;
  const expected = createHmac("sha256", sessionSecret)
    .update(nonce)
    .digest("hex");
  return safeEqual(signature, expected);
}

function cookieValue(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const pair of raw.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function csrfCookieName(): string {
  return csrfCookie;
}

export async function issueCsrfCookie(req: Request, res: Response): Promise<string> {
  const token = newCsrfToken();
  res.cookie(csrfCookie, token, {
    ...cookieBase,
    httpOnly: false,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  const sessionToken = cookieValue(req, sessionCookie);
  if (sessionToken) {
    await db
      .update(sessionsTable)
      .set({ csrfHash: sha256(token) })
      .where(eq(sessionsTable.tokenHash, sha256(sessionToken)));
  }

  return token;
}

export function csrfGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const cookieToken = cookieValue(req, csrfCookie);
  const headerToken = req.get("X-CSRF-Token");
  const origin = req.get("Origin");
  const requestHost = req.get("host");

  if (
    (origin &&
      requestHost &&
      (() => {
        try {
          return new URL(origin).host !== requestHost;
        } catch {
          return true;
        }
      })()) ||
    !cookieToken ||
    !headerToken ||
    !safeEqual(cookieToken, headerToken) ||
    !isValidCsrfToken(cookieToken)
  ) {
    res.status(403).json({ error: "CSRF validation failed." });
    return;
  }

  next();
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(sessionCookie, token, {
    ...cookieBase,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(sessionCookie, { ...cookieBase, httpOnly: true });
  res.clearCookie(csrfCookie, { ...cookieBase, httpOnly: false });
}

export async function createSession(
  userId: string,
  req: Request,
  res: Response,
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const existingCsrfToken = cookieValue(req, csrfCookie);
  const csrfToken =
    existingCsrfToken && isValidCsrfToken(existingCsrfToken)
      ? existingCsrfToken
      : newCsrfToken();
  const now = new Date();
  await db.insert(sessionsTable).values({
    userId,
    tokenHash: sha256(token),
    csrfHash: sha256(csrfToken),
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    lastSeenAt: now,
  });
  setSessionCookie(res, token);
  res.cookie(csrfCookie, csrfToken, {
    ...cookieBase,
    httpOnly: false,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = cookieValue(req, sessionCookie);
  if (!token) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  void (async () => {
    const rows = await db
      .select({
        sessionId: sessionsTable.id,
        userId: usersTable.id,
        role: usersTable.role,
        status: usersTable.status,
        csrfHash: sessionsTable.csrfHash,
      })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(
        and(
          eq(sessionsTable.tokenHash, sha256(token)),
          gt(sessionsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const auth = rows[0];
    if (!auth) {
      clearSessionCookies(res);
      res.status(401).json({ error: "Your session has expired. Sign in again." });
      return;
    }

    const csrf = cookieValue(req, csrfCookie);
    if (!csrf || !safeEqual(sha256(csrf), auth.csrfHash)) {
      res.status(403).json({ error: "Refresh the page to continue securely." });
      return;
    }

    req.auth = auth;
    await db
      .update(sessionsTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessionsTable.id, auth.sessionId));
    next();
  })().catch(next);
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  if (req.auth.role !== "admin" || req.auth.status !== "approved") {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }
  next();
}

export function requireApprovedAffiliate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  if (req.auth.role !== "affiliate") {
    res.status(403).json({ error: "This action is for affiliates only." });
    return;
  }
  if (req.auth.status !== "approved") {
    res.status(403).json({
      error:
        req.auth.status === "pending"
          ? "Your application is awaiting approval."
          : "This affiliate account cannot access the portal.",
    });
    return;
  }
  next();
}

export async function getPortalUser(userId: string) {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
      referralCode: affiliatesTable.referralCode,
    })
    .from(usersTable)
    .leftJoin(affiliatesTable, eq(affiliatesTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  return rows[0];
}
