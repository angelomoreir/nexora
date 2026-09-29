import type {
  CreateWebhookResponse,
  UpdateWebhookInput,
  WebhookDeliveriesResponse,
  WebhookDeliveryDto,
  WebhookDto,
  WebhooksResponse
} from "@nexora/contracts";
import type { Webhook, WebhookDelivery } from "@prisma/client";
import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

// --- SSRF protection ---
// Webhook URLs are user-controlled; the server must never dial loopback,
// private or link-local addresses (cloud metadata, internal services).

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  const version = isIP(normalized);
  if (version === 4) {
    const [a = 0, b = 0] = normalized.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (version === 6) {
    const lower = normalized.toLowerCase();
    return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
  }
  return true;
}

function invalidWebhookUrl(): AppError {
  return new AppError(400, "INVALID_WEBHOOK_URL", "The webhook URL must be a public http(s) address.");
}

// Syntax/scheme checks always run. Private-IP and DNS checks only run outside
// development, where pointing webhooks at local servers is legitimate.
async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw invalidWebhookUrl();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw invalidWebhookUrl();
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) throw invalidWebhookUrl();
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return;

  if (hostname.endsWith(".internal") || hostname.endsWith(".local") || hostname.endsWith(".localhost") || hostname === "localhost") {
    throw invalidWebhookUrl();
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) throw invalidWebhookUrl();

  const addresses = await lookup(hostname, { all: true }).catch(() => {
    throw invalidWebhookUrl();
  });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) throw invalidWebhookUrl();
}

interface ActorContext {
  organizationId: string;
  userId: string;
  membershipId: string;
  isSuperAdmin: boolean;
}

export async function getActor(organizationId: string, userId: string, isSuperAdmin: boolean): Promise<ActorContext> {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return { organizationId, userId, membershipId: membership.id, isSuperAdmin };
}

function parseEvents(eventsJson: string): string[] {
  try {
    const parsed = JSON.parse(eventsJson) as string[];
    return Array.isArray(parsed) ? parsed.filter((event) => typeof event === "string") : [];
  } catch {
    return [];
  }
}

function toDto(webhook: Webhook): WebhookDto {
  return {
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    events: parseEvents(webhook.eventsJson),
    status: webhook.status as WebhookDto["status"],
    createdAt: webhook.createdAt.toISOString(),
    updatedAt: webhook.updatedAt.toISOString()
  };
}

function toDeliveryDto(delivery: WebhookDelivery): WebhookDeliveryDto {
  return {
    id: delivery.id,
    webhookId: delivery.webhookId,
    event: delivery.event,
    status: delivery.status as WebhookDeliveryDto["status"],
    responseCode: delivery.responseCode,
    error: delivery.error,
    attemptedAt: delivery.attemptedAt.toISOString()
  };
}

async function audit(actor: ActorContext, action: string, webhookId: string, context?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { tenantId: actor.organizationId, actorId: actor.membershipId, action, resourceType: "Webhook", resourceId: webhookId, contextJson: context ? JSON.stringify(context) : undefined }
  });
}

export async function createWebhook(actor: ActorContext, input: { name: string; url: string; events: string[] }): Promise<CreateWebhookResponse> {
  await assertSafeWebhookUrl(input.url);
  const secret = `whsec_${randomBytes(16).toString("hex")}`;
  const webhook = await prisma.webhook.create({
    data: {
      tenantId: actor.organizationId,
      name: input.name,
      url: input.url,
      secret,
      eventsJson: JSON.stringify([...new Set(input.events)]),
      createdByMembershipId: actor.membershipId
    }
  });
  await audit(actor, "webhook.created", webhook.id, { name: webhook.name, url: webhook.url });
  // The secret is only returned here — it is never exposed through WebhookDto.
  return { webhook: toDto(webhook), secret };
}

export async function listWebhooks(actor: ActorContext): Promise<WebhooksResponse> {
  const webhooks = await prisma.webhook.findMany({ where: { tenantId: actor.organizationId }, orderBy: { createdAt: "desc" } });
  return { webhooks: webhooks.map(toDto) };
}

