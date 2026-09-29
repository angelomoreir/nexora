import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { AppError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { setBillingProvider, type BillingProvider } from "../src/modules/billing/plan.service.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `wh-admin-${marker}@example.com`;
const organizationIds: string[] = [];

// Test provider: verifies a fixed signature, returns canned subscription state.
let lastEvent: { type: string; data: unknown } | null = null;
const testProvider: BillingProvider = {
  name: "stripe",
  async createCustomer() { return { customerId: "cus_test" }; },
  async createSubscription() { return { subscriptionId: "sub_test", status: "ACTIVE" }; },
  async cancelSubscription() { /* no-op */ },
  async getSubscription() { return { status: "ACTIVE", currentPeriodEnd: new Date("2030-01-01") }; },
  async constructWebhookEvent(payload: Buffer, signature: string) {
    if (signature !== "valid-signature") {
      throw new AppError(400, "INVALID_WEBHOOK_SIGNATURE", "The webhook signature is invalid.");
    }
    return { type: lastEvent!.type, data: lastEvent!.data };
  },
  async createCheckoutSession() { return { checkoutUrl: "https://checkout.stripe.com/test" }; }
};

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => app.ready());
after(async () => {
  setBillingProvider({ name: "none", createCustomer: async () => ({ customerId: "" }), createSubscription: async () => ({ subscriptionId: "", status: "" }), cancelSubscription: async () => {}, getSubscription: async () => ({ status: "ACTIVE", currentPeriodEnd: null }), constructWebhookEvent: async () => ({ type: "x", data: {} }) });
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
  await app.close();
  await prisma.$disconnect();
});

test("Billing webhook: checkout completion activates plan, invalid signature rejected", async () => {
  setBillingProvider(testProvider);

  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Webhook Admin", email: adminEmail, password: "WebhookPass123", organizationName: "Webhook Org" }
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  // Paid plan change returns a checkout URL instead of switching directly
  const change = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/subscription`,
    headers: { cookie: adminCookies },
    payload: { planCode: "professional", billingCycle: "MONTHLY" }
  });
  assert.equal(change.statusCode, 200, change.body);
  assert.ok(change.json().checkoutUrl, "Paid plan should return a checkout URL");
  // Plan unchanged until the webhook confirms payment
  const before = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/subscription`, headers: { cookie: adminCookies } });
  assert.equal(before.json().plan.code, "free");

  // Invalid signature → 400
  lastEvent = { type: "checkout.session.completed", data: {} };
  const badSignature = await app.inject({
    method: "POST",
    url: "/api/v1/billing/webhook",
    headers: { "stripe-signature": "bad-signature" },
    payload: {}
  });
  assert.equal(badSignature.statusCode, 400);

  // checkout.session.completed activates the plan
  lastEvent = {
    type: "checkout.session.completed",
    data: {
      id: "cs_test_1",
      customer: "cus_test",
      subscription: "sub_test_1",
      metadata: { tenantId: organizationId, planCode: "professional", billingCycle: "MONTHLY" }
    }
  };
  const webhook = await app.inject({
    method: "POST",
    url: "/api/v1/billing/webhook",
    headers: { "stripe-signature": "valid-signature" },
    payload: {}
  });
  assert.equal(webhook.statusCode, 200, webhook.body);

  const afterActivation = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/subscription`, headers: { cookie: adminCookies } });
  assert.equal(afterActivation.json().plan.code, "professional", "Webhook should activate the paid plan");
  assert.equal(afterActivation.json().status, "ACTIVE");
  assert.equal(afterActivation.json().billingManaged, true);

  // customer.subscription.deleted cancels and falls back to free
  lastEvent = {
    type: "customer.subscription.deleted",
    data: { id: "sub_test_1", status: "canceled", customer: "cus_test" }
  };
  const deleted = await app.inject({
    method: "POST",
    url: "/api/v1/billing/webhook",
    headers: { "stripe-signature": "valid-signature" },
    payload: {}
  });
  assert.equal(deleted.statusCode, 200);

  const afterCancel = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/subscription`, headers: { cookie: adminCookies } });
  assert.equal(afterCancel.json().status, "CANCELED");
  assert.equal(afterCancel.json().plan.code, "free", "Canceled subscription falls back to the free plan");
});
