import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListSummaryDto } from "@nexora/contracts";
import { Copy, List, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Dialog, Dropdown, DropdownItem, DropdownSeparator, EmptyState, Field, Input, Page, PageHeader, Select, useConfirm, Skeleton, Textarea, Toolbar, useToast } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { TemplatePicker } from "../components/template-picker";
import { listsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";
import { getListTemplates } from "../lib/templates";

export function ListsPage() {
  const { t, i18n } = useTranslation();
  const { organization } = useWorkspace();
  const canManage = organization.permissions.includes("lists.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { formatDate } = useLocaleFormatter();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "updatedAt" | "createdAt">("updatedAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [createDialog, setCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createTemplate, setCreateTemplate] = useState<string | null>(null);
  const templates = useMemo(() => getListTemplates(i18n.language), [i18n.language]);
  const selectedTemplate = templates.find((template) => template.id === createTemplate) ?? null;
  const resetCreate = () => { setCreateName(""); setCreateDescription(""); setCreateTemplate(null); };
  const listing = useQuery({ queryKey: ["lists", organization.id, search, sort, order], queryFn: () => listsApi.list(organization.id, { search: search || undefined, sort, order }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lists", organization.id] });
  const create = useMutation({ mutationFn: () => listsApi.create(organization.id, { name: createName.trim(), description: createDescription.trim() || null, fields: selectedTemplate ? selectedTemplate.fields : [] }), onSuccess: async (list) => { setCreateDialog(false); resetCreate(); await refresh(); toast({ tone: "success", title: t("lists.created") }); navigate(`/lists/${list.id}`); }, onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) }) });
  const duplicate = useMutation({ mutationFn: (list: ListSummaryDto) => listsApi.duplicate(organization.id, list.id), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("lists.duplicated") }); } });
  const remove = useMutation({ mutationFn: (list: ListSummaryDto) => listsApi.remove(organization.id, list.id), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("lists.deleted") }); } });
  function submit(event: FormEvent) { event.preventDefault(); if (createName.trim()) create.mutate(); }

  return <Page><PageHeader eyebrow={organization.name} title={t("lists.title")} description={t("lists.description")} actions={<><ContextualHelpButton route="/lists" showLabel /><Button onClick={() => setCreateDialog(true)} disabled={!canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined}><Plus />{t("lists.create")}</Button></>} />
    {!canManage ? <Alert variant="info">{t("lists.readOnlyNotice")}</Alert> : null}
    <Toolbar><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder={t("common.search")} value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="grid grid-cols-2 gap-2 sm:flex"><Select aria-label={t("common.sortBy")} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="updatedAt">{t("lists.sortUpdate")}</option><option value="name">{t("common.name")}</option><option value="createdAt">{t("lists.sortCreate")}</option></Select><Select aria-label={t("common.ascending")} value={order} onChange={(event) => setOrder(event.target.value as typeof order)}><option value="desc">{t("common.descending")}</option><option value="asc">{t("common.ascending")}</option></Select></div></Toolbar>
    {listing.isPending ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-36" key={index} />)}</div> : listing.isError ? <Alert variant="danger" title={t("lists.loadingError")}><Button className="mt-3" size="sm" onClick={() => void listing.refetch()}>{t("common.retry")}</Button></Alert> : listing.data?.lists.length === 0 ? <EmptyState icon={List} title={t("lists.empty")} description={canManage ? t("lists.emptyDesc") : t("lists.readOnlyNotice")} action={canManage ? <Button onClick={() => setCreateDialog(true)}><Plus />{t("lists.createList")}</Button> : undefined} /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{listing.data?.lists.map((list) => <article key={list.id} className="group relative rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-secondary/40"><button className="nx-focus-ring block w-full rounded-sm text-left" onClick={() => navigate(`/lists/${list.id}`)}><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary-subtle-foreground"><List className="size-4" /></span><div className="min-w-0 pr-8"><h2 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{list.name}</h2><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{list.description ?? t("forms.noDescription")}</p></div></div><div className="mt-5 flex items-center gap-2"><Badge variant="outline">{t("lists.fieldsCount", { count: list.fieldCount })}</Badge><Badge variant="outline">{t("lists.recordsCount", { count: list.itemCount })}</Badge><span className="ml-auto text-xs text-muted-foreground">{formatDate(list.updatedAt)}</span></div></button>{canManage ? <div className="absolute right-3 top-3"><Dropdown trigger={<Button variant="ghost" size="icon-sm" aria-label={t("common.actionsFor", { name: list.name })}>•••</Button>}><DropdownItem onClick={() => duplicate.mutate(list)}><Copy />{t("common.duplicate")}</DropdownItem><DropdownSeparator /><DropdownItem destructive onClick={async () => { if (await confirm(t("lists.deleteListConfirm", { name: list.name }))) remove.mutate(list); }}><Trash2 />{t("common.delete")}</DropdownItem></Dropdown></div> : null}</article>)}</div>}
    <Dialog open={createDialog} onOpenChange={(open) => { setCreateDialog(open); if (!open) resetCreate(); }} title={t("lists.newList")} description={t("lists.createListDesc")} size="lg" footer={<><Button variant="ghost" onClick={() => setCreateDialog(false)}>{t("common.cancel")}</Button><Button type="submit" form="create-list-form" loading={create.isPending} disabled={!createName.trim()}>{t("lists.createList")}</Button></>}><form id="create-list-form" className="space-y-4" onSubmit={submit}><Field label={t("templates.label")}><TemplatePicker options={templates} value={createTemplate} onChange={(id) => { setCreateTemplate(id); const template = templates.find((item) => item.id === id); if (template) { setCreateName(template.name); setCreateDescription(template.description); } }} blankLabel={t("templates.blank")} blankDescription={t("templates.blankDesc")} /></Field><Field label={t("common.name")} required error={create.error ? apiErrorText(create.error, t) : undefined}><Input autoFocus maxLength={120} value={createName} onChange={(event) => setCreateName(event.target.value)} /></Field><Field label={t("common.description")} helper={t("dashboard.descriptionOptional")}><Textarea rows={3} maxLength={480} value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} /></Field></form></Dialog>
    {confirmDialog}
  </Page>;
}
