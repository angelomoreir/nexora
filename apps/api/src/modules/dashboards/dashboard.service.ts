import type { CreateDashboardInput, CreateWidgetInput, DashboardDto, DashboardsResponse, DashboardWidgetDto, DashboardWidgetType, DashboardResponse, RenderedDashboardResponse, UpdateDashboardInput, UpdateWidgetInput } from "@nexora/contracts";
import { Prisma, type Dashboard, type DashboardWidget } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

const pendingTaskStatuses = ["TODO", "IN_PROGRESS", "BLOCKED"];

export const DASHBOARD_WIDGET_TYPES: DashboardWidgetType[] = [
  "metrics",
  "recentDocuments",
  "pendingTasks",
  "notifications",
  "recentActivity",
  "taskDistribution",
  "quickLinks"
];

const MAX_WIDGETS_PER_DASHBOARD = 12;

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

// --- Shared widget data queries (also used by the fixed getDashboard) ---

async function queryMetrics(organizationId: string) {
  const [documents, users, teams, pendingTasks, activeProcesses, pendingApprovals, storage, tasks, lists, forms] = await Promise.all([
    prisma.document.count({ where: { tenantId: organizationId, status: "ACTIVE" } }),
    prisma.organizationMember.count({ where: { tenantId: organizationId, status: "ACTIVE" } }),
    prisma.team.count({ where: { tenantId: organizationId } }),
    prisma.task.count({ where: { tenantId: organizationId, status: { in: pendingTaskStatuses } } }),
    prisma.processDefinition.count({ where: { tenantId: organizationId, status: "ACTIVE" } }),
    prisma.approval.count({ where: { tenantId: organizationId, status: "PENDING" } }),
    prisma.documentVersion.aggregate({ where: { tenantId: organizationId }, _sum: { sizeBytes: true } }),
    prisma.task.count({ where: { tenantId: organizationId, status: { not: "CANCELLED" } } }),
    prisma.listDefinition.count({ where: { tenantId: organizationId } }),
    prisma.formDefinition.count({ where: { tenantId: organizationId } })
  ]);
  return { documents, users, teams, pendingTasks, activeProcesses, pendingApprovals, storageBytes: storage._sum.sizeBytes ?? 0, tasks, lists, forms };
}

async function queryRecentActivity(organizationId: string, take: number) {
  const recentActivity = await prisma.auditLog.findMany({
    where: { tenantId: organizationId },
    orderBy: { occurredAt: "desc" },
    take,
    include: { actor: { include: { user: true } } }
  });
  return recentActivity.map((activity) => ({
    id: activity.id,
    action: activity.action,
    resourceType: activity.resourceType,
    resourceId: activity.resourceId,
    occurredAt: activity.occurredAt.toISOString(),
    actor: activity.actor
      ? { id: activity.actor.user.id, name: activity.actor.user.name, avatar: activity.actor.user.avatar }
      : null
  }));
}

async function queryRecentDocuments(organizationId: string, take: number) {
  const recentDocuments = await prisma.document.findMany({
    where: { tenantId: organizationId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      folder: { select: { name: true } },
      versions: { orderBy: { version: "desc" }, take: 1 }
    }
  });
  return recentDocuments.map((document) => ({
    id: document.id,
    name: document.name,
    status: document.status,
    updatedAt: document.updatedAt.toISOString(),
    folderName: document.folder?.name ?? null,
    latestVersion: document.versions[0]
      ? {
          version: document.versions[0].version,
          sizeBytes: document.versions[0].sizeBytes,
          mimeType: document.versions[0].mimeType
        }
      : null
  }));
}

async function queryPendingTasks(organizationId: string, membershipId: string, take: number) {
  const assignedTasks = await prisma.task.findMany({
    where: {
      tenantId: organizationId,
      assignedMembershipId: membershipId,
      status: { in: pendingTaskStatuses }
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    take
  });
  return assignedTasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
    updatedAt: task.updatedAt.toISOString()
  }));
}

async function queryNotifications(organizationId: string, membershipId: string, take: number) {
  const notifications = await prisma.notification.findMany({
    where: { tenantId: organizationId, recipientId: membershipId },
    orderBy: { createdAt: "desc" },
    take
  });
  return notifications.map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString()
  }));
}

async function queryTaskDistribution(organizationId: string) {
  const taskDistribution = await prisma.task.groupBy({
    by: ["status"],
    where: { tenantId: organizationId },
    _count: { _all: true },
    orderBy: { status: "asc" }
  });
  return taskDistribution.map((group) => ({ status: group.status, count: group._count._all }));
}

