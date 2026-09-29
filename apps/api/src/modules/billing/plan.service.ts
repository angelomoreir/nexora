import type { ChangePlanResponse, PlanDto, PlanLimits, SubscriptionDto, UsageStats } from "@nexora/contracts";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { StripeBillingProvider, stripePriceIdFor } from "./stripe-provider.js";

// --- Billing Provider Abstraction ---
// Allows swapping Stripe for another provider without changing the service layer.
export interface CheckoutSessionInput {
  customerId?: string;
  email?: string;
  tenantId: string;
  planCode: string;
  billingCycle: "MONTHLY" | "ANNUAL";
  successUrl: string;
  cancelUrl: string;
}

export interface BillingProvider {
  readonly name: string;
  createCustomer(email: string, name: string): Promise<{ customerId: string }>;
  createSubscription(customerId: string, priceId: string): Promise<{ subscriptionId: string; status: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  getSubscription(subscriptionId: string): Promise<{ status: string; currentPeriodEnd: Date | null }>;
  constructWebhookEvent(payload: Buffer, signature: string): Promise<{ type: string; data: unknown }>;
  createCheckoutSession?(input: CheckoutSessionInput): Promise<{ checkoutUrl: string }>;
  createPortalSession?(customerId: string, returnUrl: string): Promise<{ portalUrl: string }>;
}

// No-op billing provider — used when no external billing is configured.
// Organizations get the Free plan automatically.
class NoOpBillingProvider implements BillingProvider {
  readonly name = "none";
  async createCustomer() { return { customerId: "local" }; }
  async createSubscription() { return { subscriptionId: "local", status: "ACTIVE" }; }
  async cancelSubscription() { /* no-op */ }
  async getSubscription() { return { status: "ACTIVE", currentPeriodEnd: null }; }
  async constructWebhookEvent() { return { type: "unknown", data: {} }; }
}

function createBillingProvider(): BillingProvider {
  if (env.STRIPE_SECRET_KEY) {
    return new StripeBillingProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);
  }
  return new NoOpBillingProvider();
}

let activeBillingProvider: BillingProvider = createBillingProvider();

export function setBillingProvider(provider: BillingProvider) {
  activeBillingProvider = provider;
}

export function getBillingProvider(): BillingProvider {
  return activeBillingProvider;
}

// --- Plan helpers ---

function parseLimits(limitsJson: string): PlanLimits {
  try {
    const parsed = JSON.parse(limitsJson) as Partial<PlanLimits>;
    return {
      maxUsers: parsed.maxUsers ?? -1,
      maxStorageBytes: parsed.maxStorageBytes ?? -1,
      maxDocuments: parsed.maxDocuments ?? -1,
      maxOrganizations: parsed.maxOrganizations ?? -1,
      maxWorkflows: parsed.maxWorkflows ?? -1,
      aiRequestsPerMonth: parsed.aiRequestsPerMonth ?? -1
    };
  } catch {
    return { maxUsers: -1, maxStorageBytes: -1, maxDocuments: -1, maxOrganizations: -1, maxWorkflows: -1, aiRequestsPerMonth: -1 };
  }
}

function parseFeatures(featuresJson: string): string[] {
  try {
    return JSON.parse(featuresJson) as string[];
  } catch {
    return [];
  }
}

function toPlanDto(plan: { id: string; code: string; name: string; description: string | null; priceMonthly: number; priceAnnual: number; currency: string; isActive: boolean; sortOrder: number; featuresJson: string; limitsJson: string }): PlanDto {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceMonthly: plan.priceMonthly,
    priceAnnual: plan.priceAnnual,
    currency: plan.currency,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    features: parseFeatures(plan.featuresJson),
    limits: parseLimits(plan.limitsJson)
  };
}

