import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutomationResourcesResponse, WorkflowTriggerDto, WorkflowTriggerScope } from "@nexora/contracts";
import { CheckSquare, ClipboardList, FileCheck2, FilePenLine, FilePlus2, FileStack, FileX2, ListPlus, Pencil, Play, Plus, Trash2, Zap } from "lucide-react";
import { useState, type ComponentType, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, Page, PageHeader, PageSection, Select, Skeleton, Switch, useToast } from "../components/ui";
import { automationApi, workflowsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

type TriggerEvent = "document.created" | "document.updated" | "document.deleted" | "document.version.added" | "document.published" | "list.item.created" | "task.created" | "form.submitted";

const EVENT_MODEL: Record<TriggerEvent, { labelKey: string; sourceKey: "documents" | "lists" | "tasks" | "forms"; icon: ComponentType<{ className?: string }>; scopes: WorkflowTriggerScope[] }> = {
  "document.created": { labelKey: "documentCreated", sourceKey: "documents", icon: FilePlus2, scopes: ["organization", "folder"] },
  "document.updated": { labelKey: "documentUpdated", sourceKey: "documents", icon: FilePenLine, scopes: ["organization", "folder"] },
  "document.deleted": { labelKey: "documentDeleted", sourceKey: "documents", icon: FileX2, scopes: ["organization", "folder"] },
  "document.version.added": { labelKey: "documentVersionAdded", sourceKey: "documents", icon: FileStack, scopes: ["organization", "folder"] },
  "document.published": { labelKey: "documentPublished", sourceKey: "documents", icon: FileCheck2, scopes: ["organization", "folder"] },
  "list.item.created": { labelKey: "listItemCreated", sourceKey: "lists", icon: ListPlus, scopes: ["organization", "list"] },
  "task.created": { labelKey: "taskCreated", sourceKey: "tasks", icon: CheckSquare, scopes: ["organization"] },
  "form.submitted": { labelKey: "formSubmitted", sourceKey: "forms", icon: ClipboardList, scopes: ["organization"] }
};

const TRIGGER_EVENTS = Object.keys(EVENT_MODEL) as TriggerEvent[];

export function AdminAutomationPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [triggerForm, setTriggerForm] = useState<{ trigger: WorkflowTriggerDto | null } | null>(null);
  const [actionFormOpen, setActionFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "trigger" | "action"; id: string; name: string } | null>(null);
  const canManage = organization.permissions.includes("workflows.manage");

  const triggersKey = ["workflow-triggers", organization.id];
  const actionsKey = ["quick-actions", organization.id];
  const triggers = useQuery({ queryKey: triggersKey, queryFn: () => automationApi.listTriggers(organization.id) });
  const actions = useQuery({ queryKey: actionsKey, queryFn: () => automationApi.listQuickActions(organization.id) });
  const workflows = useQuery({ queryKey: ["workflows", organization.id], queryFn: () => workflowsApi.list(organization.id, {}) });
  const resources = useQuery({ queryKey: ["automation-resources", organization.id], queryFn: () => automationApi.resources(organization.id), enabled: canManage });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: triggersKey }); void queryClient.invalidateQueries({ queryKey: actionsKey }); };

  const toggle = useMutation({
    mutationFn: (trigger: WorkflowTriggerDto) => automationApi.updateTrigger(organization.id, trigger.id, { enabled: !trigger.enabled }),
    onSuccess: refresh,
    onError: (error: Error) => toast({ tone: "danger", title: t("automation.errorSaving"), description: apiErrorText(error, t) })
  });
  const remove = useMutation({
    mutationFn: (target: { kind: "trigger" | "action"; id: string }) =>
      target.kind === "trigger" ? automationApi.deleteTrigger(organization.id, target.id) : automationApi.deleteQuickAction(organization.id, target.id),
    onSuccess: async () => { setConfirmDelete(null); await refresh(); toast({ tone: "success", title: t("automation.deleted") }); },
    onError: (error: Error) => toast({ tone: "danger", title: t("automation.errorDeleting"), description: apiErrorText(error, t) })
  });

  const publishedWorkflows = (workflows.data?.workflows ?? []).filter((workflow) => workflow.status === "PUBLISHED");
  const triggerItems = triggers.data?.triggers ?? [];
  const actionItems = actions.data?.actions ?? [];
  const noPublished = workflows.isSuccess && publishedWorkflows.length === 0;

  function scopeLabel(trigger: WorkflowTriggerDto): string {
    if (trigger.scopeType === "organization") return t("automation.scopeOrg");
    if (trigger.scopeType === "folder") return resources.data?.folders.find((folder) => folder.id === trigger.scopeId)?.path ?? t("automation.scopeFolder");
    return resources.data?.lists.find((list) => list.id === trigger.scopeId)?.name ?? t("automation.scopeList");
  }

  function actionScopeLabel(scopeId: string | null): string {
    if (!scopeId) return t("automation.allFolders");
    return resources.data?.folders.find((folder) => folder.id === scopeId)?.path ?? t("automation.scopeFolder");
  }

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("automation.title")} description={t("automation.description")}
        actions={canManage ? <Button size="sm" onClick={() => setTriggerForm({ trigger: null })} disabled={noPublished || workflows.isPending} title={noPublished ? t("automation.noPublishedTitle") : undefined}><Plus />{t("automation.createTrigger")}</Button> : undefined} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t("automation.summaryRules")} value={triggerItems.length} icon={Zap} loading={triggers.isPending} />
        <SummaryCard label={t("automation.summaryActive")} value={triggerItems.filter((trigger) => trigger.enabled && trigger.workflowStatus === "PUBLISHED").length} icon={Play} loading={triggers.isPending} />
        <SummaryCard label={t("automation.summaryActions")} value={actionItems.length} icon={ClipboardList} loading={actions.isPending} />
        <SummaryCard label={t("automation.summaryWorkflows")} value={publishedWorkflows.length} icon={FileCheck2} loading={workflows.isPending} />
      </div>

      {noPublished ? (
        <Alert variant="warning" title={t("automation.noPublishedTitle")}>
          <p>{t("automation.noPublishedDesc")}</p>
          <Link className="nx-focus-ring mt-2 inline-flex items-center text-sm font-medium text-primary hover:underline" to="/workflows">{t("automation.viewWorkflows")}</Link>
        </Alert>
      ) : null}
      {resources.isError ? <Alert variant="danger" title={t("automation.resourcesError")}>{apiErrorText(resources.error, t)}</Alert> : null}

      <PageSection title={t("automation.rulesTitle")} description={t("automation.rulesDescription")}>
        {triggers.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {triggers.isError ? <Alert variant="danger" title={t("automation.loadingError")}>{apiErrorText(triggers.error, t)}</Alert> : null}
        {triggers.data && triggerItems.length === 0 ? <EmptyState icon={Zap} title={t("automation.triggersEmpty")} description={t("automation.triggersEmptyDesc")} /> : null}
        {triggerItems.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {triggerItems.map((trigger) => {
              const model = EVENT_MODEL[trigger.event as TriggerEvent];
              const Icon = model?.icon ?? Zap;
              const unavailable = trigger.workflowStatus !== "PUBLISHED";
              return (
                <article key={trigger.id} className="rounded-lg border border-border bg-surface-secondary/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary"><Icon className="size-4" /></span>
                    {unavailable ? <Badge variant="warning">{t("automation.workflowUnavailable")}</Badge> : (
                      <Badge variant={trigger.enabled ? "success" : "neutral"}>{trigger.enabled ? t("automation.enabled") : t("automation.paused")}</Badge>
                    )}
                  </div>
                  <dl className="mt-3 space-y-2.5">
                    <div>
                      <dt className="nx-label text-muted-foreground">{t("automation.whenLabel")}</dt>
                      <dd className="text-sm font-medium text-foreground">{model ? t(`automation.events.${model.labelKey}`) : trigger.event}</dd>
                      <dd className="text-xs text-muted-foreground">{trigger.event} · {model ? t(`automation.sources.${model.sourceKey}`) : ""}</dd>
                    </div>
                    <div>
                      <dt className="nx-label text-muted-foreground">{t("automation.whereLabel")}</dt>
                      <dd className="text-sm text-foreground">{scopeLabel(trigger)}</dd>
                    </div>
                    <div>
                      <dt className="nx-label text-muted-foreground">{t("automation.thenLabel")}</dt>
                      <dd className="text-sm text-foreground">{trigger.workflowName}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <Switch checked={trigger.enabled} onCheckedChange={() => toggle.mutate(trigger)} disabled={!canManage || unavailable} label={t("common.status")} />
                    {canManage ? (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={t("automation.editTrigger")} title={t("automation.editTrigger")} onClick={() => setTriggerForm({ trigger })}><Pencil /></Button>
                        <Button variant="ghost" size="icon-sm" className="text-danger hover:bg-danger-subtle hover:text-danger" aria-label={t("common.delete")} onClick={() => setConfirmDelete({ kind: "trigger", id: trigger.id, name: model ? t(`automation.events.${model.labelKey}`) : trigger.event })}><Trash2 /></Button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </PageSection>

      <PageSection title={t("automation.quickActionsTitle")} description={t("automation.actionDesc")}
        actions={canManage ? <Button size="sm" variant="outline" onClick={() => setActionFormOpen(true)} disabled={noPublished || workflows.isPending} title={noPublished ? t("automation.noPublishedTitle") : undefined}><Play />{t("automation.createAction")}</Button> : undefined}>
        {actions.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {actions.data && actionItems.length === 0 ? <EmptyState icon={Play} title={t("automation.actionsEmpty")} description={t("automation.actionsEmptyDesc")} /> : null}
        {actionItems.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {actionItems.map((action) => (
              <article key={action.id} className="rounded-lg border border-border bg-surface-secondary/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{action.name}</p>
                    <p className="text-xs text-muted-foreground">{action.targetType === "folder" ? t("automation.targetFolder") : t("automation.targetDocument")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {action.workflowStatus !== "PUBLISHED" ? <Badge variant="warning">{t("automation.workflowUnavailable")}</Badge> : null}
                    <Badge variant="outline">{action.targetType}</Badge>
                  </div>
                </div>
                <dl className="mt-3 space-y-2.5">
                  <div>
                    <dt className="nx-label text-muted-foreground">{t("automation.whereLabel")}</dt>
                    <dd className="text-sm text-foreground">{actionScopeLabel(action.scopeId)}</dd>
                  </div>
                  <div>
                    <dt className="nx-label text-muted-foreground">{t("automation.thenLabel")}</dt>
                    <dd className="text-sm text-foreground">{action.workflowName}</dd>
                  </div>
                </dl>
                {canManage ? (
                  <div className="mt-3 flex justify-end border-t border-border pt-3">
                    <Button variant="ghost" size="icon-sm" className="text-danger hover:bg-danger-subtle hover:text-danger" aria-label={t("common.delete")} onClick={() => setConfirmDelete({ kind: "action", id: action.id, name: action.name })}><Trash2 /></Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </PageSection>

      {triggerForm ? <TriggerFormDialog trigger={triggerForm.trigger} workflows={publishedWorkflows} resources={resources.data} onClose={() => setTriggerForm(null)} onSaved={refresh} /> : null}
      {actionFormOpen ? <ActionFormDialog workflows={publishedWorkflows} resources={resources.data} onClose={() => setActionFormOpen(false)} onSaved={refresh} /> : null}
      <Dialog open={canManage && confirmDelete !== null} onOpenChange={(next) => !next && setConfirmDelete(null)} title={t("common.delete")} description={t("automation.deleteConfirm", { name: confirmDelete?.name ?? "" })}
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</Button><Button variant="destructive" loading={remove.isPending} onClick={() => confirmDelete && remove.mutate(confirmDelete)}>{t("common.delete")}</Button></>} />
    </Page>
  );
}

function SummaryCard({ label, value, icon: Icon, loading }: { label: string; value: number; icon: ComponentType<{ className?: string }>; loading: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="nx-label text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>}
    </div>
  );
}

function TriggerFormDialog({ trigger, workflows, resources, onClose, onSaved }: { trigger: WorkflowTriggerDto | null; workflows: { id: string; name: string }[]; resources: AutomationResourcesResponse | undefined; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const editing = trigger !== null;
  const [workflowId, setWorkflowId] = useState(trigger?.workflowDefinitionId ?? workflows[0]?.id ?? "");
  const [event, setEvent] = useState<TriggerEvent>((trigger?.event as TriggerEvent) ?? TRIGGER_EVENTS[0]!);
  const [scopeType, setScopeType] = useState<WorkflowTriggerScope>(trigger?.scopeType ?? "organization");
  const [scopeId, setScopeId] = useState(trigger?.scopeId ?? "");
  const [enabled, setEnabled] = useState(trigger?.enabled ?? true);

  const allowedScopes = EVENT_MODEL[event].scopes;
  const scopeOptions = scopeType === "folder" ? resources?.folders.map((folder) => ({ value: folder.id, label: folder.path })) ?? [] : scopeType === "list" ? resources?.lists.map((list) => ({ value: list.id, label: list.name })) ?? [] : [];

  const save = useMutation({
    mutationFn: () => editing
      ? automationApi.updateTrigger(organization.id, trigger.id, { event, scopeType, scopeId: scopeType === "organization" ? null : scopeId, enabled })
      : automationApi.createTrigger(organization.id, { workflowDefinitionId: workflowId, event, scopeType, scopeId: scopeType === "organization" ? null : scopeId, enabled }),
    onSuccess: async () => { await onSaved(); toast({ tone: "success", title: editing ? t("automation.saved") : t("automation.triggerCreated") }); onClose(); },
    onError: (error: Error) => toast({ tone: "danger", title: t("automation.errorSaving"), description: apiErrorText(error, t) })
  });

  function changeEvent(next: TriggerEvent) {
    setEvent(next);
    if (!EVENT_MODEL[next].scopes.includes(scopeType)) {
      setScopeType("organization");
      setScopeId("");
    }
  }

  function submit(e: FormEvent) { e.preventDefault(); if (editing || workflowId) save.mutate(); }

  const scopeMissing = scopeType !== "organization" && !scopeId;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} title={editing ? t("automation.editTrigger") : t("automation.createTrigger")} description={t("automation.triggerDesc")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="trigger-form" loading={save.isPending} disabled={(!editing && !workflowId) || scopeMissing}>{t("common.save")}</Button></>}>
      <form id="trigger-form" className="space-y-4" onSubmit={submit}>
        {!editing ? (
          <Field label={t("automation.workflow")} required>
            <Select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
              {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label={t("automation.event")} required>
          <Select value={event} onChange={(e) => changeEvent(e.target.value as TriggerEvent)}>
            {TRIGGER_EVENTS.map((name) => <option key={name} value={name}>{t(`automation.events.${EVENT_MODEL[name].labelKey}`)}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("automation.scope")}>
            <Select value={scopeType} onChange={(e) => { const next = e.target.value as WorkflowTriggerScope; setScopeType(next); if (next === "organization") setScopeId(""); }}>
              <option value="organization">{t("automation.scopeOrg")}</option>
              {allowedScopes.includes("folder") ? <option value="folder">{t("automation.scopeFolder")}</option> : null}
              {allowedScopes.includes("list") ? <option value="list">{t("automation.scopeList")}</option> : null}
            </Select>
          </Field>
          {scopeType !== "organization" ? (
            <Field label={scopeType === "folder" ? t("automation.selectFolder") : t("automation.selectList")} required>
              <Select value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                <option value="">{scopeType === "folder" ? t("automation.selectFolder") : t("automation.selectList")}</option>
                {scopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              {scopeOptions.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">{t("automation.resourceUnavailable")}</p> : null}
            </Field>
          ) : null}
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} label={t("automation.enabled")} />
      </form>
    </Dialog>
  );
}

function ActionFormDialog({ workflows, resources, onClose, onSaved }: { workflows: { id: string; name: string }[]; resources: AutomationResourcesResponse | undefined; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? "");
  const [targetType, setTargetType] = useState<"document" | "folder">("document");
  const [scopeId, setScopeId] = useState("");

  const save = useMutation({
    mutationFn: () => automationApi.createQuickAction(organization.id, { name: name.trim(), workflowDefinitionId: workflowId, targetType, scopeId: scopeId || null }),
    onSuccess: async () => { await onSaved(); toast({ tone: "success", title: t("automation.actionCreated") }); onClose(); },
    onError: (error: Error) => toast({ tone: "danger", title: t("automation.errorSaving"), description: apiErrorText(error, t) })
  });

  function submit(e: FormEvent) { e.preventDefault(); if (name.trim() && workflowId) save.mutate(); }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} title={t("automation.createAction")} description={t("automation.actionDesc")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="action-form" loading={save.isPending} disabled={!name.trim() || !workflowId}>{t("common.save")}</Button></>}>
      <form id="action-form" className="space-y-4" onSubmit={submit}>
        <Field label={t("common.name")} required><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("automation.targetType")}>
            <Select value={targetType} onChange={(e) => setTargetType(e.target.value as typeof targetType)}>
              <option value="document">{t("automation.targetDocument")}</option>
              <option value="folder">{t("automation.targetFolder")}</option>
            </Select>
          </Field>
          <Field label={t("automation.workflow")} required>
            <Select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
              {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t("automation.actionScope")}>
          <Select value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
            <option value="">{t("automation.allFolders")}</option>
            {(resources?.folders ?? []).map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}
