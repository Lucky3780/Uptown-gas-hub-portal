import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, gte, inArray, sql, sum } from "drizzle-orm";
import {
  db,
  affiliatesTable,
  auditLogsTable,
  commissionsTable,
  notificationsTable,
  payoutCommissionsTable,
  payoutsTable,
  portalSettingsTable,
  refillsTable,
  tiersTable,
  usersTable,
} from "@workspace/db";
import {
  CreateRefillBody,
  CreateRefillResponse,
  GetAdminSettingsResponse,
  ListAffiliatesQueryParams,
  ListAffiliatesResponse,
  ListAllPayoutsQueryParams,
  ListAllPayoutsResponse,
  ListAllSalesQueryParams,
  ListAllSalesResponse,
  ListTiersResponse,
  ReviewAffiliateBody,
  ReviewAffiliateParams,
  ReviewAffiliateResponse,
  ReviewPayoutBody,
  ReviewPayoutParams,
  ReviewPayoutResponse,
  ReviewRefillBody,
  ReviewRefillParams,
  ReviewRefillResponse,
  UpdateAdminSettingsBody,
  UpdateAdminSettingsResponse,
  UpdateTierBody,
  UpdateTierParams,
  UpdateTierResponse,
} from "@workspace/api-zod";
import { csrfGuard, requireAdmin, requireAuth } from "../lib/auth";
import {
  getSettings,
  queueNotification,
  writeAudit,
} from "../lib/portal";

const router: IRouter = Router();
const adminAuth = [requireAuth, requireAdmin] as const;

function validFilter<T extends string>(
  value: T | "all" | undefined,
  allowed: readonly T[],
): T | "all" | undefined {
  if (value === undefined || value === "all") return value;
  return allowed.includes(value) ? value : undefined;
}

function commissionPercent(bps: number | null | undefined): number {
  return (bps ?? 0) / 100;
}

async function allRefills(status?: "pending" | "approved" | "voided" | "all") {
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
      commissionBps: commissionsTable.commissionBps,
      tierName: commissionsTable.tierName,
      notes: refillsTable.notes,
      createdAt: refillsTable.createdAt,
    })
    .from(refillsTable)
    .innerJoin(affiliatesTable, eq(refillsTable.affiliateId, affiliatesTable.id))
    .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
    .leftJoin(commissionsTable, eq(commissionsTable.refillId, refillsTable.id))
    .where(status && status !== "all" ? eq(refillsTable.status, status) : undefined)
    .orderBy(desc(refillsTable.refillDate), desc(refillsTable.createdAt))
    .limit(1000);
  return rows.map((row) => ({
    ...row,
    litres: Number(row.litres),
    commissionKES: row.commissionKES ?? 0,
    commissionPercent: commissionPercent(row.commissionBps),
    tierName: row.tierName ?? null,
    notes: row.notes ?? null,
  }));
}

async function getAffiliateList() {
  const rows = await db
    .select({
      id: affiliatesTable.id,
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      referralCode: affiliatesTable.referralCode,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
    })
    .from(affiliatesTable)
    .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
    .orderBy(desc(usersTable.createdAt));
  const totalsByAffiliate = new Map<string, { count: number; revenue: number }>();
  const aggregates = await db
    .select({
      affiliateId: refillsTable.affiliateId,
      refillCount: count(refillsTable.id),
      revenueKES: sum(refillsTable.amountKES),
    })
    .from(refillsTable)
    .where(eq(refillsTable.status, "approved"))
    .groupBy(refillsTable.affiliateId);
  for (const aggregate of aggregates) {
    totalsByAffiliate.set(aggregate.affiliateId, {
      count: Number(aggregate.refillCount),
      revenue: Number(aggregate.revenueKES ?? 0),
    });
  }
  const commissions = await db
    .select({
      affiliateId: commissionsTable.affiliateId,
      commissionKES: sum(commissionsTable.amountKES),
      availableKES: sql<number>`coalesce(sum(${commissionsTable.amountKES}) filter (where ${commissionsTable.status} = 'available'), 0)::int`,
      currentTier: sql<string>`(array_agg(${commissionsTable.tierName} order by ${commissionsTable.createdAt} desc))[1]`,
    })
    .from(commissionsTable)
    .where(inArray(commissionsTable.status, ["available", "reserved", "paid"]))
    .groupBy(commissionsTable.affiliateId);
  const commissionByAffiliate = new Map(
    commissions.map((row) => [
      row.affiliateId,
      {
        commission: Number(row.commissionKES ?? 0),
        available: Number(row.availableKES ?? 0),
        tier: row.currentTier ?? "Starter",
      },
    ]),
  );

  return rows.map((row) => {
    const totals = totalsByAffiliate.get(row.id);
    const commission = commissionByAffiliate.get(row.id);
    return {
      ...row,
      refillCount: totals?.count ?? 0,
      revenueKES: totals?.revenue ?? 0,
      commissionKES: commission?.commission ?? 0,
      availableKES: commission?.available ?? 0,
      tierName: commission?.tier ?? "Starter",
    };
  });
}

