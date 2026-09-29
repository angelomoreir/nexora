import type { WorkflowStepDto, WorkflowStepType } from "@nexora/contracts";

export type WorkflowDraftIssueCode = "nameRequired" | "startRequired" | "startFirst" | "startUnique" | "endRequired" | "endLast" | "endUnique" | "stepNameRequired" | "configRequired" | "jumpTargetInvalid";

export interface WorkflowDraftIssue {
  code: WorkflowDraftIssueCode;
  stepIndex?: number;
  fields?: string[];
}

const REQUIRED_CONFIG: Partial<Record<WorkflowStepType, string[]>> = {
  CREATE_TASK: ["title"],
  SEND_NOTIFICATION: ["recipientId", "title", "body"],
  SEND_EMAIL: ["to", "subject", "body"],
  APPROVAL: ["approverId"],
  CHANGE_STATUS: ["status"],
  ASSIGN_USER: ["assignedMembershipId"],
  CHANGE_FIELD: ["field"],
  MOVE_DOCUMENT: ["documentId", "folderId"],
  CONDITION: ["variable", "jumpToOrder"]
};

const JUMP_FIELDS: Partial<Record<WorkflowStepType, readonly string[]>> = {
  CONDITION: ["jumpToOrder"],
  APPROVAL: ["onRejectJumpToOrder"]
};

function isSupplied(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function validateWorkflowDraft(name: string, steps: WorkflowStepDto[]): WorkflowDraftIssue[] {
  const issues: WorkflowDraftIssue[] = [];
  if (!name.trim()) issues.push({ code: "nameRequired" });

  const startIndexes = steps.map((step, index) => (step.type === "START" ? index : -1)).filter((index) => index >= 0);
  if (startIndexes.length === 0) {
    issues.push({ code: "startRequired" });
  } else {
    if (startIndexes[0] !== 0) issues.push({ code: "startFirst" });
    if (startIndexes.length > 1) issues.push({ code: "startUnique" });
  }

  const endIndexes = steps.map((step, index) => (step.type === "END" ? index : -1)).filter((index) => index >= 0);
  if (endIndexes.length === 0) {
    issues.push({ code: "endRequired" });
  } else {
    if (endIndexes[endIndexes.length - 1] !== steps.length - 1) issues.push({ code: "endLast" });
    if (endIndexes.length > 1) issues.push({ code: "endUnique" });
  }

  steps.forEach((step, index) => {
    if (!step.name.trim()) issues.push({ code: "stepNameRequired", stepIndex: index });
    const missing = (REQUIRED_CONFIG[step.type] ?? []).filter((field) => !isSupplied(step.config[field]));
    if (missing.length > 0) issues.push({ code: "configRequired", stepIndex: index, fields: missing });
    for (const key of JUMP_FIELDS[step.type] ?? []) {
      const value = step.config[key];
      if (value === undefined || value === null || value === "") continue;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > steps.length - 1) {
        issues.push({ code: "jumpTargetInvalid", stepIndex: index, fields: [key] });
      }
    }
  });

  return issues;
}
