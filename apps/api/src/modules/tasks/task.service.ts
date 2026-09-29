import type {
  ProjectDto,
  ProjectsResponse,
  TaskCommentDto,
  TaskDto,
  TaskPriority,
  TaskStatus,
  TaskSummaryDto,
  TasksResponse
} from "@nexora/contracts";
import type { Task, TaskComment, Project } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { notify, resolveMentions } from "../notifications/notification.service.js";
import { permissions } from "../permissions/permissions.js";
import { publishResourceEvent } from "../collaboration/realtime.service.js";
import { dispatchToSubscribers, type SubscriptionDispatchPayload } from "../subscriptions/subscription.service.js";
import { fireWorkflowEvent } from "../workflows/automation.service.js";

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

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type TaskWithRelations = Task & {
  assignedMembership: { id: string; userId: string; user: { id: string; name: string; avatar: string | null } } | null;
  assignedTeam: { id: string; name: string } | null;
  project: { id: string; name: string; color: string } | null;
  document: { id: string; name: string } | null;
  creator: { id: string; name: string; avatar: string | null };
  comments: (TaskComment & { author: { id: string; name: string; avatar: string | null } })[];
};

function toSummaryDto(task: TaskWithRelations): TaskSummaryDto {
  return {
    id: task.id,
    title: task.title,
    status: task.status as TaskStatus,
    priority: task.priority as TaskPriority,
    startAt: task.startAt?.toISOString() ?? null,
    dueAt: task.dueAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    tags: parseTags(task.tagsJson),
    assignee: task.assignedMembership ? { id: task.assignedMembership.user.id, name: task.assignedMembership.user.name, avatar: task.assignedMembership.user.avatar } : null,
    team: task.assignedTeam,
    project: task.project,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };
}

function toDetailDto(task: TaskWithRelations): TaskDto {
  return {
    ...toSummaryDto(task),
    description: task.description,
    document: task.document,
    creator: task.creator,
    comments: task.comments.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString()
    }))
  };
}

function toProjectDto(project: Project & { _count?: { tasks: number } }): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    taskCount: project._count?.tasks ?? 0,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export interface ListTasksInput {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  scope: "all" | "mine";
  assignedMembershipId?: string;
  assignedTeamId?: string;
  projectId?: string;
  tag?: string;
  sort: "title" | "dueAt" | "priority" | "createdAt" | "updatedAt";
  order: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export async function listTasks(actor: ActorContext, input: ListTasksInput): Promise<TasksResponse> {
  const where = {
    tenantId: actor.organizationId,
    title: input.search ? { contains: input.search, mode: "insensitive" as const } : undefined,
    status: input.status,
    priority: input.priority,
    assignedMembershipId: input.scope === "mine" ? actor.membershipId : input.assignedMembershipId,
    assignedTeamId: input.assignedTeamId,
    projectId: input.projectId
  };

  // Use DB-level sorting where possible; fall back to in-memory only for tag filtering
  const sortField = input.sort ?? "createdAt";
  const sortOrder = input.order === "asc" ? "asc" : "desc";
  const orderBy: Record<string, "asc" | "desc"> = {};
  if (sortField === "title" || sortField === "dueAt" || sortField === "priority" || sortField === "updatedAt" || sortField === "createdAt") {
    orderBy[sortField] = sortOrder;
  } else {
    orderBy.createdAt = sortOrder;
  }

  const take = Math.min(input.limit ?? 100, 200);
  const skip = input.offset ?? 0;

  let tasks = await prisma.task.findMany({
    where,
    include: {
      assignedMembership: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      assignedTeam: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, color: true } },
      document: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, avatar: true } }
    },
    orderBy,
    take: input.tag ? undefined : take,
    skip: input.tag ? undefined : skip
  }) as TaskWithRelations[];

  // Filter by tag in application (tags stored as JSON) — only when tag filter is applied
  if (input.tag) {
    tasks = tasks.filter((t) => parseTags(t.tagsJson).includes(input.tag!));
    // In-memory sort for tag-filtered results
    const dir = input.order === "asc" ? 1 : -1;
    tasks.sort((a, b) => {
      switch (input.sort) {
        case "title": return a.title.localeCompare(b.title) * dir;
        case "dueAt": {
          const av = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
          const bv = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
          return (av - bv) * dir;
        }
        case "priority": return (PRIORITY_ORDER[a.priority as TaskPriority] - PRIORITY_ORDER[b.priority as TaskPriority]) * dir;
        case "updatedAt": return (a.updatedAt.getTime() - b.updatedAt.getTime()) * dir;
        default: return (a.createdAt.getTime() - b.createdAt.getTime()) * dir;
      }
    });
    const total = tasks.length;
    tasks = tasks.slice(skip, skip + take);
    return { tasks: tasks.map(toSummaryDto), total };
  }

  const total = await prisma.task.count({ where });
  return { tasks: tasks.map(toSummaryDto), total };
}

