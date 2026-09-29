import { z } from "zod";

export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]);
export const taskPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  status: taskStatusSchema.default("TODO"),
  priority: taskPrioritySchema.default("NORMAL"),
  startAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  assignedMembershipId: z.string().optional(),
  assignedTeamId: z.string().optional(),
  projectId: z.string().optional(),
  documentId: z.string().optional()
}).refine((value) => {
  if (value.startAt && value.dueAt) return new Date(value.startAt) <= new Date(value.dueAt);
  return true;
}, "Start date must be before or equal to due date");

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  startAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  assignedMembershipId: z.string().nullable().optional(),
  assignedTeamId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  documentId: z.string().nullable().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const listTasksSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  scope: z.enum(["all", "mine"]).default("all"),
  assignedMembershipId: z.string().optional(),
  assignedTeamId: z.string().optional(),
  projectId: z.string().optional(),
  tag: z.string().trim().max(40).optional(),
  sort: z.enum(["title", "dueAt", "priority", "createdAt", "updatedAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().positive().max(200).default(100),
  offset: z.coerce.number().int().nonnegative().default(0)
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000)
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(480).optional(),
  color: z.string().trim().max(20).default("#6366f1")
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(480).optional(),
  color: z.string().trim().max(20).optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");
