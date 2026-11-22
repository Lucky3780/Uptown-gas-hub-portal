import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, affiliatesTable, auditLogsTable, passwordResetTokensTable, sessionsTable, usersTable } from "@workspace/db";
import {
  GetCsrfTokenResponse,
  GetCurrentUserResponse,
  LoginUserBody,
  LoginUserResponse,
  LogoutUserResponse,
  RegisterAffiliateBody,
  RegisterAffiliateResponse,
  RequestPasswordResetBody,
  RequestPasswordResetResponse,
  ResetPasswordBody,
  ResetPasswordResponse,
} from "@workspace/api-zod";
import {
  clearSessionCookies,
  createSession,
  csrfGuard,
  getPortalUser,
  issueCsrfCookie,
  requireAuth,
} from "../lib/auth";
import {
  isUniqueViolation,
  makeReferralCode,
  normalizeEmail,
  normalizeKenyanPhone,
  passwordResetTokenHash,
  sendPasswordResetEmail,
  writeAudit,
} from "../lib/portal";

const router: IRouter = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait and try again." },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Try again later." },
});

router.get("/auth/csrf", async (req, res): Promise<void> => {
  const token = await issueCsrfCookie(req, res);
  res.json(GetCsrfTokenResponse.parse({ token }));
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = await getPortalUser(req.auth!.userId);
  if (!user) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  res.json(GetCurrentUserResponse.parse(user));
});

router.post(
  "/auth/register",
  registerLimiter,
  csrfGuard,
  async (req, res): Promise<void> => {
    const parsed = RegisterAffiliateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const phone = normalizeKenyanPhone(parsed.data.phone);
    if (!phone) {
      res.status(400).json({ error: "Enter a valid Kenyan phone number." });
      return;
    }

    const email = normalizeEmail(parsed.data.email);
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    try {
      const created = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(usersTable)
          .values({
            name: parsed.data.name.trim(),
            email,
            passwordHash,
            phone,
            role: "affiliate",
            status: "pending",
          })
          .returning();

        let affiliate: typeof affiliatesTable.$inferSelect | undefined;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            [affiliate] = await tx
              .insert(affiliatesTable)
              .values({ userId: user.id, referralCode: makeReferralCode() })
              .returning();
            break;
          } catch (error) {
            if (!isUniqueViolation(error) || attempt === 2) throw error;
          }
        }
        if (!affiliate) throw new Error("Could not assign a unique referral code.");

        await writeAudit(
          null,
          "affiliate.registered",
          "affiliate",
          affiliate.id,
          null,
          { userId: user.id, status: user.status },
          tx,
        );
        return { user, affiliate };
      });

      await createSession(created.user.id, req, res);
      const response = {
        id: created.user.id,
        name: created.user.name,
        email: created.user.email,
        phone: created.user.phone,
        role: created.user.role,
        status: created.user.status,
        referralCode: created.affiliate.referralCode,
        createdAt: created.user.createdAt,
      };
      res.status(201).json(RegisterAffiliateResponse.parse(response));
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "An account with this email already exists." });
        return;
      }
      req.log.error({ err: error }, "Affiliate registration failed");
      res.status(500).json({ error: "Could not complete registration." });
    }
  },
);

router.post(
  "/auth/login",
  authLimiter,
  csrfGuard,
  async (req, res): Promise<void> => {
    const parsed = LoginUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizeEmail(parsed.data.email)))
      .limit(1);
    const matches = user
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;
    if (!user || !matches) {
      res.status(401).json({ error: "Email or password is incorrect." });
      return;
    }

    await createSession(user.id, req, res);
    const portalUser = await getPortalUser(user.id);
    res.json(LoginUserResponse.parse(portalUser));
  },
);

router.post(
  "/auth/logout",
  csrfGuard,
  requireAuth,
  async (req, res): Promise<void> => {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, req.auth!.sessionId));
    clearSessionCookies(res);
    res.json(LogoutUserResponse.parse({ success: true, message: "Signed out." }));
  },
);

router.post(
  "/auth/forgot-password",
  authLimiter,
  csrfGuard,
  async (req, res): Promise<void> => {
    const parsed = RequestPasswordResetBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const email = normalizeEmail(parsed.data.email);
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (user) {
      const token = randomBytes(32).toString("hex");
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(passwordResetTokensTable)
          .set({ usedAt: now })
          .where(
            and(
              eq(passwordResetTokensTable.userId, user.id),
              isNull(passwordResetTokensTable.usedAt),
            ),
          );
        await tx.insert(passwordResetTokensTable).values({
          userId: user.id,
          tokenHash: passwordResetTokenHash(token),
          expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
        });
      });
      const origin = req.get("Origin") ?? `${req.protocol}://${req.get("host")}`;
      await sendPasswordResetEmail(user.email, token, origin);
    }

    res.json(
      RequestPasswordResetResponse.parse({
        success: true,
        message: "If the account exists, a reset link will be sent.",
      }),
    );
  },
);

router.post(
  "/auth/reset-password",
  authLimiter,
  csrfGuard,
  async (req, res): Promise<void> => {
    const parsed = ResetPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tokenHash = passwordResetTokenHash(parsed.data.token);
    const [resetToken] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          gt(passwordResetTokensTable.expiresAt, new Date()),
          isNull(passwordResetTokensTable.usedAt),
        ),
      )
      .limit(1);
    if (!resetToken) {
      res.status(400).json({ error: "This reset link is invalid or has expired." });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const now = new Date();
    await db.transaction(async (tx) => {
      const [consumed] = await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokensTable.id, resetToken.id),
            isNull(passwordResetTokensTable.usedAt),
            gt(passwordResetTokensTable.expiresAt, now),
          ),
        )
        .returning({ id: passwordResetTokensTable.id });
      if (!consumed) throw new Error("Reset token was already used.");
      await tx
        .update(usersTable)
        .set({ passwordHash })
        .where(eq(usersTable.id, resetToken.userId));
      await tx
        .delete(sessionsTable)
        .where(eq(sessionsTable.userId, resetToken.userId));
      await tx.insert(auditLogsTable).values({
        actorUserId: resetToken.userId,
        action: "account.password_reset",
        entityType: "user",
        entityId: resetToken.userId,
      });
    });
    res.json(
      ResetPasswordResponse.parse({
        success: true,
        message: "Password updated. Sign in with your new password.",
      }),
    );
  },
);

export default router;
