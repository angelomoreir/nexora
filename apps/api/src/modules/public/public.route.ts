import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { prisma, transactionOptions } from "../../lib/prisma.js";
import { storage } from "../../services/storage/index.js";
import { authenticate } from "../auth/auth.guard.js";
import { getPlatformMetrics } from "./platform-metrics.service.js";

const LEAD_STATUSES = ["NEW", "CONTACTED", "DEMO", "PROPOSAL", "WON", "LOST"] as const;
const TEAM_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional(),
  message: z.string().trim().min(5).max(4000),
  intent: z.enum(["contact", "demo", "pricing", "partner"]).default("contact"),
  teamSize: z.enum(TEAM_SIZES).optional()
});

const contactListSchema = z.object({
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
});

const leadListSchema = contactListSchema.extend({ status: z.enum(LEAD_STATUSES).optional() });

const leadUpdateSchema = z
  .object({ status: z.enum(LEAD_STATUSES).optional(), notes: z.string().max(10000).optional() })
  .refine((value) => value.status !== undefined || value.notes !== undefined, "At least one field is required");

async function requireSuperAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.auth?.isSuperAdmin) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
}

export const publicRoute: FastifyPluginAsync = async (app) => {
  app.post("/public/contact", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const input = contactSchema.parse(request.body);
    await prisma.contactRequest.create({
      data: { name: input.name, email: input.email, company: input.company ?? null, message: input.message, intent: input.intent, teamSize: input.teamSize ?? null }
    });
    return reply.status(201).send({ ok: true });
  });

  app.get(
    "/platform/contact-requests",
    { preHandler: [authenticate, requireSuperAdmin] },
    async (request) => {
      const filters = leadListSchema.parse(request.query);
      const page = filters.page ?? 1;
      const pageSize = filters.pageSize ?? 50;
      const searchWhere = filters.search
        ? {
            OR: (["name", "email", "company", "message", "notes"] as const).map((field) => ({
              [field]: { contains: filters.search, mode: "insensitive" as const }
            }))
          }
        : {};
      const where = filters.status ? { ...searchWhere, status: filters.status } : searchWhere;
      const [requests, total, grouped] = await Promise.all([
        prisma.contactRequest.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize
        }),
        prisma.contactRequest.count({ where }),
        prisma.contactRequest.groupBy({ by: ["status"], where: searchWhere, _count: { _all: true } })
      ]);
      const statusCounts = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0])) as Record<(typeof LEAD_STATUSES)[number], number>;
      for (const row of grouped) {
        if (row.status in statusCounts) statusCounts[row.status as (typeof LEAD_STATUSES)[number]] = row._count._all;
      }
      return { requests, total, page, pageSize, statusCounts };
    }
  );

  app.patch(
    "/platform/contact-requests/:requestId",
    { preHandler: [authenticate, requireSuperAdmin] },
    async (request) => {
      const { requestId } = request.params as { requestId: string };
      const input = leadUpdateSchema.parse(request.body);
      const existing = await prisma.contactRequest.findUnique({ where: { id: requestId }, select: { id: true } });
      if (!existing) throw new AppError(404, "NOT_FOUND", "Contact request not found.");
      return prisma.contactRequest.update({ where: { id: requestId }, data: input });
    }
  );

  app.get("/platform/metrics", { preHandler: [authenticate, requireSuperAdmin] }, async () => getPlatformMetrics());

  app.get(
    "/platform/organizations",
    { preHandler: [authenticate, requireSuperAdmin] },
    async (request) => {
      const filters = contactListSchema.parse(request.query);
      const page = filters.page ?? 1;
      const pageSize = filters.pageSize ?? 50;
      const where = filters.search
        ? {
            OR: (["name", "slug"] as const).map((field) => ({
              [field]: { contains: filters.search, mode: "insensitive" as const }
            }))
          }
        : {};
      const [organizations, total] = await Promise.all([
        prisma.organization.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            _count: { select: { memberships: true } },
            memberships: {
              take: 1,
              orderBy: { createdAt: "asc" },
              include: { user: { select: { name: true, email: true } } }
            },
            subscription: { include: { plan: { select: { name: true } } } }
          }
        }),
        prisma.organization.count({ where })
      ]);
      return {
        organizations: organizations.map((org) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          status: org.status,
          createdAt: org.createdAt,
          memberCount: org._count.memberships,
          ownerName: org.memberships[0]?.user.name ?? null,
          ownerEmail: org.memberships[0]?.user.email ?? null,
          planName: org.subscription?.plan.name ?? null,
          subscriptionStatus: org.subscription?.status ?? null
        })),
        total,
        page,
        pageSize
      };
    }
  );

  app.delete(
    "/platform/organizations/:organizationId",
    { preHandler: [authenticate, requireSuperAdmin] },
    async (request, reply) => {
      const { organizationId } = request.params as { organizationId: string };
      const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
      if (!organization) throw new AppError(404, "NOT_FOUND", "Organization not found.");

      const [documents, versions] = await Promise.all([
        prisma.document.findMany({ where: { tenantId: organizationId, storageKey: { not: null } }, select: { storageKey: true } }),
        prisma.documentVersion.findMany({ where: { tenantId: organizationId }, select: { storageKey: true } })
      ]);
      const storageKeys = new Set<string>();
      for (const row of [...documents, ...versions]) {
        if (row.storageKey) storageKeys.add(row.storageKey);
      }

      await prisma.$transaction(async (tx) => {
        await tx.workflowInstance.deleteMany({ where: { tenantId: organizationId } });
        await tx.approval.deleteMany({ where: { tenantId: organizationId } });
        await tx.organization.delete({ where: { id: organizationId } });
      }, transactionOptions);

      for (const key of storageKeys) {
        await storage.delete(key).catch(() => undefined);
      }
      return reply.status(204).send();
    }
  );

  app.delete(
    "/platform/contact-requests/:requestId",
    { preHandler: [authenticate, requireSuperAdmin] },
    async (request, reply) => {
      const { requestId } = request.params as { requestId: string };
      await prisma.contactRequest.delete({ where: { id: requestId } });
      return reply.status(204).send();
    }
  );
};