function toSubscriptionDto(sub: { id: string; status: string; billingCycle: string; trialEndsAt: Date | null; currentPeriodStart: Date | null; currentPeriodEnd: Date | null; canceledAt: Date | null; stripeCustomerId?: string | null; plan: { id: string; code: string; name: string; description: string | null; priceMonthly: number; priceAnnual: number; currency: string; isActive: boolean; sortOrder: number; featuresJson: string; limitsJson: string } }): SubscriptionDto {
  return {
    id: sub.id,
    plan: toPlanDto(sub.plan),
    status: sub.status,
    billingCycle: sub.billingCycle,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    canceledAt: sub.canceledAt?.toISOString() ?? null,
    billingManaged: Boolean(sub.stripeCustomerId)
  };
}

// --- Plan queries ---

export async function listPlans(): Promise<PlanDto[]> {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" }
  });
  return plans.map(toPlanDto);
}

export async function getPlanByCode(code: string): Promise<PlanDto | null> {
  const plan = await prisma.plan.findUnique({ where: { code } });
  return plan ? toPlanDto(plan) : null;
}

// --- Subscription management ---

export async function getSubscription(tenantId: string): Promise<SubscriptionDto | null> {
  const sub = await prisma.organizationSubscription.findUnique({
    where: { tenantId },
    include: { plan: true }
  });
  return sub ? toSubscriptionDto(sub) : null;
}

export async function assignFreePlan(tenantId: string): Promise<void> {
  const existing = await prisma.organizationSubscription.findUnique({ where: { tenantId } });
  if (existing) return;
  const freePlan = await prisma.plan.findUnique({ where: { code: "free" } });
  if (!freePlan) return;
  await prisma.organizationSubscription.create({
    data: { tenantId, planId: freePlan.id, status: "ACTIVE", billingCycle: "MONTHLY" }
  });
}

export async function changePlan(tenantId: string, planCode: string, billingCycle: "MONTHLY" | "ANNUAL", actorUserId?: string): Promise<ChangePlanResponse> {
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) throw new AppError(404, "PLAN_NOT_FOUND", "Plan not found.");
  if (!plan.isActive) throw new AppError(400, "PLAN_INACTIVE", "This plan is not available.");

  const provider = getBillingProvider();
  const existing = await prisma.organizationSubscription.findUnique({ where: { tenantId } });

  // Paid plan with a real billing provider → hosted checkout; the webhook activates the subscription.
  if (plan.priceMonthly > 0 && provider.name !== "none" && provider.createCheckoutSession) {
    let customerId = existing?.stripeCustomerId ?? undefined;
    let email: string | undefined;
    if (!customerId && actorUserId) {
      const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { email: true } });
      email = actor?.email;
    }
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
    if (!customerId) {
      customerId = (await provider.createCustomer(email ?? `${tenantId}@billing.local`, organization.name)).customerId;
      if (existing) {
        await prisma.organizationSubscription.update({ where: { tenantId }, data: { stripeCustomerId: customerId } });
      }
    }
    const session = await provider.createCheckoutSession({
      customerId,
      email,
      tenantId,
      planCode,
      billingCycle,
      successUrl: `${env.APP_URL}/billing?checkout=success`,
      cancelUrl: `${env.APP_URL}/billing?checkout=cancelled`
    });
    return { checkoutUrl: session.checkoutUrl };
  }

  if (existing) {
    const updated = await prisma.organizationSubscription.update({
      where: { tenantId },
      data: { planId: plan.id, billingCycle, status: "ACTIVE" },
      include: { plan: true }
    });
    return toSubscriptionDto(updated);
  }

  const created = await prisma.organizationSubscription.create({
    data: { tenantId, planId: plan.id, billingCycle, status: "ACTIVE" },
    include: { plan: true }
  });
  return toSubscriptionDto(created);
}