router.get(
  "/admin/affiliates",
  ...adminAuth,
  async (req, res): Promise<void> => {
    const query = ListAffiliatesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const status = validFilter(query.data.status, [
      "pending",
      "approved",
      "rejected",
      "suspended",
    ] as const);
    const rows = await getAffiliateList();
    const filtered = status
      ? rows.filter((affiliate) => affiliate.status === status)
      : rows;
    res.json(ListAffiliatesResponse.parse(filtered));
  },
);

router.patch(
  "/admin/affiliates/:id",
  ...adminAuth,
  csrfGuard,
  async (req, res): Promise<void> => {
    const params = ReviewAffiliateParams.safeParse(req.params);
    const body = ReviewAffiliateBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success
          ? params.error?.message ?? "Invalid affiliate identifier."
          : !body.success
            ? body.error.message
            : "Invalid affiliate review.",
      });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          id: affiliatesTable.id,
          userId: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          phone: usersTable.phone,
          referralCode: affiliatesTable.referralCode,
          status: usersTable.status,
          createdAt: usersTable.createdAt,
        })
        .from(affiliatesTable)
        .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
        .where(eq(affiliatesTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!before) return null;
      if (before.status === "rejected" && body.data.status === "approved") {
        throw new Error("Rejected affiliate applications cannot be reactivated.");
      }
      const [updatedUser] = await tx
        .update(usersTable)
        .set({ status: body.data.status })
        .where(eq(usersTable.id, before.userId))
        .returning();
      await writeAudit(
        req.auth!.userId,
        `affiliate.${body.data.status}`,
        "affiliate",
        before.id,
        { status: before.status },
        { status: updatedUser.status, reason: body.data.reason ?? null },
        tx,
      );
      if (body.data.status === "approved") {
        await queueNotification(
          before.id,
          "registration_approved",
          "Your affiliate application was approved",
          `Welcome to Uptown Gas Hub, ${before.name}. Your affiliate account is approved and your code is ${before.referralCode}.`,
          tx,
        );
      }
      return {
        ...before,
        status: updatedUser.status,
      };
    });
    if (!result) {
      res.status(404).json({ error: "Affiliate not found." });
      return;
    }
    const errorTierInfo = await getAffiliateList();
    const full = errorTierInfo.find((affiliate) => affiliate.id === result.id);
    res.json(
      ReviewAffiliateResponse.parse({
        ...result,
        refillCount: full?.refillCount ?? 0,
        revenueKES: full?.revenueKES ?? 0,
        commissionKES: full?.commissionKES ?? 0,
        availableKES: full?.availableKES ?? 0,
        tierName: full?.tierName ?? "Starter",
      }),
    );
  },
);

router.get(
  "/admin/sales",
  ...adminAuth,
  async (req, res): Promise<void> => {
    const query = ListAllSalesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const status = validFilter(query.data.status, [
      "pending",
      "approved",
      "voided",
    ] as const);
    const rows = await allRefills(status);
    res.json(ListAllSalesResponse.parse(rows));
  },
);

