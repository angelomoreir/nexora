import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { monthlyRevenueCents } from "../src/modules/public/platform-metrics.service.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `metrics-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email } });
  await app.close();
  await prisma.$disconnect();
});

test("monthlyRevenueCents spreads annual plans over 12 months", () => {
  assert.equal(monthlyRevenueCents({ priceMonthly: 4900, priceAnnual: 49000 }, "MONTHLY"), 4900);
  assert.equal(monthlyRevenueCents({ priceMonthly: 4900, priceAnnual: 49000 }, "ANNUAL"), 4083);
  assert.equal(monthlyRevenueCents({ priceMonthly: 0, priceAnnual: 0 }, "ANNUAL"), 0);
});

test("platform metrics: super admin only, reports paying organizations and MRR", async () => {
  const reg = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Metrics Owner", email, password: "MetricsPass123", organizationName: "Metrics Org" } });
  assert.equal(reg.statusCode, 201, reg.body);
  const orgId = reg.json().organizations[0].id as string;
  organizationIds.push(orgId);
  const cookie = cookies(reg);

  const anonymous = await app.inject({ method: "GET", url: "/api/v1/platform/metrics" });
  assert.equal(anonymous.statusCode, 401);
  const orgAdmin = await app.inject({ method: "GET", url: "/api/v1/platform/metrics", headers: { cookie } });
  assert.equal(orgAdmin.statusCode, 403, "organization admins must not see platform metrics");

  await prisma.user.update({ where: { email }, data: { isSuperAdmin: true } });
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: "professional" } });
  await prisma.organizationSubscription.upsert({
    where: { tenantId: orgId },
    create: { tenantId: orgId, planId: plan.id, status: "ACTIVE", billingCycle: "ANNUAL" },
    update: { planId: plan.id, status: "ACTIVE", billingCycle: "ANNUAL" }
  });

  const response = await app.inject({ method: "GET", url: "/api/v1/platform/metrics", headers: { cookie } });
  assert.equal(response.statusCode, 200, response.body);
  const metrics = response.json();
  assert.ok(metrics.organizations.total >= 1);
  assert.ok(metrics.organizations.new30d >= 1);
  assert.ok(metrics.subscriptions.paying >= 1);
  assert.equal(metrics.arrCents, metrics.mrrCents * 12);
  const professional = metrics.plans.find((row: { code: string }) => row.code === "professional");
  assert.ok(professional, "professional plan missing from breakdown");
  assert.ok(professional.paying >= 1);
  assert.ok(professional.mrrCents >= Math.round(plan.priceAnnual / 12));
  assert.equal(metrics.signupsByMonth.length, 6);
  assert.ok(metrics.signupsByMonth.at(-1).organizations >= 1, "current month must include the new organization");
  assert.ok(metrics.conversionRate > 0 && metrics.conversionRate <= 1);
});
