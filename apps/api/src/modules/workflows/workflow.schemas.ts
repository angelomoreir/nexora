import { z } from "zod";

export const workflowStepTypeSchema = z.enum([
  "START",
  "CREATE_TASK",
  "SEND_NOTIFICATION",
  "SEND_EMAIL",
  "APPROVAL",
  "CHANGE_STATUS",
  "ASSIGN_USER",
  "CHANGE_FIELD",
  "MOVE_DOCUMENT",
  "CONDITION",
  "END"
]);

export const workflowStepConfigSchema = z.record(z.string(), z.unknown());

export const workflowStepSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().min(0),
  type: workflowStepTypeSchema,
  name: z.string().trim().min(1).max(120),
  config: workflowStepConfigSchema.default({})
});

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  steps: z.array(workflowStepSchema).default([])
}).refine((value) => {
  if (value.steps.length === 0) return true;
  const first = value.steps[0];
  return first?.type === "START";
}, "The first step must be of type START")
  .refine((value) => {
    if (value.steps.length === 0) return true;
    const last = value.steps[value.steps.length - 1];
    return last?.type === "END";
  }, "The last step must be of type END")
  .refine((value) => value.steps.filter((s) => s.type === "START").length <= 1, "There can be at most one START step")
  .refine((value) => value.steps.filter((s) => s.type === "END").length <= 1, "There can be at most one END step");

export const updateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  steps: z.array(workflowStepSchema).optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required")
  .refine((value) => {
    if (!value.steps || value.steps.length === 0) return true;
    return value.steps[0]?.type === "START";
  }, "The first step must be of type START")
  .refine((value) => {
    if (!value.steps || value.steps.length === 0) return true;
    return value.steps[value.steps.length - 1]?.type === "END";
  }, "The last step must be of type END")
  .refine((value) => !value.steps || value.steps.filter((s) => s.type === "START").length <= 1, "There can be at most one START step")
  .refine((value) => !value.steps || value.steps.filter((s) => s.type === "END").length <= 1, "There can be at most one END step");

export const listWorkflowsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional()
});

export const startWorkflowSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({})
});

export const decideApprovalSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(2000).optional()
});

export const listInstancesSchema = z.object({
  status: z.enum(["RUNNING", "WAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  workflowDefinitionId: z.string().optional()
});

// --- Automation: triggers & quick actions ---

export const workflowTriggerEventSchema = z.enum([
  "document.created",
  "document.updated",
  "document.deleted",
  "document.version.added",
  "document.published",
  "list.item.created",
  "task.created",
  "form.submitted"
]);

export const createTriggerSchema = z.object({
  workflowDefinitionId: z.string().min(1),
  event: workflowTriggerEventSchema,
  scopeType: z.enum(["organization", "folder", "list"]).default("organization"),
  scopeId: z.string().min(1).nullable().optional(),
  enabled: z.boolean().default(true)
});

export const updateTriggerSchema = z.object({
  event: workflowTriggerEventSchema.optional(),
  scopeType: z.enum(["organization", "folder", "list"]).optional(),
  scopeId: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const listQuickActionsSchema = z.object({
  targetType: z.enum(["document", "folder"]).optional(),
  folderId: z.string().min(1).optional()
});

export const createQuickActionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetType: z.enum(["document", "folder"]).default("document"),
  workflowDefinitionId: z.string().min(1),
  scopeId: z.string().min(1).nullable().optional()
});

export const runQuickActionSchema = z.object({
  targetId: z.string().min(1)
});