router.post(
  "/admin/sales",
  ...adminAuth,
  csrfGuard,
  async (req, res): Promise<void> => {
    const body = CreateRefillBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const code = body.data.referralCode.trim().toUpperCase();
    const [affiliate] = await db
      .select({
        id: affiliatesTable.id,
        name: usersTable.name,
        status: usersTable.status,
      })
      .from(affiliatesTable)
      .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
      .where(eq(affiliatesTable.referralCode, code))
      .limit(1);
    if (!affiliate || affiliate.status !== "approved") {
      res.status(400).json({ error: "Referral code is unknown or not active." });
      return;
    }
    const [refill] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(refillsTable)
        .values({
          affiliateId: affiliate.id,
          createdBy: req.auth!.userId,
          customerName: body.data.customerName.trim(),
          customerPhone: body.data.customerPhone ?? null,
          litres: body.data.litres,
          amountKES: body.data.amountKES,
          refillDate: body.data.refillDate.toISOString().slice(0, 10),
          notes: body.data.notes?.trim() || null,
          status: "pending",
        })
        .returning();
      await writeAudit(
        req.auth!.userId,
        "refill.created",
        "refill",
        created.id,
        null,
        {
          affiliateId: affiliate.id,
          amountKES: created.amountKES,
          status: created.status,
        },
        tx,
      );
      return [created];
    });
    res.status(201).json(
      CreateRefillResponse.parse({
        ...refill,
        affiliateName: affiliate.name,
        referralCode: code,
        litres: Number(refill.litres),
        commissionKES: 0,
        commissionPercent: 0,
        tierName: null,
      }),
    );
  },
);