async function requireWebhook(actor: ActorContext, webhookId: string): Promise<Webhook> {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, tenantId: actor.organizationId } });
  if (!webhook) throw new AppError(404, "WEBHOOK_NOT_FOUND", "The webhook was not found.");
  return webhook;
}

export async function getWebhook(actor: ActorContext, webhookId: string): Promise<WebhookDto> {
  return toDto(await requireWebhook(actor, webhookId));
}

export async function updateWebhook(actor: ActorContext, webhookId: string, input: UpdateWebhookInput): Promise<WebhookDto> {
  const webhook = await requireWebhook(actor, webhookId);
  if (input.url) await assertSafeWebhookUrl(input.url);
  const updated = await prisma.webhook.update({
    where: { id: webhook.id },
    data: {
      name: input.name,
      url: input.url,
      eventsJson: input.events ? JSON.stringify([...new Set(input.events)]) : undefined,
      status: input.status
    }
  });
  await audit(actor, "webhook.updated", webhook.id, { name: updated.name, status: updated.status });
  return toDto(updated);
}

export async function deleteWebhook(actor: ActorContext, webhookId: string): Promise<void> {
  const webhook = await requireWebhook(actor, webhookId);
  await prisma.webhook.delete({ where: { id: webhook.id } });
  await audit(actor, "webhook.deleted", webhook.id, { name: webhook.name });
}

export async function listDeliveries(actor: ActorContext, webhookId: string): Promise<WebhookDeliveriesResponse> {
  const webhook = await requireWebhook(actor, webhookId);
  const deliveries = await prisma.webhookDelivery.findMany({
    where: { tenantId: actor.organizationId, webhookId: webhook.id },
    orderBy: { attemptedAt: "desc" },
    take: 100
  });
  return { deliveries: deliveries.map(toDeliveryDto) };
}

// POSTs the signed payload to the webhook URL and records the outcome on the delivery.
async function deliver(webhook: Webhook, delivery: WebhookDelivery, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ event: delivery.event, timestamp: new Date().toISOString(), data: payload });
  const signature = createHmac("sha256", webhook.secret).update(body).digest("hex");
  try {
    // Re-validate at delivery time: DNS or the URL target may have changed since the webhook was saved.
    await assertSafeWebhookUrl(webhook.url);
    const response = await globalThis.fetch(webhook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Nexora-Event": delivery.event,
        "X-Nexora-Signature": `sha256=${signature}`
      },
      body,
      signal: AbortSignal.timeout(10_000)
    });
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: response.ok ? "SUCCESS" : "FAILED",
        responseCode: response.status,
        error: response.ok ? null : `HTTP ${response.status}`
      }
    });
  } catch (error) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed" }
    }).catch(() => undefined);
  }
}

// Fans an org-level event out to every ACTIVE webhook subscribed to it (or "*").
// Delivery rows are created synchronously; the HTTP calls are fire-and-forget.
export async function dispatchWebhooks(tenantId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const webhooks = await prisma.webhook.findMany({ where: { tenantId, status: "ACTIVE" } });
  for (const webhook of webhooks) {
    const events = parseEvents(webhook.eventsJson);
    if (!events.includes(event) && !events.includes("*")) continue;
    const delivery = await prisma.webhookDelivery.create({
      data: { tenantId, webhookId: webhook.id, event, payloadJson: JSON.stringify(payload), status: "PENDING" }
    });
    void deliver(webhook, delivery, payload).catch((error) => console.error("webhook delivery failed", error));
  }
}

export async function testWebhook(actor: ActorContext, webhookId: string): Promise<WebhookDeliveryDto> {
  const webhook = await requireWebhook(actor, webhookId);
  const payload = { webhookId: webhook.id, message: "Test delivery from Nexora" };
  const delivery = await prisma.webhookDelivery.create({
    data: { tenantId: actor.organizationId, webhookId: webhook.id, event: "webhook.test", payloadJson: JSON.stringify(payload), status: "PENDING" }
  });
  await deliver(webhook, delivery, payload);
  const updated = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  await audit(actor, "webhook.tested", webhook.id);
  return toDeliveryDto(updated);
}
