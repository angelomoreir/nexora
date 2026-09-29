import type { AnalyticsPeriodDays, OperationalAnalyticsResponse, TaskStatus } from "@nexora/contracts";
import { prisma } from "../../lib/prisma.js";

const DAY_MS = 86_400_000;
const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];

function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function percentage(part: number, total: number): number | null {
  return total === 0 ? null : roundOne((part / total) * 100);
}

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function getOperationalAnalytics(
  organizationId: string,
  days: AnalyticsPeriodDays,
  now = new Date()
): Promise<OperationalAnalyticsResponse> {
  const from = new Date(now.getTime() - (days - 1) * DAY_MS);
  from.setUTCHours(0, 0, 0, 0);

  const [
    documentsCreated,
    tasksCreated,
    tasksCompleted,
    taskStatusRows,
    overdueTasks,
    approvalsDecided,
    pendingApprovals,
    workflowRuns,
    adoptionRows,
    activeActorRows
  ] = await Promise.all([
    prisma.document.findMany({
      where: { tenantId: organizationId, status: "ACTIVE", createdAt: { gte: from, lte: now } },
      select: { createdAt: true }
    }),
    prisma.task.findMany({
      where: { tenantId: organizationId, createdAt: { gte: from, lte: now } },
      select: { createdAt: true }
    }),
    prisma.task.findMany({
      where: { tenantId: organizationId, status: "DONE", completedAt: { gte: from, lte: now } },
      select: { completedAt: true }
    }),
    prisma.task.groupBy({
      by: ["status"],
      where: { tenantId: organizationId },
      _count: { _all: true }
    }),
    prisma.task.count({
      where: {
        tenantId: organizationId,
        status: { in: ["TODO", "IN_PROGRESS", "IN_REVIEW"] },
        dueAt: { lt: now }
      }
    }),
    prisma.approval.findMany({
      where: { tenantId: organizationId, decidedAt: { gte: from, lte: now } },
      select: { status: true, createdAt: true, decidedAt: true }
    }),
    prisma.approval.count({ where: { tenantId: organizationId, status: "PENDING" } }),
    prisma.workflowInstance.findMany({
      where: { tenantId: organizationId, startedAt: { gte: from, lte: now } },
      select: {
        workflowDefinitionId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        workflowDefinition: { select: { name: true } }
      }
    }),
    prisma.auditLog.groupBy({
      by: ["resourceType"],
      where: { tenantId: organizationId, occurredAt: { gte: from, lte: now } },
      _count: { _all: true }
    }),
    prisma.auditLog.findMany({
      where: { tenantId: organizationId, occurredAt: { gte: from, lte: now }, actorId: { not: null } },
      select: { actorId: true },
      distinct: ["actorId"]
    })
  ]);

  const taskCounts = new Map(taskStatusRows.map((row) => [row.status as TaskStatus, row._count._all]));
  const taskStatus = TASK_STATUSES.map((status) => ({ status, count: taskCounts.get(status) ?? 0 }));
  const currentTasks = taskStatus.filter(({ status }) => status !== "CANCELLED").reduce((sum, row) => sum + row.count, 0);
  const currentDoneTasks = taskCounts.get("DONE") ?? 0;

  const approved = approvalsDecided.filter(({ status }) => status === "APPROVED").length;
  const rejected = approvalsDecided.filter(({ status }) => status === "REJECTED").length;
  const approvalDurations = approvalsDecided.flatMap((approval) =>
    approval.decidedAt ? [(approval.decidedAt.getTime() - approval.createdAt.getTime()) / 3_600_000] : []
  );

  const workflowGroups = new Map<string, {
    workflowId: string;
    workflowName: string;
    runs: number;
    completed: number;
    failed: number;
    durations: number[];
  }>();
  for (const instance of workflowRuns) {
    const group = workflowGroups.get(instance.workflowDefinitionId) ?? {
      workflowId: instance.workflowDefinitionId,
      workflowName: instance.workflowDefinition.name,
      runs: 0,
      completed: 0,
      failed: 0,
      durations: []
    };
    group.runs += 1;
    if (instance.status === "COMPLETED") group.completed += 1;
    if (instance.status === "FAILED" || instance.status === "CANCELLED") group.failed += 1;
    if (instance.completedAt) group.durations.push((instance.completedAt.getTime() - instance.startedAt.getTime()) / 3_600_000);
    workflowGroups.set(instance.workflowDefinitionId, group);
  }
  const workflowPerformance = [...workflowGroups.values()]
    .map((group) => ({
      workflowId: group.workflowId,
      workflowName: group.workflowName,
      runs: group.runs,
      completed: group.completed,
      failed: group.failed,
      successRate: percentage(group.completed, group.completed + group.failed),
      avgDurationHours: group.durations.length > 0 ? roundOne(group.durations.reduce((sum, value) => sum + value, 0) / group.durations.length) : null
    }))
    .sort((a, b) => b.runs - a.runs || a.workflowName.localeCompare(b.workflowName));
  const terminalWorkflowRuns = workflowPerformance.reduce((sum, workflow) => sum + workflow.completed + workflow.failed, 0);
  const successfulWorkflowRuns = workflowPerformance.reduce((sum, workflow) => sum + workflow.completed, 0);

  const trendByDay = new Map<string, OperationalAnalyticsResponse["trend"][number]>();
  for (let index = 0; index < days; index += 1) {
    const date = utcDay(new Date(from.getTime() + index * DAY_MS));
    trendByDay.set(date, { date, documentsCreated: 0, tasksCreated: 0, tasksCompleted: 0, approvalsDecided: 0, workflowRuns: 0 });
  }
  for (const document of documentsCreated) {
    const bucket = trendByDay.get(utcDay(document.createdAt));
    if (bucket) bucket.documentsCreated += 1;
  }
  for (const task of tasksCreated) {
    const bucket = trendByDay.get(utcDay(task.createdAt));
    if (bucket) bucket.tasksCreated += 1;
  }
  for (const task of tasksCompleted) {
    if (!task.completedAt) continue;
    const bucket = trendByDay.get(utcDay(task.completedAt));
    if (bucket) bucket.tasksCompleted += 1;
  }
  for (const approval of approvalsDecided) {
    if (!approval.decidedAt) continue;
    const bucket = trendByDay.get(utcDay(approval.decidedAt));
    if (bucket) bucket.approvalsDecided += 1;
  }
  for (const workflow of workflowRuns) {
    const bucket = trendByDay.get(utcDay(workflow.startedAt));
    if (bucket) bucket.workflowRuns += 1;
  }

  return {
    period: { days, from: from.toISOString(), to: now.toISOString(), timezone: "UTC" },
    summary: {
      documentsCreated: documentsCreated.length,
      tasksCreated: tasksCreated.length,
      tasksCompleted: tasksCompleted.length,
      activeUsers: activeActorRows.length,
      overdueTasks,
      currentTaskCompletionRatio: percentage(currentDoneTasks, currentTasks),
      avgApprovalHours: approvalDurations.length > 0 ? roundOne(approvalDurations.reduce((sum, value) => sum + value, 0) / approvalDurations.length) : null,
      workflowRuns: workflowRuns.length,
      workflowSuccessRate: percentage(successfulWorkflowRuns, terminalWorkflowRuns)
    },
    trend: [...trendByDay.values()],
    taskStatus,
    approvalOutcomes: { pending: pendingApprovals, approved, rejected },
    workflowPerformance,
    adoption: adoptionRows
      .map((row) => ({ resourceType: row.resourceType, actions: row._count._all }))
      .sort((a, b) => b.actions - a.actions || a.resourceType.localeCompare(b.resourceType))
      .slice(0, 8)
  };
}
