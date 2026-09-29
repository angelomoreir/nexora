import type { FastifyPluginAsync } from "fastify";
import type { AIScaffoldApplyInput } from "@nexora/contracts";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import {
  applyScaffold,
  chat,
  classifyDocument,
  contextualAnswer,
  generateReport,
  getConversation,
  listConversations,
  proposeApp,
  proposeList,
  proposeWorkflow,
  qaDocument,
  summarizeDocument
} from "./ai.service.js";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().optional()
});

const qaSchema = z.object({
  question: z.string().trim().min(1).max(2000)
});

const proposeSchema = z.object({
  description: z.string().trim().min(5).max(2000)
});

const reportSchema = z.object({
  prompt: z.string().trim().min(3).max(2000)
});

const contextualSchema = z.object({
  resourceType: z.enum(["document", "task", "list", "workflow"]),
  resourceId: z.string().trim().min(1),
  prompt: z.string().trim().min(3).max(2000)
});

export const aiRoute: FastifyPluginAsync = async (app) => {
  // --- Chat ---
  app.post("/organizations/:organizationId/ai/chat", { preHandler: authenticate }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    const input = chatSchema.parse(request.body);
    return chat(organizationId, request.auth!.userId, request.auth!.isSuperAdmin, input.message, input.conversationId);
  });

  // --- Conversations ---
  app.get("/organizations/:organizationId/ai/conversations", { preHandler: authenticate }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    return listConversations(organizationId, request.auth!.userId);
  });

  app.get("/organizations/:organizationId/ai/conversations/:conversationId", { preHandler: authenticate }, async (request) => {
    const { organizationId, conversationId } = request.params as { organizationId: string; conversationId: string };
    const conversation = await getConversation(organizationId, request.auth!.userId, conversationId);
    if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "The conversation was not found.");
    return conversation;
  });

  // --- Document operations ---
  app.post("/organizations/:organizationId/ai/documents/:documentId/summarize", { preHandler: [authenticate, requirePermission(permissions.documentsView)] }, async (request) => {
    const { organizationId, documentId } = request.params as { organizationId: string; documentId: string };
    return summarizeDocument(organizationId, request.auth!.userId, request.auth!.isSuperAdmin, documentId);
  });

  app.post("/organizations/:organizationId/ai/documents/:documentId/qa", { preHandler: [authenticate, requirePermission(permissions.documentsView)] }, async (request) => {
    const { organizationId, documentId } = request.params as { organizationId: string; documentId: string };
    const input = qaSchema.parse(request.body);
    return qaDocument(organizationId, request.auth!.userId, request.auth!.isSuperAdmin, documentId, input.question);
  });

  app.post("/organizations/:organizationId/ai/documents/:documentId/classify", { preHandler: [authenticate, requirePermission(permissions.documentsView)] }, async (request) => {
    const { organizationId, documentId } = request.params as { organizationId: string; documentId: string };
    return classifyDocument(organizationId, request.auth!.userId, request.auth!.isSuperAdmin, documentId);
  });

  app.post("/organizations/:organizationId/ai/contextual", { preHandler: authenticate }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    const input = contextualSchema.parse(request.body);
    return contextualAnswer(organizationId, request.auth!.userId, request.auth!.isSuperAdmin, input);
  });

  // --- List & Workflow proposals ---
  app.post("/organizations/:organizationId/ai/propose-list", { preHandler: [authenticate, requirePermission(permissions.listsManage)] }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    const input = proposeSchema.parse(request.body);
    return proposeList(organizationId, request.auth!.userId, request.auth!.isSuperAdmin, input.description);
  });

  app.post("/organizations/:organizationId/ai/propose-workflow", { preHandler: [authenticate, requirePermission(permissions.workflowsManage)] }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    const input = proposeSchema.parse(request.body);
    return proposeWorkflow(organizationId, request.auth!.userId, request.auth!.isSuperAdmin, input.description);
  });

  // --- No-code app scaffold ---
  app.post("/organizations/:organizationId/ai/propose-app", { preHandler: [authenticate, requirePermission(permissions.listsManage)] }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    const input = proposeSchema.parse(request.body);
    return proposeApp(organizationId, request.auth!.userId, request.auth!.isSuperAdmin, input.description);
  });

  const scaffoldApplySchema = z.object({
    siteId: z.string().min(1).nullable().optional(),
    spec: z.object({
      name: z.string().trim().min(1).max(200),
      description: z.string().max(2000).default(""),
      list: z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().max(480).default(""),
        fields: z.array(z.object({
          name: z.string().trim().min(1).max(120),
          slug: z.string().max(80).default(""),
          type: z.string().max(40).default("text"),
          required: z.boolean().default(false)
        })).max(100).default([])
      }),
      form: z.object({
        name: z.string().trim().min(1).max(120),
        fields: z.array(z.object({
          type: z.string().max(40).default("text"),
          label: z.string().trim().min(1).max(120),
          required: z.boolean().default(false),
          options: z.array(z.object({ value: z.string().max(80), label: z.string().max(120) })).nullable().optional()
        })).max(100).default([])
      }),
      workflow: z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().max(480).default(""),
        steps: z.array(z.object({
          order: z.number().int().min(0).default(0),
          type: z.string().max(40).default("SEND_NOTIFICATION"),
          name: z.string().trim().min(1).max(120),
          config: z.record(z.string(), z.unknown()).default({})
        })).max(50).default([])
      }),
      page: z.object({
        title: z.string().trim().min(1).max(200),
        widgets: z.array(z.object({
          id: z.string().min(1).max(80),
          type: z.string().trim().min(1).max(40),
          props: z.record(z.string(), z.unknown()).default({})
        })).max(50).default([])
      }).nullable().default(null)
    })
  });

  app.post("/organizations/:organizationId/ai/scaffold/apply", { preHandler: [authenticate, requirePermission(permissions.listsManage)] }, async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const input = scaffoldApplySchema.parse(request.body);
    const created = await applyScaffold(organizationId, request.auth!.userId, request.auth!.isSuperAdmin, { siteId: input.siteId ?? null, spec: input.spec as unknown as AIScaffoldApplyInput["spec"] });
    return reply.status(201).send(created);
  });

  // --- Reports ---
  app.post("/organizations/:organizationId/ai/report", { preHandler: authenticate }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    const input = reportSchema.parse(request.body);
    return generateReport(organizationId, request.auth!.userId, request.auth!.isSuperAdmin, input.prompt);
  });

  // --- Usage stats ---
  app.get("/organizations/:organizationId/ai/usage", { preHandler: authenticate }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    // Verify membership
    const membership = await prisma.organizationMember.findFirst({
      where: { tenantId: organizationId, userId: request.auth!.userId, status: "ACTIVE" }
    });
    if (!membership) throw new AppError(403, "FORBIDDEN", "You are not a member of this organization.");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayStats, totalStats] = await Promise.all([
      prisma.aIOperation.aggregate({
        where: { tenantId: organizationId, createdAt: { gte: today } },
        _sum: { tokensInput: true, tokensOutput: true, costUsd: true },
        _count: true
      }),
      prisma.aIOperation.aggregate({
        where: { tenantId: organizationId },
        _sum: { tokensInput: true, tokensOutput: true, costUsd: true },
        _count: true
      })
    ]);
    return {
      today: {
        requests: todayStats._count,
        tokensInput: todayStats._sum.tokensInput ?? 0,
        tokensOutput: todayStats._sum.tokensOutput ?? 0,
        costUsd: todayStats._sum.costUsd ?? 0
      },
      total: {
        requests: totalStats._count,
        tokensInput: totalStats._sum.tokensInput ?? 0,
        tokensOutput: totalStats._sum.tokensOutput ?? 0,
        costUsd: totalStats._sum.costUsd ?? 0
      }
    };
  });
};