export async function getTask(actor: ActorContext, taskId: string): Promise<TaskDto> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId: actor.organizationId },
    include: {
      assignedMembership: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      assignedTeam: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, color: true } },
      document: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, avatar: true } },
      comments: { include: { author: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: "asc" } }
    }
  }) as TaskWithRelations | null;
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "The task was not found.");
  return toDetailDto(task);
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  startAt?: string;
  dueAt?: string;
  tags: string[];
  assignedMembershipId?: string;
  assignedTeamId?: string;
  projectId?: string;
  documentId?: string;
}

export async function createTask(actor: ActorContext, input: CreateTaskInput): Promise<TaskDto> {
  await validateReferences(actor, input);

  const task = await prisma.task.create({
    data: {
      tenantId: actor.organizationId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      startAt: input.startAt ? new Date(input.startAt) : null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      completedAt: input.status === "DONE" ? new Date() : null,
      tagsJson: JSON.stringify(input.tags),
      assignedMembershipId: input.assignedMembershipId,
      assignedTeamId: input.assignedTeamId,
      projectId: input.projectId,
      documentId: input.documentId,
      createdById: actor.userId
    },
    include: {
      assignedMembership: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      assignedTeam: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, color: true } },
      document: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, avatar: true } },
      comments: { include: { author: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: "asc" } }
    }
  }) as TaskWithRelations;

  await audit(actor, "task.created", task.id, { title: task.title });
  if (input.assignedMembershipId) {
    await notifyAssignment(actor, task, input.assignedMembershipId);
  }
  await safeDispatchWebhooks(actor.organizationId, "task.created", { taskId: task.id, title: task.title });
  await fireWorkflowEvent(actor, "task.created", { taskId: task.id, title: task.title });
  return toDetailDto(task);
}

export async function updateTask(actor: ActorContext, taskId: string, input: { title?: string; description?: string; status?: TaskStatus; priority?: TaskPriority; startAt?: string | null; dueAt?: string | null; tags?: string[]; assignedMembershipId?: string | null; assignedTeamId?: string | null; projectId?: string | null; documentId?: string | null }): Promise<TaskDto> {
  const existing = await prisma.task.findFirst({ where: { id: taskId, tenantId: actor.organizationId } });
  if (!existing) throw new AppError(404, "TASK_NOT_FOUND", "The task was not found.");

  await validateReferences(actor, input);

  const wasAssigned = existing.assignedMembershipId;
  const willAssign = input.assignedMembershipId !== undefined ? input.assignedMembershipId : wasAssigned;

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      title: input.title,
      description: input.description,
      status: input.status,
      completedAt: input.status === undefined ? undefined : input.status === "DONE" ? (existing.completedAt ?? new Date()) : null,
      priority: input.priority,
      startAt: input.startAt === null ? null : input.startAt ? new Date(input.startAt) : undefined,
      dueAt: input.dueAt === null ? null : input.dueAt ? new Date(input.dueAt) : undefined,
      tagsJson: input.tags ? JSON.stringify(input.tags) : undefined,
      assignedMembershipId: input.assignedMembershipId === null ? null : input.assignedMembershipId,
      assignedTeamId: input.assignedTeamId === null ? null : input.assignedTeamId,
      projectId: input.projectId === null ? null : input.projectId,
      documentId: input.documentId === null ? null : input.documentId
    },
    include: {
      assignedMembership: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      assignedTeam: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, color: true } },
      document: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, avatar: true } },
      comments: { include: { author: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: "asc" } }
    }
  }) as TaskWithRelations;

  await audit(actor, "task.updated", taskId, { title: updated.title, status: updated.status, priority: updated.priority });

  // Notify on new assignment (different from previous)
  if (willAssign && willAssign !== wasAssigned) {
    await notifyAssignment(actor, updated, willAssign);
  }
  await safeDispatch(actor.organizationId, "task", taskId, "updated", {
    actorMembershipId: actor.membershipId,
    title: "Tarefa atualizada",
    body: `A tarefa "${updated.title}" foi atualizada.`,
    data: { taskId }
  });
  await safeDispatchWebhooks(actor.organizationId, "task.updated", { taskId, title: updated.title, status: updated.status });
  publishResourceEvent(actor.organizationId, "task", taskId, "resource.updated");
  return toDetailDto(updated);
}