export async function createBillingPortalSession(tenantId: string): Promise<{ portalUrl: string }> {
  const provider = getBillingProvider();
  if (!provider.createPortalSession) {
    throw new AppError(400, "BILLING_PORTAL_UNAVAILABLE", "The billing portal is not available.");
  }
  const sub = await prisma.organizationSubscription.findUnique({ where: { tenantId } });
  if (!sub?.stripeCustomerId) {
    throw new AppError(400, "NO_BILLING_ACCOUNT", "This organization has no billing account.");
  }
  return provider.createPortalSession(sub.stripeCustomerId, `${env.APP_URL}/billing`);
}

// --- Stripe webhook processing ---

interface StripeSubscriptionObject {
  id: string;
  customer?: string | { id: string };
  status: string;
  metadata?: Record<string, string>;
  items?: { data: Array<{ current_period_end?: number; price?: { id: string } }> };
  current_period_end?: number;
}

function mapStripeStatus(status: string): string {
  switch (status) {
    case "active": return "ACTIVE";
    case "trialing": return "TRIALING";
    case "past_due": return "PAST_DUE";
    case "canceled":
    case "unpaid":
    case "incomplete_expired": return "CANCELED";
    default: return status.toUpperCase();
  }
}

export async function handleBillingWebhook(payload: Buffer, signature: string): Promise<void> {
  const provider = getBillingProvider();
  const event = await provider.constructWebhookEvent(payload, signature);

  if (event.type === "checkout.session.completed") {
    const session = event.data as {
      id: string;
      customer?: string;
      subscription?: string;
      metadata?: Record<string, string>;
    };
    const tenantId = session.metadata?.tenantId;
    const planCode = session.metadata?.planCode;
    const billingCycle = session.metadata?.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY";
    if (!tenantId || !planCode || !session.subscription) return;

    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) return;

    const stripeSub = await provider.getSubscription(session.subscription);
    await prisma.organizationSubscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: plan.id,
        status: mapStripeStatus(stripeSub.status),
        billingCycle,
        stripeCustomerId: session.customer ?? null,
        stripeSubscriptionId: session.subscription,
        stripePriceId: stripePriceIdFor(planCode, billingCycle),
        currentPeriodEnd: stripeSub.currentPeriodEnd
      },
      update: {
        planId: plan.id,
        status: mapStripeStatus(stripeSub.status),
        billingCycle,
        stripeCustomerId: session.customer ?? null,
        stripeSubscriptionId: session.subscription,
        stripePriceId: stripePriceIdFor(planCode, billingCycle),
        currentPeriodEnd: stripeSub.currentPeriodEnd,
        canceledAt: null
      }
    });
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: "billing.subscription.activated",
        resourceType: "OrganizationSubscription",
        resourceId: session.subscription,
        result: "SUCCESS"
      }
    });
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data as StripeSubscriptionObject;
    const existing = await prisma.organizationSubscription.findFirst({
      where: { stripeSubscriptionId: subscription.id }
    });
    if (!existing) return;

    const periodEndSeconds = subscription.current_period_end ?? subscription.items?.data[0]?.current_period_end;
    const status = mapStripeStatus(subscription.status);

    if (status === "CANCELED") {
      const freePlan = await prisma.plan.findUnique({ where: { code: "free" } });
      await prisma.organizationSubscription.update({
        where: { id: existing.id },
        data: {
          status: "CANCELED",
          canceledAt: new Date(),
          ...(freePlan ? { planId: freePlan.id } : {}),
          currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : existing.currentPeriodEnd
        }
      });
    } else {
      const planCode = subscription.metadata?.planCode;
      const plan = planCode ? await prisma.plan.findUnique({ where: { code: planCode } }) : null;
      await prisma.organizationSubscription.update({
        where: { id: existing.id },
        data: {
          status,
          ...(plan ? { planId: plan.id } : {}),
          stripePriceId: subscription.items?.data[0]?.price?.id ?? existing.stripePriceId,
          currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : existing.currentPeriodEnd
        }
      });
    }
    await prisma.auditLog.create({
      data: {
        tenantId: existing.tenantId,
        action: `billing.subscription.${status === "CANCELED" ? "canceled" : "updated"}`,
        resourceType: "OrganizationSubscription",
        resourceId: subscription.id,
        result: "SUCCESS"
      }
    });
  }
}

