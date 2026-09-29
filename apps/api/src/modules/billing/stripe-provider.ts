import Stripe from "stripe";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { BillingProvider, CheckoutSessionInput } from "./plan.service.js";

// Stripe-backed billing provider. Activated when STRIPE_SECRET_KEY is configured.
// Price mapping comes from STRIPE_PRICE_MAP: {"professional:MONTHLY":"price_...","professional:ANNUAL":"price_..."}

export function stripePriceIdFor(planCode: string, billingCycle: "MONTHLY" | "ANNUAL"): string | null {
  if (!env.STRIPE_PRICE_MAP) return null;
  try {
    const map = JSON.parse(env.STRIPE_PRICE_MAP) as Record<string, string>;
    return map[`${planCode}:${billingCycle}`] ?? map[`${planCode}:MONTHLY`] ?? null;
  } catch {
    return null;
  }
}

export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";
  private stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string | undefined
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createCustomer(email: string, name: string) {
    const customer = await this.stripe.customers.create({ email, name });
    return { customerId: customer.id };
  }

  async createSubscription(customerId: string, priceId: string) {
    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }]
    });
    return { subscriptionId: subscription.id, status: subscription.status.toUpperCase() };
  }

  async createCheckoutSession(input: CheckoutSessionInput) {
    const priceId = stripePriceIdFor(input.planCode, input.billingCycle);
    if (!priceId) {
      throw new AppError(400, "PLAN_NOT_PURCHASABLE", "This plan is not configured for purchase.");
    }
    const metadata = { tenantId: input.tenantId, planCode: input.planCode, billingCycle: input.billingCycle };
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      customer_email: input.customerId ? undefined : input.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: true,
      metadata,
      subscription_data: { metadata }
    });
    if (!session.url) {
      throw new AppError(502, "BILLING_PROVIDER_ERROR", "The billing provider did not return a checkout URL.");
    }
    return { checkoutUrl: session.url };
  }

  async createPortalSession(customerId: string, returnUrl: string) {
    const session = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { portalUrl: session.url };
  }

  async cancelSubscription(subscriptionId: string) {
    await this.stripe.subscriptions.cancel(subscriptionId);
  }

  async getSubscription(subscriptionId: string) {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    // current_period_end moved to subscription items in newer API versions — read both defensively
    const periodEndSeconds =
      (subscription as unknown as { current_period_end?: number }).current_period_end ??
      subscription.items.data[0]?.current_period_end;
    return {
      status: subscription.status.toUpperCase(),
      currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null
    };
  }

  async constructWebhookEvent(payload: Buffer, signature: string) {
    if (!this.webhookSecret) {
      throw new AppError(503, "WEBHOOK_NOT_CONFIGURED", "Stripe webhook verification is not configured.");
    }
    try {
      const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
      return { type: event.type, data: event.data.object as unknown };
    } catch {
      throw new AppError(400, "INVALID_WEBHOOK_SIGNATURE", "The webhook signature is invalid.");
    }
  }
}
