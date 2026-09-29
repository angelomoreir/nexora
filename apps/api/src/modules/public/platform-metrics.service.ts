import type { PlatformMetricsDto } from "@nexora/contracts";
import { prisma } from "../../lib/prisma.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SIGNUP_MONTHS = 6;

// Monthly recurring revenue contributed by one subscription, in cents (annual plans are spread over 12 months).
export function monthlyRevenueCents(plan: { priceMonthly: number; priceAnnual: number }, billingCycle: string) {
  return billingCycle === "ANNUAL" ? Math.round(plan.priceAnnual / 12) : plan.priceMonthly;
}

export async function getPlatformMetrics(now = new Date()): Promise<PlatformMetricsDto> {
  const last30 = new Date(now.getTime() - 30 * DAY_MS);
  const prev30 = new Date(now.getTime() - 60 * DAY_MS);
  const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (SIGNUP_MONTHS - 1), 1));

  const [orgTotal, orgActive, orgNew30, orgNewPrev30, userTotal, userNew30, subscriptions, plans, docTenants, taskTenants, recentOrgs, canceled30] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: "ACTIVE" } }),
    prisma.organization.count({ where: { createdAt: { gte: last30 } } }),
    prisma.organization.count({ where: { createdAt: { gte: prev30, lt: last30 } } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: last30 } } }),
    prisma.organizationSubscription.findMany({ select: { status: true, billingCycle: true, planId: true } }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, code: true, name: true, priceMonthly: true, priceAnnual: true, currency: true } }),
    prisma.document.groupBy({ by: ["tenantId"] }),
    prisma.task.groupBy({ by: ["tenantId"] }),
    prisma.organization.findMany({ where: { createdAt: { gte: firstMonth } }, select: { createdAt: true } }),
    prisma.organizationSubscription.count({ where: { canceledAt: { gte: last30 } } })
  ]);

  const planStats = new Map(plans.map((plan) => [plan.id, { code: plan.code, name: plan.name, organizations: 0, paying: 0, mrrCents: 0 }]));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  let mrrCents = 0;
  let paying = 0;
  let trialing = 0;
  let pastDue = 0;
  for (const subscription of subscriptions) {
    const plan = planById.get(subscription.planId);
    const stats = planStats.get(subscription.planId);
    if (!plan || !stats) continue;
    if (subscription.status === "TRIALING") trialing += 1;
    if (subscription.status === "PAST_DUE") pastDue += 1;
    if (subscription.status === "CANCELED") continue;
    stats.organizations += 1;
    const revenue = monthlyRevenueCents(plan, subscription.billingCycle);
    if (subscription.status === "ACTIVE" && revenue > 0) {
      paying += 1;
      stats.paying += 1;
      stats.mrrCents += revenue;
      mrrCents += revenue;
    }
  }

  const activated = new Set([...docTenants, ...taskTenants].map((row) => row.tenantId)).size;

  const signups = new Map<string, number>();
  for (let i = 0; i < SIGNUP_MONTHS; i += 1) {
    const month = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + i, 1));
    signups.set(month.toISOString().slice(0, 7), 0);
  }
  for (const org of recentOrgs) {
    const key = org.createdAt.toISOString().slice(0, 7);
    if (signups.has(key)) signups.set(key, signups.get(key)! + 1);
  }

  const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : 0);

  return {
    generatedAt: now.toISOString(),
    currency: plans[0]?.currency ?? "EUR",
    mrrCents,
    arrCents: mrrCents * 12,
    arpaCents: paying > 0 ? Math.round(mrrCents / paying) : 0,
    conversionRate: ratio(paying, orgTotal),
    activationRate: ratio(activated, orgTotal),
    organizations: { total: orgTotal, active: orgActive, activated, new30d: orgNew30, newPrev30d: orgNewPrev30 },
    users: { total: userTotal, new30d: userNew30 },
    subscriptions: { paying, trialing, pastDue, canceled30d: canceled30 },
    plans: [...planStats.values()],
    signupsByMonth: [...signups.entries()].map(([month, organizations]) => ({ month, organizations }))
  };
}