router.patch(
  "/admin/sales/:id",
  ...adminAuth,
  csrfGuard,
  async (req, res): Promise<void> => {
    const params = ReviewRefillParams.safeParse(req.params);
    const body = ReviewRefillBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success
          ? params.error?.message ?? "Invalid refill identifier."
          : !body.success
            ? body.error.message
            : "Invalid refill review.",
      });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [refill] = await tx
        .select()
        .from(refillsTable)
        .where(eq(refillsTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!refill) return { notFound: true as const };
      if (refill.status === "voided") {
        return { conflict: "This refill has already been voided." };
      }
      if (
        refill.status === "approved" &&
        body.data.status === "approved"
      ) {
        return { conflict: "This refill has already been approved." };
      }
      const [affiliate] = await tx
        .select({
          id: affiliatesTable.id,
          name: usersTable.name,
          status: usersTable.status,
        })
        .from(affiliatesTable)
        .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
        .where(eq(affiliatesTable.id, refill.affiliateId))
        .limit(1);
      if (!affiliate) {
        return { conflict: "The affiliate profile no longer exists." };
      }
      if (
        body.data.status === "approved" &&
        affiliate.status !== "approved"
      ) {
        return { conflict: "The affiliate account is not active." };
      }

      let selectedTier: typeof tiersTable.$inferSelect | undefined;
      let activeTiers: Array<typeof tiersTable.$inferSelect> = [];
      let existingCommission:
        | typeof commissionsTable.$inferSelect
        | undefined;
      if (refill.status === "approved" && body.data.status === "voided") {
        [existingCommission] = await tx
          .select()
          .from(commissionsTable)
          .where(eq(commissionsTable.refillId, refill.id))
          .for("update")
          .limit(1);
        if (
          !existingCommission ||
          existingCommission.status === "paid" ||
          existingCommission.status === "reserved"
        ) {
          return {
            conflict:
              "This commission is already reserved for payout or paid and cannot be voided.",
          };
        }
      }
      if (body.data.status === "approved") {
        activeTiers = await tx
          .select()
          .from(tiersTable)
          .where(eq(tiersTable.active, true))
          .orderBy(asc(tiersTable.sortOrder));
        const qualified = [];
        for (const tier of activeTiers) {
          const conditions = [
            eq(refillsTable.affiliateId, refill.affiliateId),
            eq(refillsTable.status, "approved"),
          ];
          if (tier.period === "monthly") {
            const refillMonth = `${refill.refillDate.slice(0, 7)}-01`;
            conditions.push(gte(refillsTable.refillDate, refillMonth));
          }
          const [totals] = await tx
            .select({
              refills: count(refillsTable.id),
              revenue: sum(refillsTable.amountKES),
            })
            .from(refillsTable)
            .where(and(...conditions));
          const metric =
            tier.thresholdMetric === "refills"
              ? Number(totals?.refills ?? 0) + 1
              : Number(totals?.revenue ?? 0) + refill.amountKES;
          if (metric >= tier.thresholdValue) qualified.push(tier);
        }
        selectedTier =
          qualified.sort((a, b) => b.sortOrder - a.sortOrder)[0] ??
          activeTiers[0];
      }

      const refillUpdate =
        body.data.status === "approved"
          ? {
              status: body.data.status,
              approvedBy: req.auth!.userId,
              approvedAt: new Date(),
            }
          : { status: body.data.status };
      const [updated] = await tx
        .update(refillsTable)
        .set(refillUpdate)
        .where(eq(refillsTable.id, refill.id))
        .returning();

      let commissionKES = existingCommission?.amountKES ?? 0;
      let commissionPercent = existingCommission
        ? existingCommission.commissionBps / 100
        : 0;
      let tierName: string | null = existingCommission?.tierName ?? null;
      if (body.data.status === "approved") {
        if (!selectedTier) {
          throw new Error("No active tier exists; configure tiers before approving sales.");
        }
        commissionPercent = selectedTier.commissionBps / 100;
        commissionKES = Math.floor(
          (refill.amountKES * selectedTier.commissionBps) / 10000,
        );
        tierName = selectedTier.name;
        await tx.insert(commissionsTable).values({
          affiliateId: refill.affiliateId,
          refillId: refill.id,
          amountKES: commissionKES,
          commissionBps: selectedTier.commissionBps,
          tierName: selectedTier.name,
          status: "available",
        });
        await queueNotification(
          refill.affiliateId,
          "sale_credited",
          "A refill was credited to your account",
          `A ${refill.litres} L refill for KES ${refill.amountKES.toLocaleString()} has been approved. Commission: KES ${commissionKES.toLocaleString()} at ${commissionPercent}% (${selectedTier.name}).`,
          tx,
        );
        const [previous] = await tx
          .select({
            tierName: commissionsTable.tierName,
          })
          .from(commissionsTable)
          .innerJoin(refillsTable, eq(commissionsTable.refillId, refillsTable.id))
          .where(
            and(
              eq(commissionsTable.affiliateId, refill.affiliateId),
              sql`${commissionsTable.refillId} <> ${refill.id}`,
            ),
          )
          .orderBy(desc(refillsTable.refillDate), desc(commissionsTable.createdAt))
          .limit(1);
        const previousTierOrder = activeTiers.find(
          (tier) => tier.name === previous?.tierName,
        )?.sortOrder;
        if (previous && (previousTierOrder ?? -1) < selectedTier.sortOrder) {
          await queueNotification(
            refill.affiliateId,
            "tier_upgrade",
            `You reached ${selectedTier.name}`,
            `Your latest approved refill moved your account to ${selectedTier.name}, with a ${commissionPercent}% commission rate.`,
            tx,
          );
        }
      }
      if (
        refill.status === "approved" &&
        body.data.status === "voided" &&
        existingCommission
      ) {
        await tx
          .update(commissionsTable)
          .set({ status: "voided" })
          .where(
            and(
              eq(commissionsTable.id, existingCommission.id),
              eq(commissionsTable.status, "available"),
            ),
          );
      }

      await writeAudit(
        req.auth!.userId,
        `refill.${body.data.status}`,
        "refill",
        refill.id,
        { status: refill.status },
        {
          status: updated.status,
          commissionKES,
          tierName,
          reason: body.data.reason ?? null,
        },
        tx,
      );
      return {
        updated,
        affiliateName: affiliate.name,
        affiliateId: affiliate.id,
        referralCode: (
          await tx
            .select({ code: affiliatesTable.referralCode })
            .from(affiliatesTable)
            .where(eq(affiliatesTable.id, affiliate.id))
            .limit(1)
        )[0]?.code,
        commissionKES,
        commissionPercent,
        tierName,
      };
    });
    if ("notFound" in result) {
      res.status(404).json({ error: "Refill not found." });
      return;
    }
    if ("conflict" in result) {
      res.status(409).json({ error: result.conflict });
      return;
    }
    res.json(
      ReviewRefillResponse.parse({
        ...result.updated,
        affiliateName: result.affiliateName,
        referralCode: result.referralCode,
        litres: Number(result.updated.litres),
        commissionKES: result.commissionKES,
        commissionPercent: result.commissionPercent,
        tierName: result.tierName,
        notes: result.updated.notes ?? null,
      }),
    );
  },
);

