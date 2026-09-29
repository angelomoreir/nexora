import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `billing-admin-${marker}@example.com`;
const viewerEmail = `billing-viewer-${marker}@example.com`;
const organizationIds: string[] = [];
const userEmails = [adminEmail, viewerEmail];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
  await app.close();
  await prisma.$disconnect();
});

test("Billing: plans, subscription, usage, limits, and tenant isolation", async () => {
  // --- Setup ---
  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Billing Admin", email: adminEmail, password: "BillingPass123", organizationName: "Billing Org" }
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const addViewer = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/users`,
    headers: { cookie: adminCookies },
    payload: { name: "Billing Viewer", email: viewerEmail, password: "BillingPass123", role: "Viewer" }
  });
  assert.equal(addViewer.statusCode, 201);
  const viewerLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: viewerEmail, password: "BillingPass123" }
  });
  assert.equal(viewerLogin.statusCode, 200);
  const viewerCookies = cookies(viewerLogin);

  // --- List plans (public) ---
  const plansResponse = await app.inject({
    method: "GET",
    url: "/api/v1/plans"
  });
  assert.equal(plansResponse.statusCode, 200, plansResponse.body);
  const plans = plansResponse.json();
  assert.ok(plans.length >= 5, "Should have at least 5 plans");
  const planCodes = plans.map((p: { code: string }) => p.code);
  assert.ok(planCodes.includes("free"), "Should include free plan");
  assert.ok(planCodes.includes("basic"), "Should include basic plan");
  assert.ok(planCodes.includes("professional"), "Should include professional plan");
  assert.ok(planCodes.includes("business"), "Should include business plan");
  assert.ok(planCodes.includes("enterprise"), "Should include enterprise plan");

  // Verify plan limits structure
  const freePlan = plans.find((p: { code: string }) => p.code === "free");
  assert.ok(freePlan.limits.maxUsers > 0, "Free plan should have user limit");
  assert.ok(freePlan.limits.maxStorageBytes > 0, "Free plan should have storage limit");
  assert.ok(freePlan.features.length > 0, "Free plan should have features");

  // --- Get subscription (should be Free by default) ---
  const subResponse = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/subscription`,
    headers: { cookie: adminCookies }
  });
  assert.equal(subResponse.statusCode, 200, subResponse.body);
  const subscription = subResponse.json();
  assert.ok(subscription, "Should have a subscription");
  assert.equal(subscription.plan.code, "free", "Should be on free plan by default");
  assert.equal(subscription.status, "ACTIVE");

  // --- Get usage stats ---
  const usageResponse = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/usage`,
    headers: { cookie: adminCookies }
  });
  assert.equal(usageResponse.statusCode, 200, usageResponse.body);
  const usage = usageResponse.json();
  assert.ok(usage.users >= 2, "Should have at least 2 users");
  assert.ok(usage.limits.maxUsers > 0, "Should have user limit from plan");
  assert.ok(Array.isArray(usage.exceeded), "Should have exceeded array");

  // --- Change plan to Basic ---
  const changeResponse = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/subscription`,
    headers: { cookie: adminCookies },
    payload: { planCode: "basic", billingCycle: "MONTHLY" }
  });
  assert.equal(changeResponse.statusCode, 200, changeResponse.body);
  const updatedSub = changeResponse.json();
  assert.equal(updatedSub.plan.code, "basic", "Should be on basic plan now");
  assert.equal(updatedSub.billingCycle, "MONTHLY");

  // Verify usage reflects new plan limits
  const usageAfter = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/usage`,
    headers: { cookie: adminCookies }
  });
  assert.equal(usageAfter.statusCode, 200);
  assert.equal(usageAfter.json().limits.maxUsers, 15, "Should have basic plan user limit (15)");

  // --- Viewer cannot change plan (403) ---
  const viewerChange = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/subscription`,
    headers: { cookie: viewerCookies },
    payload: { planCode: "free", billingCycle: "MONTHLY" }
  });
  assert.equal(viewerChange.statusCode, 403, "Viewer should not change plan");

  // --- Cancel subscription ---
  const cancelResponse = await app.inject({
    method: "DELETE",
    url: `/api/v1/organizations/${organizationId}/subscription`,
    headers: { cookie: adminCookies }
  });
  assert.equal(cancelResponse.statusCode, 204, cancelResponse.body);

  // Verify subscription is canceled
  const canceledSub = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/subscription`,
    headers: { cookie: adminCookies }
  });
  assert.equal(canceledSub.json().status, "CANCELED", "Subscription should be canceled");

  // --- Health checks ---
  const healthResponse = await app.inject({
    method: "GET",
    url: "/api/v1/health"
  });
  assert.equal(healthResponse.statusCode, 200, healthResponse.body);
  const health = healthResponse.json();
  assert.ok(health.checks, "Should have health checks");
  assert.ok(health.checks.length >= 3, "Should have at least 3 checks");
  const checkNames = health.checks.map((c: { name: string }) => c.name);
  assert.ok(checkNames.includes("database"), "Should check database");
  assert.ok(checkNames.includes("storage"), "Should check storage");
  assert.ok(checkNames.includes("memory"), "Should check memory");

  // Liveness probe
  const liveResponse = await app.inject({
    method: "GET",
    url: "/api/v1/health/live"
  });
  assert.equal(liveResponse.statusCode, 200);
  assert.equal(liveResponse.json().status, "ok");

  // Readiness probe
  const readyResponse = await app.inject({
    method: "GET",
    url: "/api/v1/health/ready"
  });
  assert.equal(readyResponse.statusCode, 200);
  assert.ok(readyResponse.json().checks, "Ready should have checks");

  // Metrics
  const metricsResponse = await app.inject({
    method: "GET",
    url: "/api/v1/metrics"
  });
  assert.equal(metricsResponse.statusCode, 200);
  const metricsText = metricsResponse.body;
  assert.ok(metricsText.includes("nexora_uptime_seconds"), "Should have uptime metric");
  assert.ok(metricsText.includes("nexora_heap_used_bytes"), "Should have heap metric");
  assert.ok(metricsText.includes("nexora_database_up"), "Should have database metric");

  // --- Tenant isolation: viewer from org1 cannot access org2's subscription ---
  const secondOrgReg = await app.inject({
    method: "POST",
    url: "/api/v1/organizations",
    headers: { cookie: adminCookies },
    payload: { name: "Billing Second Org" }
  });
  assert.equal(secondOrgReg.statusCode, 201);
  const secondOrgId = secondOrgReg.json().id;
  organizationIds.push(secondOrgId);

  // Admin's viewer tries to access org2's subscription — should be 403
  const crossOrgSub = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${secondOrgId}/subscription`,
    headers: { cookie: viewerCookies }
  });
  assert.equal(crossOrgSub.statusCode, 403, "Viewer should not access other org's subscription");

  // Admin's viewer tries to access org2's usage — should be 403
  const crossOrgUsage = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${secondOrgId}/usage`,
    headers: { cookie: viewerCookies }
  });
  assert.equal(crossOrgUsage.statusCode, 403, "Viewer should not access other org's usage");
});
