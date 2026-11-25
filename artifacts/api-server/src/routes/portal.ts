import { Router, type IRouter } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  sql,
  sum,
} from "drizzle-orm";
import {
  db,
  affiliatesTable,
  commissionsTable,
  notificationsTable,
  payoutCommissionsTable,
  payoutsTable,
  refillsTable,
  tiersTable,
  usersTable,
} from "@workspace/db";
import {
  GetDashboardResponse,
  GetLeaderboardQueryParams,
  GetLeaderboardResponse,
  ListMyCommissionsResponse,
  ListMyNotificationsResponse,
  ListMyPayoutsResponse,
  ListMySalesResponse,
  UpdateNotificationParams,
  UpdateNotificationResponse,
  UpdateNotificationBody,
  RequestPayoutBody,
  RequestPayoutResponse,
} from "@workspace/api-zod";
import {
  requireAdmin,
  requireApprovedAffiliate,
  requireAuth,
  csrfGuard,
} from "../lib/auth";
import {
  buildWhatsAppUrl,
  getAffiliateForUser,
  getSettings,
  queueNotification,
} from "../lib/portal";

const router: IRouter = Router();

const currentNairobiDate = (date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

function monthStart(date = new Date()): string {
  return `${currentNairobiDate(date).slice(0, 7)}-01`;
}

function weekStart(date = new Date()): string {
  const iso = currentNairobiDate(date);
  const utc = new Date(`${iso}T00:00:00.000Z`);
  const day = utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() - ((day + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

function dateFromPeriod(period: "week" | "month" | "all_time"): string | null {
  if (period === "week") return weekStart();
  if (period === "month") return monthStart();
  return null;
}

async function leaderboardRows(
  period: "week" | "month" | "all_time",
  metric: "refills" | "revenue" | "earnings",
  limit = 10,
) {
  const startDate = dateFromPeriod(period);
  const periodFilter = startDate
    ? and(
        eq(refillsTable.status, "approved"),
        gte(refillsTable.refillDate, startDate),
      )
    : eq(refillsTable.status, "approved");
  const rows = await db
    .select({
      affiliateId: affiliatesTable.id,
      name: usersTable.name,
      lifetimeRefills: sql<number>`count(${refillsTable.id})::int`,
      lifetimeRevenue: sql<number>`coalesce(sum(${refillsTable.amountKES}), 0)::int`,
      monthRefills: sql<number>`count(*) filter (where ${refillsTable.refillDate} >= ${monthStart()})::int`,
      monthRevenue: sql<number>`coalesce(sum(${refillsTable.amountKES}) filter (where ${refillsTable.refillDate} >= ${monthStart()}), 0)::int`,
      refills: sql<number>`count(*) filter (where ${periodFilter})::int`,
      revenue: sql<number>`coalesce(sum(${refillsTable.amountKES}) filter (where ${periodFilter}), 0)::int`,
      earnings: sql<number>`coalesce(sum(${commissionsTable.amountKES}) filter (where ${periodFilter}), 0)::int`,
    })
    .from(affiliatesTable)
    .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
    .leftJoin(
      refillsTable,
      and(
        eq(refillsTable.affiliateId, affiliatesTable.id),
        eq(refillsTable.status, "approved"),
      ),
    )
    .leftJoin(
      commissionsTable,
      and(
        eq(commissionsTable.refillId, refillsTable.id),
        inArray(commissionsTable.status, ["available", "reserved", "paid"]),
      ),
    )
    .where(eq(usersTable.status, "approved"))
    .groupBy(affiliatesTable.id, usersTable.name);

  const tiers = await db
    .select()
    .from(tiersTable)
    .where(eq(tiersTable.active, true))
    .orderBy(asc(tiersTable.sortOrder));
  const sorted = rows
    .map((row) => {
      const selectedTier =
        tiers
          .filter((tier) => {
            const current =
              tier.period === "monthly"
                ? tier.thresholdMetric === "refills"
                  ? Number(row.monthRefills ?? 0)
                  : Number(row.monthRevenue ?? 0)
                : tier.thresholdMetric === "refills"
                  ? Number(row.lifetimeRefills ?? 0)
                  : Number(row.lifetimeRevenue ?? 0);
            return current >= tier.thresholdValue;
          })
          .sort((a, b) => b.sortOrder - a.sortOrder)[0] ?? tiers[0];
      return {
        affiliateId: row.affiliateId,
        name: row.name,
        tierName: selectedTier?.name ?? "Starter",
        refillCount: Number(row.refills ?? 0),
        revenueKES: Number(row.revenue ?? 0),
        earningsKES: Number(row.earnings ?? 0),
      };
    })
    .sort((a, b) => {
      if (metric === "revenue") return b.revenueKES - a.revenueKES;
      if (metric === "earnings") return b.earningsKES - a.earningsKES;
      return b.refillCount - a.refillCount;
    })
    .slice(0, limit)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
  return sorted;
}

async function refillRows(affiliateId?: string, limit?: number) {
  const rows = await db
    .select({
      id: refillsTable.id,
      affiliateId: affiliatesTable.id,
      affiliateName: usersTable.name,
      referralCode: affiliatesTable.referralCode,
      customerName: refillsTable.customerName,
      customerPhone: refillsTable.customerPhone,
      litres: refillsTable.litres,
      amountKES: refillsTable.amountKES,
      status: refillsTable.status,
      refillDate: refillsTable.refillDate,
      commissionKES: commissionsTable.amountKES,
      commissionPerRefillKES: commissionsTable.commissionPerRefillKES,
      tierName: commissionsTable.tierName,
      notes: refillsTable.notes,
      createdAt: refillsTable.createdAt,
    })
    .from(refillsTable)
    .innerJoin(affiliatesTable, eq(refillsTable.affiliateId, affiliatesTable.id))
    .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
    .leftJoin(commissionsTable, eq(commissionsTable.refillId, refillsTable.id))
    .where(affiliateId ? eq(affiliatesTable.id, affiliateId) : undefined)
    .orderBy(desc(refillsTable.refillDate), desc(refillsTable.createdAt))
    .limit(limit ?? 500);
  return rows.map((row) => ({
    ...row,
    litres: Number(row.litres),
    commissionKES: row.commissionKES ?? 0,
    commissionPerRefillKES: row.commissionPerRefillKES ?? 0,
    tierName: row.tierName ?? null,
    notes: row.notes ?? null,
  }));
}

async function tierForAffiliate(affiliateId: string) {
  const totals = await db
    .select({
      lifetimeRefills: count(refillsTable.id),
      lifetimeRevenue: sum(refillsTable.amountKES),
      monthRefills: sql<number>`count(*) filter (where ${refillsTable.refillDate} >= ${monthStart()})::int`,
      monthRevenue: sql<number>`coalesce(sum(${refillsTable.amountKES}) filter (where ${refillsTable.refillDate} >= ${monthStart()}), 0)::int`,
    })
    .from(refillsTable)
    .where(
      and(
        eq(refillsTable.affiliateId, affiliateId),
        eq(refillsTable.status, "approved"),
      ),
    );
  const row = totals[0];
  const lifetimeRefills = Number(row?.lifetimeRefills ?? 0);
  const lifetimeRevenue = Number(row?.lifetimeRevenue ?? 0);
  const monthRefills = Number(row?.monthRefills ?? 0);
  const monthRevenue = Number(row?.monthRevenue ?? 0);
  const tiers = await db
    .select()
    .from(tiersTable)
    .where(eq(tiersTable.active, true))
    .orderBy(asc(tiersTable.sortOrder));
  const qualified = tiers.filter((tier) => {
    const current =
      tier.period === "monthly"
        ? tier.thresholdMetric === "refills"
          ? monthRefills
          : monthRevenue
        : tier.thresholdMetric === "refills"
          ? lifetimeRefills
          : lifetimeRevenue;
    return current >= tier.thresholdValue;
  });
  const currentTier =
    qualified.sort((a, b) => b.sortOrder - a.sortOrder)[0] ?? tiers[0];
  const nextTier =
    tiers.find((tier) => tier.sortOrder > (currentTier?.sortOrder ?? 0)) ?? null;
  let progress = 100;
  if (nextTier) {
    const current =
      nextTier.period === "monthly"
        ? nextTier.thresholdMetric === "refills"
          ? monthRefills
          : monthRevenue
        : nextTier.thresholdMetric === "refills"
          ? lifetimeRefills
          : lifetimeRevenue;
    const baseTier = currentTier ?? tiers[0];
    const base =
      baseTier?.period === nextTier.period &&
      baseTier.thresholdMetric === nextTier.thresholdMetric
        ? baseTier.thresholdValue
        : 0;
    progress = Math.max(
      0,
      Math.min(
        100,
        nextTier.thresholdValue <= base
          ? 100
          : ((current - base) / (nextTier.thresholdValue - base)) * 100,
      ),
    );
  }
  return { currentTier, nextTier, progress };
}

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const accountRows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
      referralCode: affiliatesTable.referralCode,
      affiliateId: affiliatesTable.id,
    })
    .from(usersTable)
    .leftJoin(affiliatesTable, eq(affiliatesTable.userId, usersTable.id))
    .where(eq(usersTable.id, req.auth!.userId))
    .limit(1);
  const account = accountRows[0];
  if (!account) {
    res.status(404).json({ error: "Account not found." });
    return;
  }

  const settings = await getSettings();
  const leaderboard = await leaderboardRows("month", "refills", 5);
  const recentRefills = account.role === "admin"
    ? await refillRows(undefined, 5)
    : account.affiliateId
      ? await refillRows(account.affiliateId, 5)
      : [];

  if (account.role === "admin") {
    const [pendingAffiliates] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(and(eq(usersTable.role, "affiliate"), eq(usersTable.status, "pending")));
    const [pendingRefills] = await db
      .select({ value: count() })
      .from(refillsTable)
      .where(eq(refillsTable.status, "pending"));
    const [pendingPayouts] = await db
      .select({ value: count() })
      .from(payoutsTable)
      .where(eq(payoutsTable.status, "pending"));
    const start = monthStart();
    const [month] = await db
      .select({
        revenue: sum(refillsTable.amountKES),
        commission: sum(commissionsTable.amountKES),
      })
      .from(refillsTable)
      .leftJoin(commissionsTable, eq(commissionsTable.refillId, refillsTable.id))
      .where(
        and(
          eq(refillsTable.status, "approved"),
          gte(refillsTable.refillDate, start),
        ),
      );
    const payload = {
      account: {
        ...account,
        referralCode: null,
      },
      stats: {
        refillCount: 0,
        revenueKES: 0,
        commissionKES: 0,
        availableKES: 0,
        pendingPayoutKES: 0,
        currentTier: "Administrator",
        nextTier: null,
        tierProgress: 100,
        minimumPayoutKES: settings.minimumPayoutKES,
      },
      recentRefills,
      leaderboard,
      admin: {
        pendingAffiliates: Number(pendingAffiliates?.value ?? 0),
        pendingRefills: Number(pendingRefills?.value ?? 0),
        pendingPayouts: Number(pendingPayouts?.value ?? 0),
        monthRevenueKES: Number(month?.revenue ?? 0),
        monthCommissionKES: Number(month?.commission ?? 0),
      },
    };
    res.json(GetDashboardResponse.parse(payload));
    return;
  }

  if (account.status !== "approved" || !account.affiliateId) {
    res.json(
      GetDashboardResponse.parse({
        account: { ...account, referralCode: account.referralCode ?? null },
        stats: {
          refillCount: 0,
          revenueKES: 0,
          commissionKES: 0,
          availableKES: 0,
          pendingPayoutKES: 0,
          currentTier: account.status === "pending" ? "Pending approval" : "—",
          nextTier: null,
          tierProgress: 0,
          minimumPayoutKES: settings.minimumPayoutKES,
        },
        recentRefills: [],
        leaderboard,
        admin: null,
      }),
    );
    return;
  }

  const [sales] = await db
    .select({
      refillCount: count(refillsTable.id),
      revenueKES: sum(refillsTable.amountKES),
    })
    .from(refillsTable)
    .where(
      and(
        eq(refillsTable.affiliateId, account.affiliateId),
        eq(refillsTable.status, "approved"),
      ),
    );
  const [commissionTotals] = await db
    .select({
      commissionKES: sum(commissionsTable.amountKES),
    })
    .from(commissionsTable)
    .where(
      and(
        eq(commissionsTable.affiliateId, account.affiliateId),
        inArray(commissionsTable.status, ["available", "reserved", "paid"]),
      ),
    );
  const [available] = await db
    .select({ value: sum(commissionsTable.amountKES) })
    .from(commissionsTable)
    .where(
      and(
        eq(commissionsTable.affiliateId, account.affiliateId),
        eq(commissionsTable.status, "available"),
      ),
    );
  const [pending] = await db
    .select({ value: sum(payoutsTable.amountKES) })
    .from(payoutsTable)
    .where(
      and(
        eq(payoutsTable.affiliateId, account.affiliateId),
        inArray(payoutsTable.status, ["pending", "approved"]),
      ),
    );
  const tier = await tierForAffiliate(account.affiliateId);
  const payload = {
    account: { ...account, referralCode: account.referralCode },
    stats: {
      refillCount: Number(sales?.refillCount ?? 0),
      revenueKES: Number(sales?.revenueKES ?? 0),
      commissionKES: Number(commissionTotals?.commissionKES ?? 0),
      availableKES: Number(available?.value ?? 0),
      pendingPayoutKES: Number(pending?.value ?? 0),
      currentTier: tier.currentTier?.name ?? "Starter",
      nextTier: tier.nextTier?.name ?? null,
      tierProgress: tier.progress,
      minimumPayoutKES: settings.minimumPayoutKES,
    },
    recentRefills,
    leaderboard,
    admin: null,
  };
  res.json(GetDashboardResponse.parse(payload));
});

