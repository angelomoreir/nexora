import type { RealtimeEventDto, RealtimePresenceDto, RealtimeResourceType } from "@nexora/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

type RealtimeEventType = RealtimeEventDto["type"];
type Listener = (event: RealtimeEventDto) => void;

const memberChannels = new Map<string, Set<Listener>>();
const resourceChannels = new Map<string, Set<Listener>>();
const presenceByChannel = new Map<string, Map<string, { info: RealtimePresenceDto; count: number }>>();

function memberChannelKey(tenantId: string, membershipId: string) {
  return `member:${tenantId}:${membershipId}`;
}

function resourceChannelKey(tenantId: string, resourceType: RealtimeResourceType, resourceId: string) {
  return `resource:${tenantId}:${resourceType}:${resourceId}`;
}

function subscribe(map: Map<string, Set<Listener>>, key: string, listener: Listener): () => void {
  let listeners = map.get(key);
  if (!listeners) {
    listeners = new Set();
    map.set(key, listeners);
  }
  listeners.add(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const set = map.get(key);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) map.delete(key);
  };
}

export function subscribeMemberChannel(tenantId: string, membershipId: string, listener: Listener): () => void {
  return subscribe(memberChannels, memberChannelKey(tenantId, membershipId), listener);
}

export function subscribeResourceChannel(tenantId: string, resourceType: RealtimeResourceType, resourceId: string, listener: Listener): () => void {
  return subscribe(resourceChannels, resourceChannelKey(tenantId, resourceType, resourceId), listener);
}

function broadcast(map: Map<string, Set<Listener>>, key: string, event: RealtimeEventDto) {
  const listeners = map.get(key);
  if (!listeners) return;
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      listeners.delete(listener);
    }
  }
  if (listeners.size === 0) map.delete(key);
}

export interface RealtimeActor {
  userId: string;
  name: string;
  avatar: string | null;
}

function makeEvent(type: RealtimeEventType, actor?: RealtimeActor): RealtimeEventDto {
  return { id: randomUUID(), type, occurredAt: new Date().toISOString(), ...(actor ? { actor } : {}) };
}

export function publishMemberEvent(tenantId: string, membershipId: string, type: RealtimeEventType, actor?: RealtimeActor) {
  broadcast(memberChannels, memberChannelKey(tenantId, membershipId), makeEvent(type, actor));
}

export function publishResourceEvent(tenantId: string, resourceType: RealtimeResourceType, resourceId: string, type: RealtimeEventType, actor?: RealtimeActor) {
  broadcast(resourceChannels, resourceChannelKey(tenantId, resourceType, resourceId), { ...makeEvent(type, actor), resourceType, resourceId });
}

export function getPresence(tenantId: string, resourceType: RealtimeResourceType, resourceId: string): RealtimePresenceDto[] {
  const entries = presenceByChannel.get(resourceChannelKey(tenantId, resourceType, resourceId));
  if (!entries) return [];
  return [...entries.values()].map((entry) => entry.info).sort((a, b) => a.name.localeCompare(b.name));
}

function broadcastPresence(tenantId: string, resourceType: RealtimeResourceType, resourceId: string) {
  broadcast(resourceChannels, resourceChannelKey(tenantId, resourceType, resourceId), {
    ...makeEvent("presence.updated"),
    resourceType,
    resourceId,
    presence: getPresence(tenantId, resourceType, resourceId)
  });
}

export function enterPresence(tenantId: string, resourceType: RealtimeResourceType, resourceId: string, info: RealtimePresenceDto): () => void {
  const key = resourceChannelKey(tenantId, resourceType, resourceId);
  let entries = presenceByChannel.get(key);
  if (!entries) {
    entries = new Map();
    presenceByChannel.set(key, entries);
  }
  const existing = entries.get(info.membershipId);
  if (existing) existing.count += 1;
  else entries.set(info.membershipId, { info, count: 1 });
  broadcastPresence(tenantId, resourceType, resourceId);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const current = presenceByChannel.get(key);
    if (!current) return;
    const entry = current.get(info.membershipId);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count <= 0) current.delete(info.membershipId);
    if (current.size === 0) presenceByChannel.delete(key);
    broadcastPresence(tenantId, resourceType, resourceId);
  };
}

export function resetRealtimeState() {
  memberChannels.clear();
  resourceChannels.clear();
  presenceByChannel.clear();
}

export async function openRealtimeStream(
  request: FastifyRequest,
  reply: FastifyReply,
  input: { tenantId: string; membershipId: string; userId: string; resource?: { type: RealtimeResourceType; id: string } }
): Promise<void> {
  const membership = await prisma.organizationMember.findFirst({
    where: { id: input.membershipId, tenantId: input.tenantId, userId: input.userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
    include: { user: { select: { name: true, avatar: true } } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");

  const self: RealtimePresenceDto = { membershipId: membership.id, userId: input.userId, name: membership.user.name, avatar: membership.user.avatar };

  const origin = request.headers.origin;
  const corsOrigin = origin === env.WEB_ORIGIN || (env.NODE_ENV !== "production" && (origin === "http://localhost:5173" || origin === "http://127.0.0.1:5173")) ? origin : null;
  if (corsOrigin) {
    reply.header("Access-Control-Allow-Origin", corsOrigin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Vary", "Origin");
  }
  reply
    .header("Content-Type", "text/event-stream")
    .header("Cache-Control", "no-cache, no-transform")
    .header("Connection", "keep-alive")
    .header("X-Accel-Buffering", "no")
    .header("X-Content-Type-Options", "nosniff");
  reply.hijack();
  reply.raw.writeHead(200, reply.getHeaders() as Record<string, string | string[] | number>);

  let cleaned = false;
  let closed = false;
  let heartbeat: NodeJS.Timeout | null = null;
  let lifetime: NodeJS.Timeout | null = null;
  let unsubscribe: () => void = () => undefined;
  let leavePresence: (() => void) | null = null;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (lifetime) clearTimeout(lifetime);
    unsubscribe();
    leavePresence?.();
    request.raw.off("aborted", cleanup);
    request.raw.socket.off("close", cleanup);
    reply.raw.off("close", cleanup);
    if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
  };

  const write = (chunk: string) => {
    if (closed || reply.raw.destroyed || reply.raw.writableEnded) return;
    try {
      reply.raw.write(chunk);
    } catch {
      cleanup();
    }
  };
  const send = (event: RealtimeEventDto) => write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);

  if (input.resource) {
    leavePresence = enterPresence(input.tenantId, input.resource.type, input.resource.id, self);
    unsubscribe = subscribeResourceChannel(input.tenantId, input.resource.type, input.resource.id, send);
  } else {
    unsubscribe = subscribeMemberChannel(input.tenantId, input.membershipId, send);
  }

  send({
    ...makeEvent("connected"),
    resourceType: input.resource?.type,
    resourceId: input.resource?.id,
    presence: input.resource ? getPresence(input.tenantId, input.resource.type, input.resource.id) : undefined
  });

  heartbeat = setInterval(() => write(": hb\n\n"), 20000);
  heartbeat.unref();
  lifetime = setTimeout(cleanup, Math.max(env.JWT_ACCESS_TTL_MINUTES * 60 * 1000, 30 * 1000));
  lifetime.unref();

  request.raw.on("aborted", cleanup);
  request.raw.socket.on("close", cleanup);
  reply.raw.on("close", cleanup);
}
