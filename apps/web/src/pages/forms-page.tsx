import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormStatus, FormSummaryDto } from "@nexora/contracts";
import { Archive, Copy, FilePlus, Plus, Search, Send } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Dialog, Dropdown, DropdownItem, DropdownSeparator, EmptyState, Field, Input, Page, PageHeader, Select, useConfirm, Skeleton, Toolbar, useToast } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { TemplatePicker } from "../components/template-picker";
import { formsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { getFormTemplates } from "../lib/templates";

const statusLabels: Record<FormStatus, string> = { DRAFT: "Rascunho", PUBLISHED: "Publicado", ARCHIVED: "Arquivado" };
const statusVariant: Record<FormStatus, "neutral" | "success" | "warning"> = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "warning" };

export function FormsPage() {
  const { t, i18n } = useTranslation();
  const { organization } = useWorkspace();
  const canManage = organization.permissions.includes("forms.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createDialog, setCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTemplate, setCreateTemplate] = useState<string | null>(null);
  const templates = useMemo(() => getFormTemplates(i18n.language), [i18n.language]);
  const selectedTemplate = templates.find((template) => template.id === createTemplate) ?? null;
  const resetCreate = () => { setCreateName(""); setCreateTemplate(null); };
  const listing = useQuery({ queryKey: ["forms", organization.id, search, statusFilter], queryFn: () => formsApi.list(organization.id, { search: search || undefined, status: statusFilter as FormStatus || undefined }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["forms", organization.id] });
  const create = useMutation({ mutationFn: () => formsApi.create(organization.id, { name: createName.trim(), description: selectedTemplate ? selectedTemplate.description : null, fields: selectedTemplate ? selectedTemplate.fields : [] }), onSuccess: async (form) => { setCreateDialog(false); resetCreate(); await refresh(); toast({ tone: "success", title: t("forms.created") }); navigate(`/forms/${form.id}/builder`); } });
  const duplicate = useMutation({ mutationFn: (form: FormSummaryDto) => formsApi.duplicate(organization.id, form.id), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("forms.duplicateForm") }); } });
  const remove = useMutation({ mutationFn: (form: FormSummaryDto) => formsApi.remove(organization.id, form.id), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("forms.deleted") }); } });
  function submit(event: FormEvent) { event.preventDefault(); if (createName.trim()) create.mutate(); }
  return <Page><PageHeader eyebrow={organization.name} title={t("forms.title")} description={t("forms.description")} actions={<><ContextualHelpButton route="/forms" showLabel /><Button onClick={() => setCreateDialog(true)} disabled={!canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined}><Plus />{t("forms.create")}</Button></>} />
    {!canManage ? <Alert variant="info">{t("forms.readOnlyNotice")}</Alert> : null}
    <Toolbar><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder={t("common.search")} value={search} onChange={(event) => setSearch(event.target.value)} /></div><Select aria-label={t("common.filterByStatus")} className="sm:max-w-52" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{t("common.allStatuses")}</option><option value="DRAFT">{t("common.draft")}</option><option value="PUBLISHED">{t("common.published")}</option><option value="ARCHIVED">{t("common.archived")}</option></Select></Toolbar>
    {listing.isPending ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-36" key={index} />)}</div> : listing.isError ? <Alert variant="danger" title={t("forms.loadingError")}><Button className="mt-3" size="sm" onClick={() => void listing.refetch()}>{t("common.retry")}</Button></Alert> : listing.data?.forms.length === 0 ? <EmptyState icon={FilePlus} title={t("forms.empty")} description={canManage ? t("forms.emptyDesc") : t("forms.readOnlyNotice")} action={canManage ? <Button onClick={() => setCreateDialog(true)}><Plus />{t("forms.create")}</Button> : undefined} /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{listing.data?.forms.map((form) => <article key={form.id} className="group relative rounded-lg border border-border bg-surface p-5 shadow-sm hover:border-border-strong hover:bg-surface-secondary/40"><button className="nx-focus-ring block w-full rounded-sm text-left" onClick={() => navigate(`/forms/${form.id}`)}><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary-subtle-foreground"><FilePlus className="size-4" /></span><div className="min-w-0 pr-8"><h2 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{form.name}</h2><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{form.description ?? t("forms.noDescription")}</p></div></div><div className="mt-5 flex flex-wrap items-center gap-2"><Badge variant={statusVariant[form.status]}>{statusLabels[form.status]}</Badge><Badge variant="outline">{t("forms.fieldsBadge", { count: form.fieldCount })}</Badge><span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"><Send className="size-3" />{t("forms.submissionsBadge", { count: form.submissionCount })}</span></div></button>{canManage ? <div className="absolute right-3 top-3"><Dropdown trigger={<Button variant="ghost" size="icon-sm" aria-label={t("common.actionsFor", { name: form.name })}>•••</Button>}><DropdownItem onClick={() => duplicate.mutate(form)}><Copy />{t("common.duplicate")}</DropdownItem><DropdownSeparator /><DropdownItem destructive onClick={async () => { if (await confirm(t("forms.deleteConfirmWithName", { name: form.name }))) remove.mutate(form); }}><Archive />{t("common.delete")}</DropdownItem></Dropdown></div> : null}</article>)}</div>}
    <Dialog open={createDialog} onOpenChange={(open) => { setCreateDialog(open); if (!open) resetCreate(); }} title={t("forms.newForm")} description={t("forms.createAndConfigure")} size="lg" footer={<><Button variant="ghost" onClick={() => setCreateDialog(false)}>{t("common.cancel")}</Button><Button type="submit" form="create-form" loading={create.isPending} disabled={!createName.trim()}>{t("common.create")}</Button></>}><form id="create-form" className="space-y-4" onSubmit={submit}><Field label={t("templates.label")}><TemplatePicker options={templates} value={createTemplate} onChange={(id) => { setCreateTemplate(id); const template = templates.find((item) => item.id === id); if (template) setCreateName(template.name); }} blankLabel={t("templates.blank")} blankDescription={t("templates.blankDesc")} /></Field><Field label={t("common.name")} required error={create.error ? apiErrorText(create.error, t) : undefined}><Input autoFocus maxLength={120} value={createName} onChange={(event) => setCreateName(event.target.value)} /></Field></form></Dialog>
    {confirmDialog}
  </Page>;
}