router.get(
  "/sales",
  requireAuth,
  requireApprovedAffiliate,
  async (req, res): Promise<void> => {
    const affiliate = await getAffiliateForUser(req.auth!.userId);
    if (!affiliate) {
      res.status(404).json({ error: "Affiliate profile not found." });
      return;
    }
    res.json(ListMySalesResponse.parse(await refillRows(affiliate.id)));
  },
);

router.get(
  "/commissions",
  requireAuth,
  requireApprovedAffiliate,
  async (req, res): Promise<void> => {
    const affiliate = await getAffiliateForUser(req.auth!.userId);
    if (!affiliate) {
      res.status(404).json({ error: "Affiliate profile not found." });
      return;
    }
    const rows = await db
      .select({
        id: commissionsTable.id,
        refillId: commissionsTable.refillId,
        customerName: refillsTable.customerName,
        amountKES: commissionsTable.amountKES,
        commissionPerRefillKES: commissionsTable.commissionPerRefillKES,
        tierName: commissionsTable.tierName,
        status: commissionsTable.status,
        createdAt: commissionsTable.createdAt,
      })
      .from(commissionsTable)
      .innerJoin(refillsTable, eq(commissionsTable.refillId, refillsTable.id))
      .where(eq(commissionsTable.affiliateId, affiliate.id))
      .orderBy(desc(commissionsTable.createdAt));
    res.json(
      ListMyCommissionsResponse.parse(
        rows.map(({ commissionPerRefillKES, ...row }) => ({
          ...row,
          commissionPerRefillKES,
        })),
      ),
    );
  },
);

