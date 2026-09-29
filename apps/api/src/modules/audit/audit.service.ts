import type { AuditLogDto, AuditLogFilters, AuditLogListResponse } from "@nexora/contracts";
import { prisma } from "../../lib/prisma.js";

export async function listAuditLogs(organizationId: string, filters: AuditLogFilters): Promise<AuditLogListResponse> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const where: {
    tenantId: string;
    action?: { contains: string; mode?: "insensitive" };
    resourceType?: string;
    actorId?: string;
    result?: string;
    occurredAt?: { gte?: Date; lte?: Date };
  } = { tenantId: organizationId };

  if (filters.action) where.action = { contains: filters.action, mode: "insensitive" as const };
  if (filters.resourceType) where.resourceType = filters.resourceType;
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.result) where.result = filters.result;
  if (filters.after || filters.before) {
    where.occurredAt = {};
    if (filters.after) where.occurredAt.gte = new Date(filters.after);
    if (filters.before) where.occurredAt.lte = new Date(filters.before);
  }

  // For search, we need to filter by actor name/email after fetching
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  let dtos = logs.map(toDto);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    dtos = dtos.filter(
      (d) =>
        d.action.toLowerCase().includes(q) ||
        d.resourceType.toLowerCase().includes(q) ||
        d.actor?.name.toLowerCase().includes(q) ||
        d.actor?.email.toLowerCase().includes(q)
    );
  }

  return { logs: dtos, total, page, pageSize };
}

function toDto(log: {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  contextJson: string | null;
  ipAddress: string | null;
  result: string;
  occurredAt: Date;
  actor: { id: string; user: { name: string; email: string } } | null;
}): AuditLogDto {
  let context: Record<string, unknown> | null = null;
  if (log.contextJson) {
    try { context = JSON.parse(log.contextJson); } catch { /* ignore */ }
  }
  return {
    id: log.id,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    context,
    ipAddress: log.ipAddress,
    result: log.result,
    occurredAt: log.occurredAt.toISOString(),
    actor: log.actor ? { id: log.actor.id, name: log.actor.user.name, email: log.actor.user.email } : null
  };
}