router.get(
  "/admin/tiers",
  ...adminAuth,
  async (_req, res): Promise<void> => {
    const tiers = await db
      .select()
      .from(tiersTable)
      .orderBy(asc(tiersTable.sortOrder));
    res.json(
      ListTiersResponse.parse(
        tiers.map(({ commissionBps, ...tier }) => ({
          ...tier,
          commissionPercent: commissionBps / 100,
        })),
      ),
    );
  },
);

router.patch(
  "/admin/tiers/:id",
  ...adminAuth,
  csrfGuard,
  async (req, res): Promise<void> => {
    const params = UpdateTierParams.safeParse(req.params);
    const body = UpdateTierBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success
          ? params.error?.message ?? "Invalid tier identifier."
          : !body.success
            ? body.error.message
            : "Invalid tier update.",
      });
      return;
    }
    const [before] = await db
      .select()
      .from(tiersTable)
      .where(eq(tiersTable.id, params.data.id))
      .limit(1);
    if (!before) {
      res.status(404).json({ error: "Tier not found." });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(tiersTable)
        .set({
          thresholdMetric: body.data.thresholdMetric,
          thresholdValue: body.data.thresholdValue,
          commissionBps: Math.round(body.data.commissionPercent * 100),
          period: body.data.period,
          active: body.data.active,
        })
        .where(eq(tiersTable.id, params.data.id))
        .returning();
      await writeAudit(
        req.auth!.userId,
        "tier.updated",
        "tier",
        row.id,
        {
          thresholdMetric: before.thresholdMetric,
          thresholdValue: before.thresholdValue,
          commissionBps: before.commissionBps,
          period: before.period,
          active: before.active,
        },
        {
          thresholdMetric: row.thresholdMetric,
          thresholdValue: row.thresholdValue,
          commissionBps: row.commissionBps,
          period: row.period,
          active: row.active,
        },
        tx,
      );
      return [row];
    });
    res.json(
      UpdateTierResponse.parse({
        ...updated,
        commissionPercent: updated.commissionBps / 100,
      }),
    );
  },
);

router.get(
  "/admin/payouts",
  ...adminAuth,
  async (req, res): Promise<void> => {
    const query = ListAllPayoutsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const status = validFilter(query.data.status, [
      "pending",
      "approved",
      "rejected",
      "paid",
    ] as const);
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
      .where(status && status !== "all" ? eq(payoutsTable.status, status) : undefined)
      .orderBy(desc(payoutsTable.createdAt))
      .limit(1000);
    res.json(ListAllPayoutsResponse.parse(rows));
  },
);