router.get("/leaderboard", requireAuth, async (req, res): Promise<void> => {
  const query = GetLeaderboardQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const rows = await leaderboardRows(
    query.data.period ?? "month",
    query.data.metric ?? "refills",
  );
  res.json(GetLeaderboardResponse.parse(rows));
});

router.get(
  "/payouts",
  requireAuth,
  requireApprovedAffiliate,
  async (req, res): Promise<void> => {
    const affiliate = await getAffiliateForUser(req.auth!.userId);
    if (!affiliate) {
      res.status(404).json({ error: "Affiliate profile not found." });
      return;
    }
    const rows = await db
      .select({
        id: payoutsTable.id,
        affiliateId: payoutsTable.affiliateId,
        affiliateName: usersTable.name,
        amountKES: payoutsTable.amountKES,
        phone: payoutsTable.phone,
        status: payoutsTable.status,
        transactionReference: payoutsTable.transactionReference,
        rejectionReason: payoutsTable.rejectionReason,
        createdAt: payoutsTable.createdAt,
        paidAt: payoutsTable.paidAt,
      })
      .from(payoutsTable)
      .innerJoin(affiliatesTable, eq(payoutsTable.affiliateId, affiliatesTable.id))
      .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
      .where(eq(payoutsTable.affiliateId, affiliate.id))
      .orderBy(desc(payoutsTable.createdAt));
    res.json(ListMyPayoutsResponse.parse(rows));
  },
);

