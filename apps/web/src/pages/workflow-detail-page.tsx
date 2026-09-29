import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowInstanceStatus, WorkflowStatus, WorkflowStepType } from "@nexora/contracts";
import { Archive, CheckCircle, ChevronDown, ChevronLeft, ChevronUp, Clock, FileText, GitBranch, Pencil, Play, XCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ContextualCopilot } from "../components/ai/contextual-copilot";
import { useWorkspace } from "../components/layout/app-layout";
import { Badge, Button, Dialog, EmptyState, Field, Page, PageHeader, Skeleton, Tabs, Textarea } from "../components/ui";
import { workflowsApi } from "../lib/api";
import { useLocaleFormatter } from "../lib/format";

const STATUS_VARIANT: Record<WorkflowInstanceStatus, "info" | "warning" | "success" | "danger" | "neutral"> = { RUNNING: "info", WAITING_APPROVAL: "warning", COMPLETED: "success", FAILED: "danger", CANCELLED: "neutral" };
const WORKFLOW_STATUS_VARIANT: Record<WorkflowStatus, "neutral" | "success" | "warning"> = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "warning" };
const EXEC_STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "danger" | "neutral"> = { PENDING: "neutral", RUNNING: "info", COMPLETED: "success", FAILED: "danger", SKIPPED: "neutral" };
const APPROVAL_STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "danger" | "neutral"> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger" };