function widgetLimit(config: Record<string, unknown>, fallback: number) {
  const raw = config.limit;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.min(Math.max(Math.trunc(raw), 1), 50);
  return fallback;
}

async function widgetData(tenantId: string, membershipId: string, type: string, config: Record<string, unknown>): Promise<unknown> {
  switch (type) {
    case "metrics":
      return queryMetrics(tenantId);
    case "recentDocuments":
      return queryRecentDocuments(tenantId, widgetLimit(config, 6));
    case "pendingTasks":
      return queryPendingTasks(tenantId, membershipId, widgetLimit(config, 6));
    case "notifications":
      return queryNotifications(tenantId, membershipId, widgetLimit(config, 6));
    case "recentActivity":
      return queryRecentActivity(tenantId, widgetLimit(config, 8));
    case "taskDistribution":
      return queryTaskDistribution(tenantId);
    case "quickLinks":
      return { links: Array.isArray(config.links) ? config.links : [] };
    default:
      return null;
  }
}

export async function getDashboard(organizationId: string, userId: string): Promise<DashboardResponse> {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } }
  });
  if (!membership) {
    throw new AppError(403, "FORBIDDEN", "You cannot access this organization dashboard.");
  }

  const [metrics, recentActivity, recentDocuments, pendingTasks, notifications, taskDistribution, news] = await Promise.all([
    queryMetrics(organizationId),
    queryRecentActivity(organizationId, 8),
    queryRecentDocuments(organizationId, 6),
    queryPendingTasks(organizationId, membership.id, 6),
    queryNotifications(organizationId, membership.id, 6),
    queryTaskDistribution(organizationId),
    queryPublishedNews(organizationId, 5)
  ]);

  return { metrics, recentActivity, recentDocuments, pendingTasks, notifications, taskDistribution, news };
}

async function queryPublishedNews(organizationId: string, take: number) {
  const posts = await prisma.newsPost.findMany({
    where: { tenantId: organizationId, status: "PUBLISHED" },
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
    take,
    include: {
      author: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      site: { select: { name: true } }
    }
  });
  return posts.map((post) => ({
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    featured: post.featured,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    siteName: post.site?.name ?? null,
    author: post.author ? { id: post.author.user.id, name: post.author.user.name, avatar: post.author.user.avatar } : null
  }));
}

// --- Configurable dashboards ---

function parseJsonObject(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function toWidgetDto(widget: DashboardWidget): DashboardWidgetDto {
  return {
    id: widget.id,
    type: widget.type as DashboardWidgetType,
    config: parseJsonObject(widget.configJson),
    position: parseJsonObject(widget.positionJson)
  };
}

function toDashboardDto(dashboard: Dashboard & { widgets: DashboardWidget[] }): DashboardDto {
  return {
    id: dashboard.id,
    name: dashboard.name,
    layout: parseJsonObject(dashboard.layoutJson),
    widgets: dashboard.widgets.map(toWidgetDto),
    createdAt: dashboard.createdAt.toISOString(),
    updatedAt: dashboard.updatedAt.toISOString()
  };
}

async function requireDashboard(actor: ActorContext, dashboardId: string) {
  const dashboard = await prisma.dashboard.findFirst({
    where: { id: dashboardId, tenantId: actor.organizationId },
    include: { widgets: true }
  });
  if (!dashboard) throw new AppError(404, "DASHBOARD_NOT_FOUND", "The dashboard was not found.");
  return dashboard;
}

async function audit(actor: ActorContext, action: string, resourceId: string, context?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      tenantId: actor.organizationId,
      actorId: actor.membershipId,
      action,
      resourceType: "Dashboard",
      resourceId,
      contextJson: context ? JSON.stringify(context) : null
    }
  });
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function listDashboards(actor: ActorContext): Promise<DashboardsResponse> {
  const dashboards = await prisma.dashboard.findMany({
    where: { tenantId: actor.organizationId },
    include: { widgets: true },
    orderBy: { name: "asc" }
  });
  return { dashboards: dashboards.map(toDashboardDto) };
}