router.post(
  "/payouts",
  requireAuth,
  requireApprovedAffiliate,
  csrfGuard,
  async (req, res): Promise<void> => {
    const parsed = RequestPayoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const affiliate = await getAffiliateForUser(req.auth!.userId);
    const [user] = await db
      .select({
        phone: usersTable.phone,
        recipientName: usersTable.name,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.userId))
      .limit(1);
    if (!affiliate || !user) {
      res.status(404).json({ error: "Affiliate profile not found." });
      return;
    }
    const settings = await getSettings();
    const result = await db.transaction(async (tx) => {
      const activeRequests = await tx
        .select({ id: payoutsTable.id })
        .from(payoutsTable)
        .where(
          and(
            eq(payoutsTable.affiliateId, affiliate.id),
            inArray(payoutsTable.status, ["pending", "approved"]),
          ),
        )
        .limit(1);
      if (activeRequests.length) {
        return { error: "You already have a payout request being processed." };
      }
      const available = await tx
        .select()
        .from(commissionsTable)
        .where(
          and(
            eq(commissionsTable.affiliateId, affiliate.id),
            eq(commissionsTable.status, "available"),
          ),
        )
        .orderBy(asc(commissionsTable.createdAt))
        .for("update");
      const availableTotal = available.reduce((total, row) => total + row.amountKES, 0);
      if (parsed.data.amountKES < settings.minimumPayoutKES) {
        return {
          error: `The minimum payout request is KES ${settings.minimumPayoutKES.toLocaleString()}.`,
        };
      }
      if (parsed.data.amountKES !== availableTotal || availableTotal <= 0) {
        return {
          error: "Request the full available commission balance to keep each ledger entry intact.",
        };
      }
      const [payout] = await tx
        .insert(payoutsTable)
        .values({
          affiliateId: affiliate.id,
          amountKES: availableTotal,
          phone: user.phone,
          status: "pending",
        })
        .returning();
      await tx.insert(payoutCommissionsTable).values(
        available.map((commission) => ({
          payoutId: payout.id,
          commissionId: commission.id,
          amountKES: commission.amountKES,
        })),
      );
      await tx
        .update(commissionsTable)
        .set({ status: "reserved" })
        .where(
          inArray(
            commissionsTable.id,
            available.map((commission) => commission.id),
          ),
        );
      return { payout };
    });
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    const [affiliateUser] = await db
      .select({ name: usersTable.name })
      .from(affiliatesTable)
      .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
      .where(eq(affiliatesTable.id, affiliate.id))
      .limit(1);
    await queueNotification(
      affiliate.id,
      "payout_requested",
      "Payout request received",
      `Your request for KES ${result.payout.amountKES.toLocaleString()} has been received and is awaiting review.`,
    );
    const payload = {
      ...result.payout,
      affiliateName: affiliateUser?.name ?? "Affiliate",
      transactionReference: null,
      rejectionReason: null,
    };
    res.status(201).json(RequestPayoutResponse.parse(payload));
  },
);