router.patch(
  "/admin/payouts/:id",
  ...adminAuth,
  csrfGuard,
  async (req, res): Promise<void> => {
    const params = ReviewPayoutParams.safeParse(req.params);
    const body = ReviewPayoutBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success
          ? params.error?.message ?? "Invalid payout identifier."
          : !body.success
            ? body.error.message
            : "Invalid payout review.",
      });
      return;
    }
    if (
      body.data.status === "paid" &&
      !(body.data.transactionReference ?? "").trim()
    ) {
      res.status(400).json({
        error: "Enter the M-Pesa transaction reference before marking as paid.",
      });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(payoutsTable)
        .where(eq(payoutsTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!before) return { notFound: true as const };
      if (before.status === "paid" || before.status === "rejected") {
        return { conflict: "This payout has already been closed." };
      }
      const [updated] = await tx
        .update(payoutsTable)
        .set({
          status: body.data.status,
          transactionReference: body.data.transactionReference?.trim() || null,
          rejectionReason: body.data.rejectionReason?.trim() || null,
          reviewedBy: req.auth!.userId,
          reviewedAt: new Date(),
          paidAt: body.data.status === "paid" ? new Date() : null,
        })
        .where(eq(payoutsTable.id, before.id))
        .returning();
      const allocations = await tx
        .select({ commissionId: payoutCommissionsTable.commissionId })
        .from(payoutCommissionsTable)
        .where(eq(payoutCommissionsTable.payoutId, before.id));
      if (body.data.status === "paid") {
        await tx
          .update(commissionsTable)
          .set({ status: "paid" })
          .where(
            inArray(
              commissionsTable.id,
              allocations.map((allocation) => allocation.commissionId),
            ),
          );
      } else if (body.data.status === "rejected") {
        await tx
          .update(commissionsTable)
          .set({ status: "available" })
          .where(
            and(
              inArray(
                commissionsTable.id,
                allocations.map((allocation) => allocation.commissionId),
              ),
              eq(commissionsTable.status, "reserved"),
            ),
          );
      }
      await writeAudit(
        req.auth!.userId,
        `payout.${body.data.status}`,
        "payout",
        before.id,
        { status: before.status, amountKES: before.amountKES },
        {
          status: updated.status,
          transactionReference: updated.transactionReference,
          rejectionReason: updated.rejectionReason,
        },
        tx,
      );
      const [affiliate] = await tx
        .select({ name: usersTable.name, affiliateId: affiliatesTable.id })
        .from(affiliatesTable)
        .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
        .where(eq(affiliatesTable.id, before.affiliateId))
        .limit(1);
      if (body.data.status === "paid") {
        await queueNotification(
          before.affiliateId,
          "payout_paid",
          "Your payout was processed",
          `A payout of KES ${before.amountKES.toLocaleString()} has been marked paid. Reference: ${body.data.transactionReference}.`,
          tx,
        );
      }
      return {
        payout: updated,
        affiliateName: affiliate?.name ?? "Affiliate",
      };
    });
    if ("notFound" in result) {
      res.status(404).json({ error: "Payout not found." });
      return;
    }
    if ("conflict" in result) {
      res.status(409).json({ error: result.conflict });
      return;
    }
    res.json(
      ReviewPayoutResponse.parse({
        ...result.payout,
        affiliateName: result.affiliateName,
      }),
    );
  },
);

router.get(
  "/admin/settings",
  ...adminAuth,
  async (_req, res): Promise<void> => {
    const settings = await getSettings();
    res.json(
      GetAdminSettingsResponse.parse({
        ...settings,
        referralBaseUrl:
          settings.referralBaseUrl || process.env.PORTAL_PUBLIC_URL || "",
      }),
    );
  },
);