export async function deleteTask(actor: ActorContext, taskId: string): Promise<void> {
  const task = await prisma.task.findFirst({ where: { id: taskId, tenantId: actor.organizationId } });
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "The task was not found.");
  await prisma.task.delete({ where: { id: taskId } });
  await audit(actor, "task.deleted", taskId, { title: task.title });
}

export async function createComment(actor: ActorContext, taskId: string, body: string): Promise<TaskCommentDto> {
  const task = await prisma.task.findFirst({ where: { id: taskId, tenantId: actor.organizationId }, include: { creator: { select: { id: true, name: true } } } });
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "The task was not found.");

  const comment = await prisma.taskComment.create({
    data: { tenantId: actor.organizationId, taskId, authorId: actor.userId, body },
    include: { author: { select: { id: true, name: true, avatar: true } } }
  });
  await audit(actor, "task.commented", taskId, { body: body.slice(0, 100) });
  publishResourceEvent(actor.organizationId, "task", taskId, "comment.created", { userId: actor.userId, name: comment.author.name, avatar: comment.author.avatar });

  const mentions = await resolveMentions(actor.organizationId, body, permissions.tasksView);
  const mentionIds = new Set(mentions.map((mention) => mention.membershipId));
  const notified = new Set<string>([actor.membershipId]);
  for (const mention of mentions) {
    if (notified.has(mention.membershipId)) continue;
    notified.add(mention.membershipId);
    await notify({
      tenantId: actor.organizationId,
      recipientId: mention.membershipId,
      type: "user.mentioned",
      title: "Foi mencionado",
      body: `${comment.author.name} mencionou-o na tarefa "${task.title}".`,
      data: { taskId, commentId: comment.id, mentionedName: mention.name }
    });
  }

  const genericRecipients = new Set<string>();
  if (task.assignedMembershipId) genericRecipients.add(task.assignedMembershipId);
  if (task.createdById && task.createdById !== actor.userId) {
    const creatorMembership = await prisma.organizationMember.findFirst({ where: { tenantId: actor.organizationId, userId: task.createdById, status: "ACTIVE" } });
    if (creatorMembership) genericRecipients.add(creatorMembership.id);
  }
  for (const recipientId of genericRecipients) {
    if (notified.has(recipientId) || mentionIds.has(recipientId)) continue;
    notified.add(recipientId);
    await notify({
      tenantId: actor.organizationId,
      recipientId,
      type: "task.commented",
      title: "Novo comentário na tarefa",
      body: `${comment.author.name} comentou na tarefa "${task.title}".`,
      data: { taskId, commentId: comment.id }
    });
  }

  await safeDispatch(actor.organizationId, "task", taskId, "commented", {
    actorMembershipId: actor.membershipId,
    title: "Novo comentário na tarefa",
    body: `${comment.author.name} comentou na tarefa "${task.title}".`,
    data: { taskId, commentId: comment.id }
  });
  await safeDispatchWebhooks(actor.organizationId, "task.commented", { taskId, commentId: comment.id });

  return {
    id: comment.id,
    body: comment.body,
    author: comment.author,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString()
  };
}

export async function listComments(actor: ActorContext, taskId: string): Promise<TaskCommentDto[]> {
  const task = await prisma.task.findFirst({ where: { id: taskId, tenantId: actor.organizationId } });
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "The task was not found.");
  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    include: { author: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: "asc" }
  });
  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    author: c.author,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString()
  }));
}

export async function deleteComment(actor: ActorContext, taskId: string, commentId: string): Promise<void> {
  const comment = await prisma.taskComment.findFirst({ where: { id: commentId, taskId, tenantId: actor.organizationId } });
  if (!comment) throw new AppError(404, "COMMENT_NOT_FOUND", "The comment was not found.");
  if (comment.authorId !== actor.userId && !actor.isSuperAdmin) {
    throw new AppError(403, "FORBIDDEN", "You can only delete your own comments.");
  }
  await prisma.taskComment.delete({ where: { id: commentId } });
  publishResourceEvent(actor.organizationId, "task", taskId, "comment.deleted");
}

// --- Projects ---

