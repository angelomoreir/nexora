import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowStatus, WorkflowStepType } from "@nexora/contracts";
import { Archive, CheckCircle, FileText, GitBranch, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton, Textarea, Toolbar, useConfirm } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { TemplatePicker } from "../components/template-picker";
import { workflowsApi } from "../lib/api";
import { getWorkflowTemplates } from "../lib/templates";

const STATUS_VARIANT: Record<WorkflowStatus, "neutral" | "success" | "warning"> = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "warning" };
const STATUS_KEYS: Record<WorkflowStatus, string> = { DRAFT: "workflows.statusDraft", PUBLISHED: "workflows.statusPublished", ARCHIVED: "workflows.statusArchived" };

export function WorkflowsPage() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useConfirm();
  const { organization } = useWorkspace();
  const canManage = organization.permissions.includes("workflows.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [createDialog, setCreateDialog] = useState(false);

  const queryKey = ["workflows", organization.id, search, statusFilter];
  const listing = useQuery({ queryKey, queryFn: () => workflowsApi.list(organization.id, { search: search || undefined, status: statusFilter as WorkflowStatus || undefined }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["workflows", organization.id] });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; description?: string; steps?: { order: number; type: WorkflowStepType; name: string; config: Record<string, unknown> }[] }) => workflowsApi.create(organization.id, { name: input.name, description: input.description, steps: input.steps ?? [{ order: 0, type: "START" as const, name: t("dashboard.startStep"), config: {} }, { order: 1, type: "END" as const, name: t("dashboard.endStep"), config: {} }] }),
    onSuccess: async (workflow) => { setCreateDialog(false); await refresh(); navigate(`/workflows/${workflow.id}/builder`); }
  });
  const deleteMutation = useMutation({ mutationFn: (id: string) => workflowsApi.remove(organization.id, id), onSuccess: refresh });
  const publishMutation = useMutation({ mutationFn: (id: string) => workflowsApi.publish(organization.id, id), onSuccess: refresh });
  const archiveMutation = useMutation({ mutationFn: (id: string) => workflowsApi.archive(organization.id, id), onSuccess: refresh });
  const startMutation = useMutation({ mutationFn: (id: string) => workflowsApi.start(organization.id, id, {}), onSuccess: async (_data, id) => { await refresh(); navigate(`/workflows/${id}`); } });

  const workflows = listing.data?.workflows ?? [];
  const statusLabel = (s: WorkflowStatus) => t(STATUS_KEYS[s]);

  return (
    <Page>
      <PageHeader eyebrow={organization.name} title={t("workflows.title")} description={t("workflows.description")} actions={<><ContextualHelpButton route="/workflows" showLabel /><Button onClick={() => setCreateDialog(true)} disabled={!canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined}><Plus />{t("workflows.newWorkflow")}</Button></>} />

      {!canManage ? <Alert variant="info">{t("workflows.readOnlyNotice")}</Alert> : null}

      <Toolbar>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="sm:max-w-52" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t("common.allStatuses")}</option>
          {(Object.keys(STATUS_KEYS) as WorkflowStatus[]).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </Select>
      </Toolbar>

      {listing.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex items-start justify-between">
                <Skeleton className="size-10 rounded-md" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="mt-4 h-5 w-2/3" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
              <div className="mt-4 flex gap-2 border-t border-border pt-3">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {listing.isError ? (
        <EmptyState icon={FileText} title={t("workflows.loadingError")} description={t("approvals.retryConnection")} action={<Button variant="outline" onClick={() => listing.refetch()}>{t("common.retry")}</Button>} />
      ) : null}

      {listing.data ? (
        workflows.length === 0 ? (
          <EmptyState icon={GitBranch} title={t("workflows.empty")} description={canManage ? t("workflows.emptyDesc") : t("workflows.readOnlyNotice")} action={canManage ? <Button onClick={() => setCreateDialog(true)}><Plus />{t("workflows.newWorkflow")}</Button> : undefined} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <article key={workflow.id} className="flex flex-col rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong">
                <div className="flex items-start justify-between">
                  <span className="grid size-10 place-items-center rounded-md bg-primary-subtle text-primary"><GitBranch className="size-5" /></span>
                  <Badge variant={STATUS_VARIANT[workflow.status]}>{statusLabel(workflow.status)}</Badge>
                </div>
                <h3 className="mt-3 nx-h3 text-foreground">{workflow.name}</h3>
                {workflow.description ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-secondary-foreground">{workflow.description}</p> : null}
                <dl className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><FileText className="size-3" />{workflow.steps.length} {t("workflows.steps").toLowerCase()}</span>
                  <span className="flex items-center gap-1"><Play className="size-3" />{workflow.instanceCount} {t("workflows.instanceCount")}</span>
                  <span>v{workflow.version}</span>
                </dl>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  {canManage ? <Button variant="outline" size="sm" onClick={() => navigate(`/workflows/${workflow.id}/builder`)}><Pencil className="size-3.5" />{t("workflows.builder")}</Button> : null}
                  <Button variant="outline" size="sm" onClick={() => navigate(`/workflows/${workflow.id}`)}><FileText className="size-3.5" />{t("documents.details")}</Button>
                  {canManage && workflow.status === "PUBLISHED" ? <Button variant="outline" size="sm" onClick={() => startMutation.mutate(workflow.id)} disabled={startMutation.isPending}><Play className="size-3.5" />{t("workflows.start")}</Button> : null}
                  {canManage && workflow.status === "DRAFT" ? <Button variant="outline" size="sm" onClick={() => publishMutation.mutate(workflow.id)} disabled={publishMutation.isPending}><CheckCircle className="size-3.5" />{t("forms.publish")}</Button> : null}
                  {canManage && workflow.status === "PUBLISHED" ? <Button variant="outline" size="sm" onClick={() => archiveMutation.mutate(workflow.id)} disabled={archiveMutation.isPending}><Archive className="size-3.5" />{t("workflows.archive")}</Button> : null}
                  {canManage ? <Button variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground hover:bg-danger-subtle hover:text-danger" aria-label={t("workflows.delete")} onClick={async () => { if (await confirm(t("workflows.deleteConfirm", { name: workflow.name }))) deleteMutation.mutate(workflow.id); }}><Trash2 className="size-4" /></Button> : null}
                </div>
              </article>
            ))}
          </div>
        )
      ) : null}

      {createDialog ? <CreateWorkflowDialog onClose={() => setCreateDialog(false)} onSubmit={(input) => createMutation.mutate(input)} isPending={createMutation.isPending} /> : null}
      {confirmDialog}
    </Page>
  );
}