router.put(
  "/admin/settings",
  ...adminAuth,
  csrfGuard,
  async (req, res): Promise<void> => {
    const body = UpdateAdminSettingsBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    let referralUrl: URL;
    try {
      referralUrl = new URL(body.data.referralBaseUrl);
    } catch {
      res.status(400).json({ error: "Enter a valid referral portal URL." });
      return;
    }
    if (
      process.env.NODE_ENV === "production" &&
      referralUrl.protocol !== "https:"
    ) {
      res.status(400).json({ error: "The portal URL must use HTTPS." });
      return;
    }
    const whatsappConfigured = Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID,
    );
    if (body.data.whatsappProvider === "meta_cloud" && !whatsappConfigured) {
      res.status(400).json({
        error:
          "Meta WhatsApp is not connected. Use wa.me links or configure the provider credentials first.",
      });
      return;
    }
    const mpesaConfigured = Boolean(
      process.env.MPESA_CONSUMER_KEY &&
        process.env.MPESA_CONSUMER_SECRET &&
        process.env.MPESA_SHORTCODE &&
        process.env.MPESA_INITIATOR_NAME &&
        process.env.MPESA_SECURITY_CREDENTIAL &&
        process.env.MPESA_RESULT_URL &&
        process.env.MPESA_TIMEOUT_URL,
    );
    if (body.data.mpesaMode === "daraja" && !mpesaConfigured) {
      res.status(400).json({
        error:
          "Daraja payout credentials and callback URLs are not configured. Manual M-Pesa marking remains available.",
      });
      return;
    }
    const [before] = await db.select().from(portalSettingsTable).limit(1);
    const [updated] = await db
      .insert(portalSettingsTable)
      .values({
        id: 1,
        minimumPayoutKES: body.data.minimumPayoutKES,
        referralBaseUrl: referralUrl.origin,
        whatsappProvider: body.data.whatsappProvider,
        whatsappEnabled: body.data.whatsappEnabled,
        mpesaMode: body.data.mpesaMode,
      })
      .onConflictDoUpdate({
        target: portalSettingsTable.id,
        set: {
          minimumPayoutKES: body.data.minimumPayoutKES,
          referralBaseUrl: referralUrl.origin,
          whatsappProvider: body.data.whatsappProvider,
          whatsappEnabled: body.data.whatsappEnabled,
          mpesaMode: body.data.mpesaMode,
          updatedAt: new Date(),
        },
      })
      .returning();
    await writeAudit(
      req.auth!.userId,
      "settings.updated",
      "portal_settings",
      "1",
      before ?? null,
      {
        minimumPayoutKES: updated.minimumPayoutKES,
        referralBaseUrl: updated.referralBaseUrl,
        whatsappProvider: updated.whatsappProvider,
        whatsappEnabled: updated.whatsappEnabled,
        mpesaMode: updated.mpesaMode,
      },
    );
    res.json(UpdateAdminSettingsResponse.parse(updated));
  },
);

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

router.get(
  "/admin/reports.csv",
  ...adminAuth,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select({
        refillId: refillsTable.id,
        date: refillsTable.refillDate,
        affiliate: usersTable.name,
        referralCode: affiliatesTable.referralCode,
        customer: refillsTable.customerName,
        litres: refillsTable.litres,
        refillKES: refillsTable.amountKES,
        refillStatus: refillsTable.status,
        commissionKES: commissionsTable.amountKES,
        commissionPercent: commissionsTable.commissionBps,
        tier: commissionsTable.tierName,
      })
      .from(refillsTable)
      .innerJoin(affiliatesTable, eq(refillsTable.affiliateId, affiliatesTable.id))
      .innerJoin(usersTable, eq(affiliatesTable.userId, usersTable.id))
      .leftJoin(commissionsTable, eq(commissionsTable.refillId, refillsTable.id))
      .orderBy(desc(refillsTable.refillDate))
      .limit(10000);
    const header = [
      "Refill ID",
      "Date",
      "Affiliate",
      "Referral code",
      "Customer",
      "Litres",
      "Refill KES",
      "Status",
      "Commission KES",
      "Commission rate %",
      "Tier",
    ];
    const lines = [
      header.map(csvCell).join(","),
      ...rows.map((row) =>
        [
          row.refillId,
          row.date,
          row.affiliate,
          row.referralCode,
          row.customer,
          Number(row.litres).toFixed(2),
          row.refillKES,
          row.refillStatus,
          row.commissionKES ?? 0,
          commissionPercent(row.commissionPercent),
          row.tier ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    res
      .status(200)
      .type("text/csv")
      .set("Content-Disposition", 'attachment; filename="uptown-refills.csv"')
      .send(`${lines.join("\r\n")}\r\n`);
  },
);

export default router;