export function WorkflowDetailPage() {
  const { t } = useTranslation();
  const { id: workflowId = "" } = useParams();
  const { organization, session } = useWorkspace();
  const { formatDateTime } = useLocaleFormatter();
  const STATUS_LABELS: Record<WorkflowInstanceStatus, string> = { RUNNING: t("workflows.inExecution"), WAITING_APPROVAL: t("workflows.awaitingApproval"), COMPLETED: t("tasks.completed"), FAILED: t("workflows.failed"), CANCELLED: t("common.cancelled") };
const STEP_LABELS: Record<WorkflowStepType, string> = { START: t("workflows.start"), CREATE_TASK: t("dashboard.createTask"), SEND_NOTIFICATION: t("workflows.sendNotification"), SEND_EMAIL: t("workflows.sendEmail"), APPROVAL: t("workflows.approval"), CHANGE_STATUS: t("workflows.changeStatus"), ASSIGN_USER: t("workflows.assignUser"), CHANGE_FIELD: t("workflows.changeField"), MOVE_DOCUMENT: t("workflows.moveDocument"), CONDITION: t("workflows.condition"), END: t("workflows.end") };
const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = { DRAFT: t("common.draft"), PUBLISHED: t("common.published"), ARCHIVED: t("common.archived") };
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "instances">("overview");
  const [startDialog, setStartDialog] = useState(false);
  const [expandedInstanceId, setExpandedInstanceId] = useState<string | null>(null);

  const canManage = organization.permissions.includes("workflows.manage");
  const canDecide = organization.permissions.includes("approvals.manage");

  const workflowQuery = useQuery({ queryKey: ["workflow", organization.id, workflowId], queryFn: () => workflowsApi.get(organization.id, workflowId) });
  const instancesQuery = useQuery({ queryKey: ["workflow-instances", organization.id, workflowId], queryFn: () => workflowsApi.instances(organization.id, { workflowDefinitionId: workflowId }) });

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["workflow", organization.id, workflowId] }); queryClient.invalidateQueries({ queryKey: ["workflow-instances", organization.id, workflowId] }); };
  const publishMutation = useMutation({ mutationFn: () => workflowsApi.publish(organization.id, workflowId), onSuccess: refresh });
  const archiveMutation = useMutation({ mutationFn: () => workflowsApi.archive(organization.id, workflowId), onSuccess: refresh });
  const unpublishMutation = useMutation({ mutationFn: () => workflowsApi.unpublish(organization.id, workflowId), onSuccess: refresh });
  const startMutation = useMutation({ mutationFn: (input: Record<string, unknown>) => workflowsApi.start(organization.id, workflowId, input), onSuccess: async () => { setStartDialog(false); await refresh(); setTab("instances"); } });

  const workflow = workflowQuery.data;
  const instances = instancesQuery.data?.instances ?? [];

  if (workflowQuery.isPending) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.workflows")} title={t("workflows.detailTitle")} />
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </Page>
    );
  }

  if (workflowQuery.isError || !workflow) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.workflows")} title={t("workflows.detailTitle")} />
        <EmptyState icon={GitBranch} title={t("workflows.workflowNotFound")} description={t("workflows.errorLoadingWorkflow")} action={<Button variant="outline" onClick={() => navigate("/workflows")}>{t("workflows.backToWorkflows")}</Button>} />
      </Page>
    );
  }

  return (
    <Page>
      <button className="inline-flex items-center text-sm text-secondary-foreground transition-colors hover:text-foreground nx-focus-ring" onClick={() => navigate("/workflows")}>
        <ChevronLeft className="mr-1 size-4" />Workflows
      </button>

      <PageHeader
        eyebrow={t("workflows.processEyebrow")}
        title={workflow.name}
        description={workflow.description ?? undefined}
        actions={<div className="flex flex-wrap items-center gap-2">
          <ContextualCopilot organizationId={organization.id} resourceType="workflow" resourceId={workflowId} resourceName={workflow.name} />
          {canManage ? <Button variant="outline" size="sm" onClick={() => navigate(`/workflows/${workflowId}/builder`)}><FileText className="size-3.5" />{t("workflows.builder")}</Button> : null}
          {canManage && workflow.status === "DRAFT" ? <Button variant="outline" size="sm" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}><CheckCircle className="size-3.5" />{t("forms.publish")}</Button> : null}
          {canManage && workflow.status === "PUBLISHED" ? <Button variant="outline" size="sm" onClick={() => setStartDialog(true)}><Play className="size-3.5" />{t("workflows.start")}</Button> : null}
          {canManage && workflow.status === "PUBLISHED" ? <Button variant="outline" size="sm" onClick={() => unpublishMutation.mutate()} disabled={unpublishMutation.isPending}><Pencil className="size-3.5" />{t("workflows.unpublish")}</Button> : null}
          {canManage && workflow.status === "PUBLISHED" ? <Button variant="outline" size="sm" onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}><Archive className="size-3.5" />{t("workflows.archive")}</Button> : null}
        </div>}
      />

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Badge variant={WORKFLOW_STATUS_VARIANT[workflow.status]}>{WORKFLOW_STATUS_LABEL[workflow.status]}</Badge>
        <span>v{workflow.version}</span>
        <span>{workflow.steps.length} {t("workflows.steps").toLowerCase()}</span>
        <span>{workflow.instanceCount} {t("workflows.instanceCount")}</span>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "overview" | "instances")}
        items={[{ value: "overview", label: t("workflows.overview") }, { value: "instances", label: t("workflows.instancesTab", { count: instances.length }) }]}
      />

      {tab === "overview" ? (
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="nx-h3 mb-4">{t("workflows.stepsTitle")}</h2>
          {workflow.steps.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("workflows.noStepsDesc")}</p>
          ) : (
            <ol className="space-y-2">
              {workflow.steps.map((step, index) => (
                <li key={step.id} className="flex items-center gap-3 rounded-md border border-border bg-surface-secondary p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-xs font-medium text-muted-foreground">{index}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{step.name}</p>
                    <p className="text-xs text-muted-foreground">{STEP_LABELS[step.type]}</p>
                  </div>
                  {Object.keys(step.config).length > 0 ? <Badge variant="outline">{t("workflows.configKeys", { count: Object.keys(step.config).length })}</Badge> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {tab === "instances" ? (
        instances.length === 0 ? (
          <EmptyState icon={Play} title={t("workflows.noExecutions")} description={workflow.status === "PUBLISHED" ? t("workflows.startWorkflowToCreate") : t("workflows.publishFirst")} action={canManage && workflow.status === "PUBLISHED" ? <Button onClick={() => setStartDialog(true)}><Play className="size-4" />{t("workflows.startWorkflow")}</Button> : undefined} />
        ) : (
          <div className="space-y-3">
            {instances.map((instance) => {
              const expanded = expandedInstanceId === instance.id;
              const completedCount = instance.executions.filter((exec) => exec.status === "COMPLETED").length;
              const totalCount = instance.steps.length || instance.executions.length;
              const pendingApproval = instance.approvals.find((a) => a.status === "PENDING");
              const canDecidePending = canDecide && pendingApproval && (
                pendingApproval.approver.id === session.user.id || organization.roles.includes("Super Admin")
              );
              return (
                <article key={instance.id} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <Badge variant={STATUS_VARIANT[instance.status]}>{STATUS_LABELS[instance.status]}</Badge>
                      <span className="text-sm text-secondary-foreground">{t("workflows.startedBy", { name: instance.startedBy.name })}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" />{formatDateTime(instance.startedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("workflows.stepOrder", { order: instance.currentStepOrder })}</span>
                      <Button variant="ghost" size="icon-sm" aria-expanded={expanded} aria-controls={`instance-${instance.id}`} aria-label={t("workflows.executionDetails")} title={t("workflows.executionDetails")}
                        onClick={() => setExpandedInstanceId(expanded ? null : instance.id)}>
                        {expanded ? <ChevronUp /> : <ChevronDown />}
                      </Button>
                    </div>
                  </div>
                  {instance.errorMessage ? <p className="mt-2 text-sm text-danger">{instance.errorMessage}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {instance.executions.map((exec) => (
                      <Badge key={exec.id} variant={EXEC_STATUS_VARIANT[exec.status] ?? "neutral"} title={`${exec.stepName} (${exec.stepType})`}>
                        {exec.stepOrder}:{exec.stepName}
                      </Badge>
                    ))}
                  </div>
                  {instance.approvals.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {instance.approvals.map((approval) => (
                        <span key={approval.id} className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs ${approval.status === "PENDING" ? "bg-warning-subtle text-warning" : approval.status === "APPROVED" ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>
                          {approval.status === "APPROVED" ? <CheckCircle className="size-3" /> : approval.status === "REJECTED" ? <XCircle className="size-3" /> : <Clock className="size-3" />}
                          {approval.approver.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {canDecidePending && instance.status === "WAITING_APPROVAL" ? (
                    <div className="mt-3 flex gap-2 border-t border-border pt-2">
                      <Button variant="outline" size="sm" onClick={() => { void workflowsApi.decideApproval(organization.id, pendingApproval.id, "APPROVED").then(refresh); }}><CheckCircle className="size-3.5" />{t("approvals.approve")}</Button>
                      <Button variant="outline" size="sm" onClick={() => { void workflowsApi.decideApproval(organization.id, pendingApproval.id, "REJECTED").then(refresh); }}><XCircle className="size-3.5" />{t("approvals.reject")}</Button>
                    </div>
                  ) : null}
                  {expanded ? (
                    <div id={`instance-${instance.id}`} className="mt-3 space-y-4 border-t border-border pt-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("workflows.executionProgress", { completed: completedCount, total: totalCount })}</p>
                      <div>
                        <h3 className="nx-label mb-2 text-muted-foreground">{t("workflows.executionDetails")}</h3>
                        <ol className="space-y-2">
                          {instance.executions.map((exec) => (
                            <li key={`detail-${exec.id}`} className="rounded-md border border-border bg-surface-secondary/50 p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">#{exec.stepOrder}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-foreground">{exec.stepName}</span>
                                  <span className="block text-xs text-muted-foreground">{STEP_LABELS[exec.stepType] ?? exec.stepType}</span>
                                </span>
                                <Badge variant={EXEC_STATUS_VARIANT[exec.status] ?? "neutral"}>{exec.status}</Badge>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>{formatDateTime(exec.startedAt)}</span>
                                {exec.completedAt ? <span>→ {formatDateTime(exec.completedAt)}</span> : null}
                              </div>
                              {exec.errorMessage ? <p className="mt-2 text-xs text-danger">{exec.errorMessage}</p> : null}
                              <p className="nx-label mt-2 text-muted-foreground">{t("workflows.executionResult")}</p>
                              {exec.result && Object.keys(exec.result).length > 0 ? (
                                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-surface p-2 text-xs text-secondary-foreground">{JSON.stringify(exec.result, null, 2)}</pre>
                              ) : (
                                <p className="mt-1 text-xs text-muted-foreground">{t("workflows.noExecutionResult")}</p>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>
                      {instance.approvals.length > 0 ? (
                        <div>
                          <h3 className="nx-label mb-2 text-muted-foreground">{t("approvals.title")}</h3>
                          <ul className="space-y-2">
                            {instance.approvals.map((approval) => (
                              <li key={`approval-${approval.id}`} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-secondary/50 p-3 text-sm">
                                <span className="font-medium text-foreground">{approval.approver.name}</span>
                                <Badge variant={APPROVAL_STATUS_VARIANT[approval.status] ?? "neutral"}>{approval.status}</Badge>
                                {approval.decidedAt ? <span className="text-xs text-muted-foreground">{formatDateTime(approval.decidedAt)}</span> : null}
                                {approval.decisionNote ? <span className="w-full text-xs text-muted-foreground">{approval.decisionNote}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div>
                        <h3 className="nx-label mb-1 text-muted-foreground">{t("workflows.executionResult")}</h3>
                        {instance.output && Object.keys(instance.output).length > 0 ? (
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-surface-secondary p-2 text-xs text-secondary-foreground">{JSON.stringify(instance.output, null, 2)}</pre>
                        ) : (
                          <p className="text-xs text-muted-foreground">{t("workflows.noExecutionResult")}</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )
      ) : null}

      {startDialog ? <StartDialog onClose={() => setStartDialog(false)} onSubmit={(input) => startMutation.mutate(input)} isPending={startMutation.isPending} /> : null}
    </Page>
  );
}

function StartDialog({onClose, onSubmit, isPending }: { onClose: () => void; onSubmit: (input: Record<string, unknown>) => void; isPending: boolean }) {
  const { t } = useTranslation();
  const [inputJson, setInputJson] = useState("{}");
  function submit() {
    try { onSubmit(JSON.parse(inputJson)); } catch { alert(t("workflows.invalidJson")); }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t("workflows.startWorkflow")} description={t("workflows.provideJsonInput")} footer={<><Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={submit} disabled={isPending}><Play className="size-4" />{isPending ? t("common.starting") : t("workflows.start")}</Button></>}>
      <Field label={t("workflows.inputData")} htmlFor="workflow-input">
        <Textarea id="workflow-input" className="min-h-32 font-mono" value={inputJson} onChange={(e) => setInputJson(e.target.value)} />
      </Field>
    </Dialog>
  );
}
