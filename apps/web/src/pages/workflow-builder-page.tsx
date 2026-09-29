import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutomationResourcesResponse, WorkflowStepDto, WorkflowStepType } from "@nexora/contracts";
import {
  ArrowDown, ArrowLeft, ArrowRight, Bell, Braces, CheckSquare, ChevronDown, ChevronLeft, ChevronUp, Copy, FileInput,
  Flag, FolderInput, GripVertical, LogOut, Mail, Pencil, Play, RotateCcw, Save, Trash2, UserCog
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, EmptyState, Input, Page, PageHeader, PageSection, Select, Skeleton, Textarea, useConfirm } from "../components/ui";
import { validateWorkflowDraft, type WorkflowDraftIssue } from "../components/workflows/workflow-draft";
import { automationApi, workflowsApi, type WorkflowStepInput } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

const STEP_ICON: Record<WorkflowStepType, ComponentType<{ className?: string }>> = {
  START: Play, CREATE_TASK: CheckSquare, SEND_NOTIFICATION: Bell, SEND_EMAIL: Mail,
  APPROVAL: Flag, CHANGE_STATUS: ArrowLeft, ASSIGN_USER: UserCog, CHANGE_FIELD: Pencil,
  MOVE_DOCUMENT: FolderInput, CONDITION: Braces, END: LogOut
};

const PALETTE_GROUPS: { labelKey: string; types: WorkflowStepType[] }[] = [
  { labelKey: "paletteControl", types: ["START", "CONDITION", "END"] },
  { labelKey: "paletteWork", types: ["CREATE_TASK", "APPROVAL"] },
  { labelKey: "paletteCommunication", types: ["SEND_NOTIFICATION", "SEND_EMAIL"] },
  { labelKey: "paletteData", types: ["CHANGE_STATUS", "ASSIGN_USER", "CHANGE_FIELD", "MOVE_DOCUMENT"] }
];

const CONFIG_FIELD_KEYS: Record<string, string> = {
  title: "dashboard.taskTitle", recipientId: "workflows.recipientId", body: "workflows.bodyLabel",
  to: "workflows.toLabel", subject: "workflows.subjectLabel", approverId: "workflows.approverIdLabel",
  status: "workflows.newStatus", assignedMembershipId: "workflows.memberIdLabel", field: "workflows.fieldLabel",
  documentId: "workflows.documentIdLabel", folderId: "workflows.folderIdLabel", variable: "workflows.contextVariable",
  jumpToOrder: "workflows.jumpToStep", onRejectJumpToOrder: "workflows.rejectionSkipStep"
};

interface DraftSnapshot {
  name: string;
  description: string;
  steps: WorkflowStepDto[];
}

function normalize(snapshot: DraftSnapshot): string {
  return JSON.stringify({
    name: snapshot.name,
    description: snapshot.description,
    steps: snapshot.steps.map((step) => ({ type: step.type, name: step.name, config: step.config }))
  });
}

