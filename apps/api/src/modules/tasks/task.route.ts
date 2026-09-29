import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import {
  createCommentSchema,
  createProjectSchema,
  createTaskSchema,
  listTasksSchema,
  updateProjectSchema,
  updateTaskSchema
} from "./task.schemas.js";
import {
  createComment,
  createProject,
  createTask,
  deleteComment,
  deleteProject,
  deleteTask,
  getActor,
  getTask,
  listComments,
  listProjects,
  listTasks,
  updateProject,
  updateTask
} from "./task.service.js";
import { openRealtimeStream } from "../collaboration/realtime.service.js";

const tasksView = [authenticate, requirePermission(permissions.tasksView)];
const tasksManage = [authenticate, requirePermission(permissions.tasksManage)];

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; taskId: string; commentId: string; projectId: string };
}

async function actorFor(request: FastifyRequest) {
  const { organizationId } = params(request);
  return getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const taskRoute: FastifyPluginAsync = async (app) => {
  // --- Tasks ---
  app.get("/organizations/:organizationId/tasks", { preHandler: tasksView }, async (request) => {
    return listTasks(await actorFor(request), listTasksSchema.parse(request.query));
  });

  app.get("/organizations/:organizationId/tasks/:taskId", { preHandler: tasksView }, async (request) => {
    return getTask(await actorFor(request), params(request).taskId);
  });

  app.get(
    "/organizations/:organizationId/tasks/:taskId/events",
    { preHandler: tasksView, config: { rateLimit: false } },
    async (request, reply) => {
      const actor = await actorFor(request);
      const taskId = params(request).taskId;
      await getTask(actor, taskId);
      await openRealtimeStream(request, reply, {
        tenantId: actor.organizationId,
        membershipId: actor.membershipId,
        userId: actor.userId,
        resource: { type: "task", id: taskId }
      });
    }
  );

  app.post("/organizations/:organizationId/tasks", { preHandler: tasksManage }, async (request, reply) => {
    return reply.status(201).send(await createTask(await actorFor(request), createTaskSchema.parse(request.body)));
  });

  app.patch("/organizations/:organizationId/tasks/:taskId", { preHandler: tasksManage }, async (request) => {
    return updateTask(await actorFor(request), params(request).taskId, updateTaskSchema.parse(request.body));
  });

  app.delete("/organizations/:organizationId/tasks/:taskId", { preHandler: tasksManage }, async (request, reply) => {
    await deleteTask(await actorFor(request), params(request).taskId);
    return reply.status(204).send();
  });

  // --- Comments ---
  app.get("/organizations/:organizationId/tasks/:taskId/comments", { preHandler: tasksView }, async (request) => {
    return listComments(await actorFor(request), params(request).taskId);
  });

  app.post("/organizations/:organizationId/tasks/:taskId/comments", { preHandler: tasksManage }, async (request, reply) => {
    return reply.status(201).send(await createComment(await actorFor(request), params(request).taskId, createCommentSchema.parse(request.body).body));
  });

  app.delete("/organizations/:organizationId/tasks/:taskId/comments/:commentId", { preHandler: tasksManage }, async (request, reply) => {
    await deleteComment(await actorFor(request), params(request).taskId, params(request).commentId);
    return reply.status(204).send();
  });

  // --- Projects ---
  app.get("/organizations/:organizationId/projects", { preHandler: tasksView }, async (request) => {
    return listProjects(await actorFor(request));
  });

  app.post("/organizations/:organizationId/projects", { preHandler: tasksManage }, async (request, reply) => {
    return reply.status(201).send(await createProject(await actorFor(request), createProjectSchema.parse(request.body)));
  });

  app.patch("/organizations/:organizationId/projects/:projectId", { preHandler: tasksManage }, async (request) => {
    return updateProject(await actorFor(request), params(request).projectId, updateProjectSchema.parse(request.body));
  });

  app.delete("/organizations/:organizationId/projects/:projectId", { preHandler: tasksManage }, async (request, reply) => {
    await deleteProject(await actorFor(request), params(request).projectId);
    return reply.status(204).send();
  });
};