router.get(
  "/notifications",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        affiliateId: affiliatesTable.id,
        recipientName: usersTable.name,
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
      .orderBy(desc(notificationsTable.createdAt));
    const payload = rows.map(({ phone, ...row }) => ({
      ...row,
      whatsappUrl: buildWhatsAppUrl(phone, row.message),
    }));
    res.json(ListMyNotificationsResponse.parse(payload));
  },
);

router.patch(
  "/notifications/:id",
  requireAuth,
  requireAdmin,
  csrfGuard,
  async (req, res): Promise<void> => {
    const params = UpdateNotificationParams.safeParse(req.params);
    const body = UpdateNotificationBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success
          ? params.error?.message ?? "Invalid notification identifier."
          : !body.success
            ? body.error.message
            : "Invalid notification request.",
      });
      return;
    }
    const [current] = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, params.data.id))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Notification not found." });
      return;
    }
    const nextStatus = body.data.action === "mark_sent" ? "sent" : "queued";
    const [updated] = await db
      .update(notificationsTable)
      .set({
        deliveryStatus: nextStatus,
        attempts: current.attempts + 1,
        sentAt: nextStatus === "sent" ? new Date() : null,
        lastError: null,
      })
      .where(eq(notificationsTable.id, current.id))
      .returning();
    const [user] = await db
      .select({
        phone: usersTable.phone,
        recipientName: usersTable.name,
      })
      .from(affiliatesTable)
      .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
      .where(eq(affiliatesTable.id, current.affiliateId))
      .limit(1);
    res.json(
      UpdateNotificationResponse.parse({
        ...updated,
        recipientName: user?.recipientName ?? "Affiliate",
        whatsappUrl: buildWhatsAppUrl(user?.phone, updated.message),
      }),
    );
  },
);

export default router;