export function WorkflowBuilderPage() {
  const { t } = useTranslation();
  const STEP_LABELS: Record<WorkflowStepType, string> = {
    START: t("workflows.start"), CREATE_TASK: t("dashboard.createTask"), SEND_NOTIFICATION: t("workflows.sendNotification"),
    SEND_EMAIL: t("workflows.sendEmail"), APPROVAL: t("workflows.approval"), CHANGE_STATUS: t("workflows.changeStatus"),
    ASSIGN_USER: t("workflows.assignUser"), CHANGE_FIELD: t("workflows.changeField"), MOVE_DOCUMENT: t("workflows.moveDocument"),
    CONDITION: t("workflows.condition"), END: t("workflows.end")
  };
  const { id: workflowId = "" } = useParams();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { confirm, confirmDialog } = useConfirm();
  const [steps, setSteps] = useState<WorkflowStepDto[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [initial, setInitial] = useState<DraftSnapshot | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const initializedWorkflowId = useRef<string | null>(null);

  const workflowQuery = useQuery({
    queryKey: ["workflow", organization.id, workflowId],
    queryFn: () => workflowsApi.get(organization.id, workflowId),
    enabled: !!workflowId
  });

  const canManage = organization.permissions.includes("workflows.manage");
  const resources = useQuery({ queryKey: ["automation-resources", organization.id], queryFn: () => automationApi.resources(organization.id), enabled: canManage });

  const workflow = workflowQuery.data;

  useEffect(() => {
    if (workflow && initializedWorkflowId.current !== workflow.id) {
      setSteps(workflow.steps);
      setName(workflow.name);
      setDescription(workflow.description ?? "");
      setInitial({ name: workflow.name, description: workflow.description ?? "", steps: workflow.steps });
      setDragIndex(null);
      setDropTarget(null);
      initializedWorkflowId.current = workflow.id;
    }
  }, [workflow]);

  const locked = workflow !== undefined && (workflow.status !== "DRAFT" || !canManage);
  const dirty = useMemo(() => initial !== null && normalize({ name, description, steps }) !== normalize(initial), [initial, name, description, steps]);
  const issues = useMemo(() => validateWorkflowDraft(name, steps), [name, steps]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const saveMutation = useMutation({
    mutationFn: () => workflowsApi.update(organization.id, workflowId, { name, description: description || null, steps: steps.map((s, i) => ({ order: i, type: s.type, name: s.name, config: s.config })) as WorkflowStepInput[] }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["workflow", organization.id, workflowId] }); navigate(`/workflows/${workflowId}`); }
  });

  function lastIndex() { return steps.length - 1; }
  function isMiddle(index: number) { return index > 0 && index < lastIndex(); }

  function addStep(type: WorkflowStepType) {
    const newStep: WorkflowStepDto = { id: `temp-${Date.now()}`, order: steps.length, type, name: STEP_LABELS[type], config: {} };
    const last = steps[lastIndex()];
    if (last?.type === "END") setSteps([...steps.slice(0, -1), newStep, last]);
    else setSteps([...steps, newStep]);
  }

  function removeStep(index: number) {
    if (!isMiddle(index)) return;
    setSteps(steps.filter((_, i) => i !== index));
  }

  function duplicateStep(index: number) {
    const step = steps[index];
    if (!step || !isMiddle(index)) return;
    const copy: WorkflowStepDto = { id: `temp-${Date.now()}-${index}`, order: step.order, type: step.type, name: step.name, config: { ...step.config } };
    setSteps([...steps.slice(0, index + 1), copy, ...steps.slice(index + 1)]);
  }

  function moveStepTo(from: number, to: number) {
    if (!isMiddle(from) || !isMiddle(to) || from === to) return;
    const next = [...steps];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setSteps(next);
  }

  function moveStep(index: number, direction: -1 | 1) {
    moveStepTo(index, index + direction);
  }

  function updateStepConfig(index: number, config: Record<string, unknown>) {
    const step = steps[index];
    if (!step) return;
    const newSteps = [...steps];
    newSteps[index] = { ...step, config };
    setSteps(newSteps);
  }

  function updateStepName(index: number, stepName: string) {
    const step = steps[index];
    if (!step) return;
    const newSteps = [...steps];
    newSteps[index] = { ...step, name: stepName };
    setSteps(newSteps);
  }

  function resetChanges() {
    if (!initial) return;
    setName(initial.name);
    setDescription(initial.description);
    setSteps(initial.steps.map((step) => ({ ...step, config: { ...step.config } })));
  }

  async function goBack() {
    if (dirty && !(await confirm({ title: t("workflows.unsavedChanges"), description: t("workflows.unsavedConfirm") }))) return;
    navigate(`/workflows/${workflowId}`);
  }

  function issueText(issue: WorkflowDraftIssue): string {
    const stepNum = (issue.stepIndex ?? 0) + 1;
    const fields = issue.fields?.map((field) => t(CONFIG_FIELD_KEYS[field] ?? field)).join(", ");
    return t(`workflows.issues.${issue.code}`, { step: stepNum, fields });
  }

  if (workflowQuery.isPending) {
    return (
      <Page>
        <PageHeader eyebrow={t("workflows.builder")} title={t("workflows.builderTitle")} description={t("workflows.builderDesc")} />
        <div className="space-y-3">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-20 w-full" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-md" />
                <Skeleton className="h-8 flex-1" />
              </div>
            </div>
          ))}
        </div>
      </Page>
    );
  }

  if (workflowQuery.isError || !workflow) {
    return (
      <Page>
        <PageHeader eyebrow={t("workflows.builder")} title={t("workflows.builderTitle")} description={t("workflows.builderDesc")} />
        <EmptyState icon={FileInput} title={t("workflows.workflowNotFound")} description={t("workflows.errorLoadingWorkflow")} action={<Button variant="outline" onClick={() => navigate("/workflows")}>{t("workflows.backToWorkflows")}</Button>} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={t("workflows.builder")}
        title={t("workflows.builderTitle")}
        description={t("workflows.builderDesc")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {dirty ? <Badge variant="warning">{t("workflows.unsavedChanges")}</Badge> : null}
            {!locked ? (
              <>
                <Button variant="outline" onClick={resetChanges} disabled={!dirty}><RotateCcw />{t("workflows.resetChanges")}</Button>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty || !name.trim() || issues.length > 0}><Save />{saveMutation.isPending ? t("common.saving") : t("common.save")}</Button>
              </>
            ) : null}
          </div>
        }
      />

      <button className="inline-flex items-center text-sm text-secondary-foreground transition-colors hover:text-foreground nx-focus-ring" onClick={() => void goBack()}>
        <ChevronLeft className="mr-1 size-4" />{t("workflows.backToDetail")}
      </button>

      {locked ? <Alert variant="warning" title={canManage ? t("workflows.builderLocked") : t("workflows.builderNoPermission")} /> : null}
      {saveMutation.isError ? <Alert variant="danger" title={t("workflows.saveError")}>{apiErrorText(saveMutation.error, t)}</Alert> : null}
      {resources.isError ? <Alert variant="danger" title={t("automation.resourcesError")}>{apiErrorText(resources.error, t)}</Alert> : null}
      {!locked && issues.length > 0 ? (
        <Alert variant="warning" title={t("workflows.validationTitle")}>
          <p className="mb-1 font-medium">{t("workflows.validationCount", { count: issues.length })}</p>
          <ul className="list-disc space-y-0.5 ps-4">
            {issues.map((issue, index) => <li key={`${issue.code}-${issue.stepIndex ?? index}`}>{issueText(issue)}</li>)}
          </ul>
        </Alert>
      ) : null}

      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <label className="nx-label mb-1.5 block" htmlFor="workflow-name">{t("common.name")}</label>
            {locked ? <p id="workflow-name" className="text-base font-semibold text-foreground">{name}</p> : (
              <Input id="workflow-name" className="text-base font-semibold" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            )}
          </div>
          <div>
            <label className="nx-label mb-1.5 block" htmlFor="workflow-description">{t("common.description")}</label>
            {locked ? <p id="workflow-description" className="text-sm text-muted-foreground">{description || "—"}</p> : (
              <Textarea id="workflow-description" placeholder={t("workflows.workflowDescription")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
            )}
          </div>
        </div>
      </section>

      {!locked ? (
        <PageSection title={t("workflows.stepPalette")}>
          <div className="space-y-3">
            {PALETTE_GROUPS.map((group) => (
              <div key={group.labelKey}>
                <p className="nx-label mb-1.5 text-muted-foreground">{t(`workflows.${group.labelKey}`)}</p>
                <div className="flex flex-wrap gap-2">
                  {group.types.map((type) => {
                    const Icon = STEP_ICON[type];
                    const boundaryPresent = (type === "START" || type === "END") && steps.some((step) => step.type === type);
                    return (
                      <button key={type} type="button" disabled={boundaryPresent}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 nx-focus-ring"
                        onClick={() => addStep(type)}>
                        <Icon className="size-4" />{STEP_LABELS[type]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </PageSection>
      ) : null}

      <PageSection title={t("workflows.flowPreview")} description={t("workflows.flowPreviewDesc")}>
        {steps.length === 0 ? <p className="text-sm text-muted-foreground">{t("workflows.noSteps")}</p> : (
          <ol className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-0">
            {steps.map((step, index) => {
              const Icon = STEP_ICON[step.type];
              return (
                <li key={`preview-${step.id ?? index}`} className="flex items-center gap-1">
                  <span className="inline-flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface-secondary/60 px-2.5 py-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{step.name || STEP_LABELS[step.type]}</span>
                      <span className="block text-xs text-muted-foreground">{STEP_LABELS[step.type]}</span>
                    </span>
                  </span>
                  {index < steps.length - 1 ? (
                    <>
                      <ArrowDown className="size-4 shrink-0 self-center text-muted-foreground sm:hidden" />
                      <ArrowRight className="hidden size-4 shrink-0 self-center text-muted-foreground sm:block" />
                    </>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </PageSection>

      <div className="space-y-3">
        {steps.map((step, index) => {
          const Icon = STEP_ICON[step.type];
          const middle = isMiddle(index);
          const draggable = !locked && middle;
          return (
            <article key={step.id ?? index}
              draggable={draggable}
              onDragStart={draggable ? (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(index)); setDragIndex(index); } : undefined}
              onDragEnd={() => { setDragIndex(null); setDropTarget(null); }}
              onDragOver={!locked && middle ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropTarget !== index) setDropTarget(index); } : undefined}
              onDragLeave={() => { if (dropTarget === index) setDropTarget(null); }}
              onDrop={!locked && middle ? (e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData("text/plain")); if (Number.isInteger(from)) moveStepTo(from, index); setDragIndex(null); setDropTarget(null); } : undefined}
              className={`rounded-lg border bg-surface p-4 shadow-sm transition-colors ${dropTarget === index && dragIndex !== null && dragIndex !== index ? "border-primary" : "border-border"} ${dragIndex === index ? "opacity-50" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-1" title={!locked && middle ? t("workflows.dragStep") : undefined}>
                  <GripVertical className={`size-4 ${middle && !locked ? "cursor-grab text-muted-foreground" : "text-muted-foreground/30"}`} aria-hidden />
                  {!locked && middle ? (
                    <>
                      <button className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 nx-focus-ring" onClick={() => moveStep(index, -1)} disabled={index <= 1} aria-label={t("common.moveUp")}><ChevronUp className="size-4" /></button>
                      <button className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 nx-focus-ring" onClick={() => moveStep(index, 1)} disabled={index >= lastIndex() - 1} aria-label={t("common.moveDown")}><ChevronDown className="size-4" /></button>
                    </>
                  ) : null}
                </div>
                <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-surface-secondary text-foreground"><Icon className="size-5" /></span>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-sm bg-surface-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">#{index + 1}</span>
                    {locked ? <p className="flex-1 truncate font-medium text-foreground">{step.name}</p> : (
                      <Input className="h-8 min-w-0 flex-1 font-medium" value={step.name} onChange={(e) => updateStepName(index, e.target.value)} />
                    )}
                    {!locked && middle ? (
                      <>
                        <button className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground nx-focus-ring" onClick={() => duplicateStep(index)} title={t("common.duplicate")} aria-label={t("workflows.duplicateStep")}><Copy className="size-4" /></button>
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={() => removeStep(index)} title={t("common.remove")} aria-label={t("workflows.removeStep")}><Trash2 className="size-4" /></Button>
                      </>
                    ) : null}
                  </div>
                  <StepConfigEditor step={step} disabled={locked} resources={resources.data} onChange={(config) => updateStepConfig(index, config)} />
                </div>
              </div>
              {index < steps.length - 1 ? <div className="mt-2 flex justify-center"><ArrowDown className="size-4 text-muted-foreground" /></div> : null}
            </article>
          );
        })}
      </div>
      {confirmDialog}
    </Page>
  );
}

function StepConfigEditor({ step, onChange, disabled = false, resources }: { step: WorkflowStepDto; onChange: (config: Record<string, unknown>) => void; disabled?: boolean; resources?: AutomationResourcesResponse }) {
  const { t } = useTranslation();
  const config = step.config;
  const memberOptions = (resources?.members ?? []).map((member) => ({ value: member.id, label: member.name }));
  const folderOptions = (resources?.folders ?? []).map((folder) => ({ value: folder.id, label: folder.path }));
  function set(key: string, value: unknown) { onChange({ ...config, [key]: value }); }

  switch (step.type) {
    case "START":
    case "END":
      return <p className="text-xs text-muted-foreground">{t("workflows.noConfigNeeded")}</p>;

    case "CREATE_TASK":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <ConfigInput label={t("dashboard.taskTitle")} value={config.title as string ?? ""} onChange={(v) => set("title", v)} placeholder={t("workflows.titlePlaceholder")} disabled={disabled} />
          <ConfigInput label={t("common.priority")} value={config.priority as string ?? "NORMAL"} onChange={(v) => set("priority", v)} options={["LOW", "NORMAL", "HIGH", "URGENT"]} disabled={disabled} />
          <ConfigInput label={t("common.status")} value={config.status as string ?? "TODO"} onChange={(v) => set("status", v)} options={["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]} disabled={disabled} />
          <ConfigInput label={t("workflows.memberIdLabel")} value={config.assignedMembershipId as string ?? ""} onChange={(v) => set("assignedMembershipId", v || undefined)} options={memberOptions} emptyLabel={t("workflows.unassigned")} disabled={disabled} />
          <ConfigInput label={t("workflows.outputVariable")} value={config.outputVariable as string ?? "taskId"} onChange={(v) => set("outputVariable", v)} disabled={disabled} />
        </div>
      );

    case "SEND_NOTIFICATION":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <ConfigInput label={t("workflows.recipientId")} value={config.recipientId as string ?? ""} onChange={(v) => set("recipientId", v)} options={memberOptions} emptyLabel={t("workflows.selectMember")} disabled={disabled} />
          <ConfigInput label={t("common.type")} value={config.type as string ?? "workflow.notification"} onChange={(v) => set("type", v)} disabled={disabled} />
          <ConfigInput label={t("dashboard.taskTitle")} value={config.title as string ?? ""} onChange={(v) => set("title", v)} disabled={disabled} />
          <ConfigInput label={t("workflows.bodyLabel")} value={config.body as string ?? ""} onChange={(v) => set("body", v)} disabled={disabled} />
        </div>
      );

    case "SEND_EMAIL":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <ConfigInput label={t("workflows.toLabel")} value={config.to as string ?? ""} onChange={(v) => set("to", v)} disabled={disabled} />
          <ConfigInput label={t("workflows.subjectLabel")} value={config.subject as string ?? ""} onChange={(v) => set("subject", v)} disabled={disabled} />
          <ConfigInput label={t("workflows.bodyLabel")} value={config.body as string ?? ""} onChange={(v) => set("body", v)} disabled={disabled} />
        </div>
      );

    case "APPROVAL":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <ConfigInput label={t("workflows.approverIdLabel")} value={config.approverId as string ?? ""} onChange={(v) => set("approverId", v)} options={memberOptions} emptyLabel={t("workflows.selectMember")} disabled={disabled} />
          <ConfigInput label={t("workflows.notificationTitle")} value={config.title as string ?? ""} onChange={(v) => set("title", v)} disabled={disabled} />
          <ConfigInput label={t("workflows.rejectionSkipStep")} type="number" value={typeof config.onRejectJumpToOrder === "number" ? String(config.onRejectJumpToOrder + 1) : ""} onChange={(v) => set("onRejectJumpToOrder", v ? Number(v) - 1 : undefined)} disabled={disabled} />
        </div>
      );

    case "CHANGE_STATUS":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <ConfigInput label={t("workflows.taskIdContext")} value={config.taskId as string ?? ""} onChange={(v) => set("taskId", v)} disabled={disabled} />
          <ConfigInput label={t("workflows.newStatus")} value={config.status as string ?? "TODO"} onChange={(v) => set("status", v)} options={["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]} disabled={disabled} />
        </div>
      );

    case "ASSIGN_USER":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <ConfigInput label={t("workflows.taskIdShort")} value={config.taskId as string ?? ""} onChange={(v) => set("taskId", v)} disabled={disabled} />
          <ConfigInput label={t("workflows.memberIdLabel")} value={config.assignedMembershipId as string ?? ""} onChange={(v) => set("assignedMembershipId", v)} options={memberOptions} emptyLabel={t("workflows.selectMember")} disabled={disabled} />
        </div>
      );

    case "CHANGE_FIELD":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <ConfigInput label={t("workflows.taskIdShort")} value={config.taskId as string ?? ""} onChange={(v) => set("taskId", v)} disabled={disabled} />
          <ConfigInput label={t("workflows.fieldLabel")} value={config.field as string ?? ""} onChange={(v) => set("field", v)} options={["title", "description", "priority", "dueAt"]} disabled={disabled} />
          <ConfigInput label={t("common.value")} value={config.value as string ?? ""} onChange={(v) => set("value", v)} disabled={disabled} />
        </div>
      );

    case "MOVE_DOCUMENT":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <ConfigInput label={t("workflows.documentIdLabel")} value={config.documentId as string ?? ""} onChange={(v) => set("documentId", v)} disabled={disabled} />
          <ConfigInput label={t("workflows.folderIdLabel")} value={config.folderId as string ?? ""} onChange={(v) => set("folderId", v)} options={folderOptions} emptyLabel={t("automation.selectFolder")} disabled={disabled} />
        </div>
      );

    case "CONDITION":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <ConfigInput label={t("workflows.contextVariable")} value={config.variable as string ?? ""} onChange={(v) => set("variable", v)} placeholder="Ex: __lastApproval" disabled={disabled} />
          <ConfigInput label={t("workflows.operatorLabel")} value={config.operator as string ?? "equals"} onChange={(v) => set("operator", v)} options={["equals", "not_equals", "exists", "not_exists"]} disabled={disabled} />
          <ConfigInput label={t("workflows.compareValue")} value={config.value as string ?? ""} onChange={(v) => set("value", v)} disabled={disabled} />
          <ConfigInput label={t("workflows.jumpToStep")} type="number" value={typeof config.jumpToOrder === "number" ? String(config.jumpToOrder + 1) : ""} onChange={(v) => set("jumpToOrder", v ? Number(v) - 1 : undefined)} disabled={disabled} />
        </div>
      );

    default:
      return null;
  }
}

type ConfigOption = string | { value: string; label: string };

function ConfigInput({ label, value, onChange, placeholder, options, type = "text", disabled = false, emptyLabel }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; options?: ConfigOption[]; type?: string; disabled?: boolean; emptyLabel?: string }) {
  const normalized = (options ?? []).map((option) => typeof option === "string" ? { value: option, label: option } : option);
  if (value && !normalized.some((option) => option.value === value)) normalized.push({ value, label: value });
  return (
    <label className="block">
      <span className="nx-label mb-1 block text-xs text-muted-foreground">{label}</span>
      {options ? (
        <Select className="h-9" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
          {normalized.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : (
        <Input className="h-9" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
      )}
    </label>
  );
}
