import type { AnalyticsPeriodDays, DashboardWidgetType } from "@nexora/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { DASHBOARD_WIDGET_TYPES, addWidget, createDashboard, deleteDashboard, getActor, getDashboard, listDashboards, removeWidget, renderDashboard, updateDashboard, updateWidget } from "./dashboard.service.js";
import { getOperationalAnalytics } from "./operational-analytics.service.js";

const dashboardsManageGuard = [authenticate, requirePermission(permissions.dashboardsManage)];
const analyticsViewGuard = [authenticate, requirePermission(permissions.analyticsView)];

const analyticsQuerySchema = z.object({
  days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30)
});
const jsonObjectSchema = z.record(z.string(), z.unknown());

const createDashboardSchema = z.object({
  name: z.string().trim().min(1).max(120),
  layout: jsonObjectSchema.optional()
});

const updateDashboardSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  layout: jsonObjectSchema.optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

const createWidgetSchema = z.object({
  type: z.enum(DASHBOARD_WIDGET_TYPES as [DashboardWidgetType, ...DashboardWidgetType[]]),
  config: jsonObjectSchema.default({}),
  position: jsonObjectSchema.default({})
});

const updateWidgetSchema = z.object({
  config: jsonObjectSchema.optional(),
  position: jsonObjectSchema.optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; dashboardId: string; widgetId: string };
}

async function actorFor(request: FastifyRequest) {
  const { organizationId } = params(request);
  return getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const dashboardRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/organizations/:organizationId/dashboard",
    { preHandler: authenticate },
    async (request) => {
      const { organizationId } = request.params as { organizationId: string };
      return getDashboard(organizationId, request.auth!.userId);
    }
  );

  app.get("/organizations/:organizationId/analytics/operational", { preHandler: analyticsViewGuard }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    const { days } = analyticsQuerySchema.parse(request.query);
    await actorFor(request);
    return getOperationalAnalytics(organizationId, days as AnalyticsPeriodDays);
  });

  app.get("/organizations/:organizationId/dashboards", { preHandler: authenticate }, async (request) => {
    return listDashboards(await actorFor(request));
  });

  app.post("/organizations/:organizationId/dashboards", { preHandler: dashboardsManageGuard }, async (request, reply) => {
    const dashboard = await createDashboard(await actorFor(request), createDashboardSchema.parse(request.body));
    return reply.status(201).send(dashboard);
  });

  app.patch("/organizations/:organizationId/dashboards/:dashboardId", { preHandler: dashboardsManageGuard }, async (request) => {
    return updateDashboard(await actorFor(request), params(request).dashboardId, updateDashboardSchema.parse(request.body));
  });

  app.delete("/organizations/:organizationId/dashboards/:dashboardId", { preHandler: dashboardsManageGuard }, async (request, reply) => {
    await deleteDashboard(await actorFor(request), params(request).dashboardId);
    return reply.status(204).send();
  });

  app.post("/organizations/:organizationId/dashboards/:dashboardId/widgets", { preHandler: dashboardsManageGuard }, async (request, reply) => {
    const widget = await addWidget(await actorFor(request), params(request).dashboardId, createWidgetSchema.parse(request.body));
    return reply.status(201).send(widget);
  });

  app.patch("/organizations/:organizationId/dashboards/:dashboardId/widgets/:widgetId", { preHandler: dashboardsManageGuard }, async (request) => {
    return updateWidget(await actorFor(request), params(request).dashboardId, params(request).widgetId, updateWidgetSchema.parse(request.body));
  });

  app.delete("/organizations/:organizationId/dashboards/:dashboardId/widgets/:widgetId", { preHandler: dashboardsManageGuard }, async (request, reply) => {
    await removeWidget(await actorFor(request), params(request).dashboardId, params(request).widgetId);
    return reply.status(204).send();
  });

  app.get("/organizations/:organizationId/dashboards/:dashboardId/render", { preHandler: authenticate }, async (request) => {
    return renderDashboard(await actorFor(request), params(request).dashboardId);
  });
};