export async function listProjects(actor: ActorContext): Promise<ProjectsResponse> {
  const projects = await prisma.project.findMany({
    where: { tenantId: actor.organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { tasks: true } } }
  });
  return { projects: projects.map(toProjectDto), total: projects.length };
}

export async function createProject(actor: ActorContext, input: { name: string; description?: string; color: string }): Promise<ProjectDto> {
  const existing = await prisma.project.findFirst({ where: { tenantId: actor.organizationId, name: input.name } });
  if (existing) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A project with this name already exists.");
  const project = await prisma.project.create({
    data: {
      tenantId: actor.organizationId,
      name: input.name,
      description: input.description,
      color: input.color,
      createdById: actor.userId
    },
    include: { _count: { select: { tasks: true } } }
  });
  await audit(actor, "project.created", project.id, { name: project.name });
  return toProjectDto(project);
}

export async function updateProject(actor: ActorContext, projectId: string, input: { name?: string; description?: string; color?: string }): Promise<ProjectDto> {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: actor.organizationId } });
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "The project was not found.");
  if (input.name && input.name !== project.name) {
    const clash = await prisma.project.findFirst({ where: { tenantId: actor.organizationId, name: input.name, NOT: { id: projectId } } });
    if (clash) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A project with this name already exists.");
  }
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { name: input.name, description: input.description, color: input.color },
    include: { _count: { select: { tasks: true } } }
  });
  return toProjectDto(updated);
}

export async function deleteProject(actor: ActorContext, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: actor.organizationId } });
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "The project was not found.");
  await prisma.project.delete({ where: { id: projectId } });
  await audit(actor, "project.deleted", projectId, { name: project.name });
}

// --- Helpers ---

async function validateReferences(actor: ActorContext, input: { assignedMembershipId?: string | null; assignedTeamId?: string | null; projectId?: string | null; documentId?: string | null }) {
  if (input.assignedMembershipId) {
    const membership = await prisma.organizationMember.findFirst({ where: { id: input.assignedMembershipId, tenantId: actor.organizationId, status: "ACTIVE" } });
    if (!membership) throw new AppError(400, "VALIDATION_ERROR", "The assignee is not a member of this organization.");
  }
  if (input.assignedTeamId) {
    const team = await prisma.team.findFirst({ where: { id: input.assignedTeamId, tenantId: actor.organizationId } });
    if (!team) throw new AppError(400, "VALIDATION_ERROR", "The team was not found in this organization.");
  }
  if (input.projectId) {
    const project = await prisma.project.findFirst({ where: { id: input.projectId, tenantId: actor.organizationId } });
    if (!project) throw new AppError(400, "VALIDATION_ERROR", "The project was not found in this organization.");
  }
  if (input.documentId) {
    const doc = await prisma.document.findFirst({ where: { id: input.documentId, tenantId: actor.organizationId, status: "ACTIVE" } });
    if (!doc) throw new AppError(400, "VALIDATION_ERROR", "The document was not found in this organization.");
  }
}

async function notifyAssignment(actor: ActorContext, task: TaskWithRelations, membershipId: string) {
  if (membershipId === actor.membershipId) return; // Don't notify self
  await prisma.notification.create({
    data: {
      tenantId: actor.organizationId,
      recipientId: membershipId,
      type: "task.assigned",
      title: "Nova tarefa atribuída",
      body: `Foi-lhe atribuída a tarefa "${task.title}".`,
      dataJson: JSON.stringify({ taskId: task.id, title: task.title })
    }
  });
}

// Subscription fan-out must never break the main operation.
async function safeDispatch(tenantId: string, targetType: "folder" | "document" | "list" | "task" | "project", targetId: string, event: string, payload: SubscriptionDispatchPayload) {
  try {
    await dispatchToSubscribers(tenantId, targetType, targetId, event, payload);
  } catch (error) {
    console.error("subscription dispatch failed", error);
  }
}

// Webhook fan-out must never break the main operation either.
async function safeDispatchWebhooks(tenantId: string, event: string, payload: Record<string, unknown>) {
  try {
    const { dispatchWebhooks } = await import("../webhooks/webhook.service.js");
    await dispatchWebhooks(tenantId, event, payload);
  } catch (error) {
    console.error("webhook dispatch failed", error);
  }
}

async function audit(actor: ActorContext, action: string, resourceId: string, context?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      tenantId: actor.organizationId,
      actorId: actor.membershipId,
      action,
      resourceType: "task",
      resourceId,
      contextJson: context ? JSON.stringify(context) : null
    }
  });
}