function CreateWorkflowDialog({onClose, onSubmit, isPending }: { onClose: () => void; onSubmit: (input: { name: string; description?: string; steps?: { order: number; type: WorkflowStepType; name: string; config: Record<string, unknown> }[] }) => void; isPending: boolean }) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const templates = useMemo(() => getWorkflowTemplates(i18n.language), [i18n.language]);
  const selectedTemplate = templates.find((template) => template.id === templateId) ?? null;
  function submit(event: FormEvent) { event.preventDefault(); onSubmit({ name, description: description || undefined, steps: selectedTemplate ? selectedTemplate.steps : undefined }); }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t("workflows.newWorkflow")} description={selectedTemplate ? selectedTemplate.description : t("workflows.createdWithDefaultSteps")} size="lg" footer={<><Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="new-workflow-form" disabled={isPending || !name.trim()}><GitBranch className="size-4" />{isPending ? t("common.creating") : t("common.create")}</Button></>}>
      <form id="new-workflow-form" className="space-y-4" onSubmit={submit}>
        <Field label={t("templates.label")}>
          <TemplatePicker options={templates} value={templateId} onChange={(id) => { setTemplateId(id); const template = templates.find((item) => item.id === id); if (template) { setName(template.name); setDescription(template.description); } }} blankLabel={t("templates.blank")} blankDescription={t("workflows.createdWithDefaultSteps")} />
        </Field>
        <Field label={t("common.name")} htmlFor="workflow-name">
          <Input id="workflow-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus />
        </Field>
        <Field label={t("common.description")} htmlFor="workflow-description" helper={t("dashboard.descriptionOptional")}>
          <Textarea id="workflow-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </Field>
      </form>
    </Dialog>
  );
}
