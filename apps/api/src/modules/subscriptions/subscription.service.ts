import type { ResourceSubscriptionDto, SubscriptionsResponse, SubscriptionTargetType } from "@nexora/contracts";
import type { Subscription } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { notify } from "../notifications/notification.service.js";

interface ActorContext {
  organizationId: string;
  userId: string;
  membershipId: string;
  isSuperAdmin: boolean;
}

export const SUBSCRIPTION_TARGET_TYPES: SubscriptionTargetType[] = ["folder", "document", "list", "task", "project"];
export const SUBSCRIPTION_EVENTS = ["created", "updated", "deleted", "version.added", "item.added", "commented"] as const;

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

function toDto(subscription: Subscription): ResourceSubscriptionDto {
  return {
    id: subscription.id,
    targetType: subscription.targetType as SubscriptionTargetType,
    targetId: subscription.targetId,
    events: parseEvents(subscription.eventsJson),
    createdAt: subscription.createdAt.toISOString()
  };
}

export async function subscribe(actor: ActorContext, input: { targetType: SubscriptionTargetType; targetId: string; events: string[] }): Promise<ResourceSubscriptionDto> {
  const events = [...new Set(input.events)];
  const subscription = await prisma.subscription.upsert({
    where: {
      tenantId_membershipId_targetType_targetId: {
        tenantId: actor.organizationId,
        membershipId: actor.membershipId,
        targetType: input.targetType,
        targetId: input.targetId
      }
    },
    create: {
      tenantId: actor.organizationId,
      membershipId: actor.membershipId,
      targetType: input.targetType,
      targetId: input.targetId,
      eventsJson: JSON.stringify(events)
    },
    update: { eventsJson: JSON.stringify(events) }
  });
  return toDto(subscription);
}

export async function unsubscribe(actor: ActorContext, targetType: SubscriptionTargetType, targetId: string): Promise<void> {
  const removed = await prisma.subscription.deleteMany({
    where: { tenantId: actor.organizationId, membershipId: actor.membershipId, targetType, targetId }
  });
  if (!removed.count) throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", "The subscription was not found.");
}

export async function listMySubscriptions(actor: ActorContext): Promise<SubscriptionsResponse> {
  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId: actor.organizationId, membershipId: actor.membershipId },
    orderBy: { createdAt: "desc" }
  });
  return { subscriptions: subscriptions.map(toDto) };
}

export async function isSubscribed(actor: ActorContext, targetType: SubscriptionTargetType, targetId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findFirst({
    where: { tenantId: actor.organizationId, membershipId: actor.membershipId, targetType, targetId },
    select: { id: true }
  });
  return Boolean(subscription);
}

export interface SubscriptionDispatchPayload {
  actorMembershipId?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Internal helper (not a route): notifies every subscriber of a target whose
// subscribed events include `event`. The actor that triggered the change is
// skipped when payload.actorMembershipId is provided.
export async function dispatchToSubscribers(
  tenantId: string,
  targetType: SubscriptionTargetType,
  targetId: string,
  event: string,
  payload: SubscriptionDispatchPayload
): Promise<void> {
  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId, targetType, targetId }
  });
  for (const subscription of subscriptions) {
    if (payload.actorMembershipId && subscription.membershipId === payload.actorMembershipId) continue;
    if (!parseEvents(subscription.eventsJson).includes(event)) continue;
    await notify({
      tenantId,
      recipientId: subscription.membershipId,
      type: "subscription.alert",
      title: payload.title,
      body: payload.body,
      data: { targetType, targetId, event, ...payload.data }
    });
  }
}