export async function cancelSubscription(tenantId: string): Promise<void> {
  const sub = await prisma.organizationSubscription.findUnique({ where: { tenantId } });
  if (!sub) return;
  if (sub.stripeSubscriptionId) {
    await activeBillingProvider.cancelSubscription(sub.stripeSubscriptionId);
  }
  await prisma.organizationSubscription.update({
    where: { tenantId },
    data: { status: "CANCELED", canceledAt: new Date() }
  });
}

// --- Usage & limits ---

export async function getUsageStats(tenantId: string): Promise<UsageStats> {
  const sub = await prisma.organizationSubscription.findUnique({
    where: { tenantId },
    include: { plan: true }
  });

  const limits = sub ? parseLimits(sub.plan.limitsJson) : parseLimits('{"maxUsers":-1,"maxStorageBytes":-1,"maxDocuments":-1,"maxOrganizations":-1,"maxWorkflows":-1,"aiRequestsPerMonth":-1}');

  const [users, documents, workflows, storageAgg, aiOps] = await Promise.all([
    prisma.organizationMember.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.document.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.workflowDefinition.count({ where: { tenantId } }),
    prisma.document.aggregate({ where: { tenantId, status: "ACTIVE" }, _sum: { sizeBytes: true } }),
    prisma.aIOperation.count({
      where: {
        tenantId,
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
      }
    })
  ]);

  const storageBytes = storageAgg._sum.sizeBytes ?? 0;
  const exceeded: string[] = [];

  if (limits.maxUsers !== -1 && users > limits.maxUsers) exceeded.push("users");
  if (limits.maxStorageBytes !== -1 && storageBytes > limits.maxStorageBytes) exceeded.push("storage");
  if (limits.maxDocuments !== -1 && documents > limits.maxDocuments) exceeded.push("documents");
  if (limits.maxWorkflows !== -1 && workflows > limits.maxWorkflows) exceeded.push("workflows");
  if (limits.aiRequestsPerMonth !== -1 && aiOps > limits.aiRequestsPerMonth) exceeded.push("ai");

  return { users, storageBytes, documents, workflows, aiRequestsThisMonth: aiOps, limits, exceeded };
}

export async function checkLimit(tenantId: string, resource: "users" | "documents" | "workflows" | "storage" | "ai"): Promise<void> {
  const usage = await getUsageStats(tenantId);
  const limitMap: Record<string, { current: number; max: number; label: string }> = {
    users: { current: usage.users, max: usage.limits.maxUsers, label: "utilizadores" },
    documents: { current: usage.documents, max: usage.limits.maxDocuments, label: "documentos" },
    workflows: { current: usage.workflows, max: usage.limits.maxWorkflows, label: "workflows" },
    ai: { current: usage.aiRequestsThisMonth, max: usage.limits.aiRequestsPerMonth, label: "pedidos de IA" }
  };

  const check = limitMap[resource];
  if (check && check.max !== -1 && check.current >= check.max) {
    throw new AppError(402, "PLAN_LIMIT_EXCEEDED", `Limite de ${check.label} atingido para o seu plano (${check.current}/${check.max}). Faça upgrade para continuar.`);
  }
}

export async function checkStorageLimit(tenantId: string, additionalBytes: number): Promise<void> {
  const usage = await getUsageStats(tenantId);
  if (usage.limits.maxStorageBytes === -1) return;
  if (usage.storageBytes + additionalBytes > usage.limits.maxStorageBytes) {
    throw new AppError(402, "STORAGE_LIMIT_EXCEEDED", `Armazenamento insuficiente no seu plano. Disponível: ${((usage.limits.maxStorageBytes - usage.storageBytes) / 1024 / 1024).toFixed(1)} MB.`);
  }
}