export async function createDashboard(actor: ActorContext, input: CreateDashboardInput): Promise<DashboardDto> {
  const existing = await prisma.dashboard.findFirst({ where: { tenantId: actor.organizationId, name: input.name } });
  if (existing) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A dashboard with this name already exists.");
  try {
    const dashboard = await prisma.dashboard.create({
      data: {
        tenantId: actor.organizationId,
        name: input.name,
        layoutJson: JSON.stringify(input.layout ?? {})
      },
      include: { widgets: true }
    });
    await audit(actor, "dashboard.created", dashboard.id, { name: dashboard.name });
    return toDashboardDto(dashboard);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A dashboard with this name already exists.");
    throw error;
  }
}

export async function updateDashboard(actor: ActorContext, dashboardId: string, input: UpdateDashboardInput): Promise<DashboardDto> {
  const dashboard = await requireDashboard(actor, dashboardId);
  if (input.name && input.name !== dashboard.name) {
    const clash = await prisma.dashboard.findFirst({ where: { tenantId: actor.organizationId, name: input.name, NOT: { id: dashboardId } } });
    if (clash) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A dashboard with this name already exists.");
  }
  try {
    const updated = await prisma.dashboard.update({
      where: { id: dashboard.id },
      data: {
        name: input.name,
        layoutJson: input.layout !== undefined ? JSON.stringify(input.layout) : undefined
      },
      include: { widgets: true }
    });
    await audit(actor, "dashboard.updated", dashboard.id, { name: updated.name });
    return toDashboardDto(updated);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A dashboard with this name already exists.");
    throw error;
  }
}

export async function deleteDashboard(actor: ActorContext, dashboardId: string): Promise<void> {
  const dashboard = await requireDashboard(actor, dashboardId);
  await prisma.dashboard.delete({ where: { id: dashboard.id } });
  await audit(actor, "dashboard.deleted", dashboard.id, { name: dashboard.name });
}

export async function addWidget(actor: ActorContext, dashboardId: string, input: CreateWidgetInput): Promise<DashboardWidgetDto> {
  const dashboard = await requireDashboard(actor, dashboardId);
  if (!DASHBOARD_WIDGET_TYPES.includes(input.type)) {
    throw new AppError(400, "INVALID_WIDGET_TYPE", "The widget type is not supported.");
  }
  if (dashboard.widgets.length >= MAX_WIDGETS_PER_DASHBOARD) {
    throw new AppError(409, "WIDGET_LIMIT_REACHED", "The dashboard reached the maximum number of widgets.");
  }
  const widget = await prisma.dashboardWidget.create({
    data: {
      tenantId: actor.organizationId,
      dashboardId: dashboard.id,
      type: input.type,
      configJson: JSON.stringify(input.config ?? {}),
      positionJson: JSON.stringify(input.position ?? {})
    }
  });
  await audit(actor, "dashboard.widget.added", dashboard.id, { widgetId: widget.id, type: widget.type });
  return toWidgetDto(widget);
}

export async function updateWidget(actor: ActorContext, dashboardId: string, widgetId: string, input: UpdateWidgetInput): Promise<DashboardWidgetDto> {
  const dashboard = await requireDashboard(actor, dashboardId);
  const widget = dashboard.widgets.find((item) => item.id === widgetId);
  if (!widget) throw new AppError(404, "WIDGET_NOT_FOUND", "The widget was not found.");
  const updated = await prisma.dashboardWidget.update({
    where: { id: widget.id },
    data: {
      configJson: input.config !== undefined ? JSON.stringify(input.config) : undefined,
      positionJson: input.position !== undefined ? JSON.stringify(input.position) : undefined
    }
  });
  await audit(actor, "dashboard.widget.updated", dashboard.id, { widgetId: widget.id });
  return toWidgetDto(updated);
}

export async function removeWidget(actor: ActorContext, dashboardId: string, widgetId: string): Promise<void> {
  const dashboard = await requireDashboard(actor, dashboardId);
  const widget = dashboard.widgets.find((item) => item.id === widgetId);
  if (!widget) throw new AppError(404, "WIDGET_NOT_FOUND", "The widget was not found.");
  await prisma.dashboardWidget.delete({ where: { id: widget.id } });
  await audit(actor, "dashboard.widget.removed", dashboard.id, { widgetId: widget.id });
}

export async function renderDashboard(actor: ActorContext, dashboardId: string): Promise<RenderedDashboardResponse> {
  const dashboard = await requireDashboard(actor, dashboardId);
  const widgets = await Promise.all(
    dashboard.widgets.map(async (widget) => ({
      ...toWidgetDto(widget),
      data: await widgetData(actor.organizationId, actor.membershipId, widget.type, parseJsonObject(widget.configJson))
    }))
  );
  return { dashboard: toDashboardDto(dashboard), widgets };
}
