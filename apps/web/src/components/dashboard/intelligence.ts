import type { DashboardResponse } from "@nexora/contracts";

export type DashboardRecommendationKind = "urgentTasks" | "approvals" | "notifications" | "document" | "invite" | "workflow" | "myDay";

export interface DashboardRecommendationInput {
  urgentTasks: number;
  pendingApprovals: number;
  unreadNotifications: number;
  metrics: DashboardResponse["metrics"];
  permissions: string[];
}

export function getDashboardRecommendation(input: DashboardRecommendationInput): DashboardRecommendationKind {
  if (input.urgentTasks > 0) return "urgentTasks";
  if (input.pendingApprovals > 0) return "approvals";
  if (input.unreadNotifications > 0) return "notifications";
  if (input.metrics.documents === 0 && input.permissions.includes("documents.edit")) return "document";
  if (input.metrics.users <= 1 && input.permissions.includes("users.create")) return "invite";
  if (input.metrics.activeProcesses === 0 && input.permissions.includes("workflows.manage")) return "workflow";
  return "myDay";
}
