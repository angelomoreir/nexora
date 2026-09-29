import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListDefinitionDto, ListFieldDto, ListFieldType, ListItemDto } from "@nexora/contracts";
import { ArrowDown, ArrowUp, Bell, BellOff, ChevronLeft, Copy, Download, Plus, Save, Settings, Trash2, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ContextualCopilot } from "../components/ai/contextual-copilot";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Breadcrumb, Button, Checkbox, Dialog, EmptyState, Field, Input, Page, PageHeader, Pagination, Select, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tabs, Textarea, Toolbar, useConfirm, useToast } from "../components/ui";
import { SavedViewsDropdown } from "../components/views/saved-views-dropdown";
import { listsApi, subscriptionsApi, type ListFieldInput } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

const FIELD_TYPES: ListFieldType[] = ["text", "longtext", "number", "currency", "date", "datetime", "boolean", "choice", "email", "url", "user", "relation", "file"];

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 80);
}

export function ListDetailPage() {
  const { t } = useTranslation();
  const { id: listId = "" } = useParams();
  const { organization } = useWorkspace();
  const canManage = organization.permissions.includes("lists.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"data" | "builder">("data");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<ListItemDto | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});

  const listQuery = useQuery({ queryKey: ["list", organization.id, listId], queryFn: () => listsApi.get(organization.id, listId) });
  const itemsQueryKey = ["list-items", organization.id, listId, search, sort, order, page, pageSize];
  const itemsQuery = useQuery({ queryKey: itemsQueryKey, queryFn: () => listsApi.items(organization.id, listId, { search: search || undefined, sort: sort || undefined, order, page, pageSize }) });
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const alertCheck = useQuery({ queryKey: ["subscription-check", organization.id, "list", listId], queryFn: () => subscriptionsApi.check(organization.id, "list", listId) });
  const subscribed = alertCheck.data?.subscribed ?? false;
  const toggleAlert = useMutation({
    mutationFn: async () => {
      if (subscribed) await subscriptionsApi.unsubscribe(organization.id, { targetType: "list", targetId: listId });
      else await subscriptionsApi.subscribe(organization.id, { targetType: "list", targetId: listId, events: ["created", "updated", "deleted", "item.added", "commented"] });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscription-check", organization.id, "list", listId] });
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", organization.id] });
      toast({ tone: "success", title: subscribed ? t("subscriptions.removed") : t("subscriptions.activated") });
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("subscriptions.errorSaving"), description: apiErrorText(error, t) })
  });

  const refreshList = () => queryClient.invalidateQueries({ queryKey: ["list", organization.id, listId] });
  const refreshItems = () => queryClient.invalidateQueries({ queryKey: ["list-items", organization.id, listId] });

  const createItemMutation = useMutation({ mutationFn: (values: Record<string, unknown>) => listsApi.createItem(organization.id, listId, values), onSuccess: async () => { await refreshItems(); await refreshList(); } });
  const updateItemMutation = useMutation({ mutationFn: ({ itemId, values }: { itemId: string; values: Record<string, unknown> }) => listsApi.updateItem(organization.id, listId, itemId, values), onSuccess: async () => { setEditingItem(null); await refreshItems(); } });
  const removeItemMutation = useMutation({ mutationFn: (itemId: string) => listsApi.removeItem(organization.id, listId, itemId), onSuccess: refreshItems });
  const removeItemsMutation = useMutation({ mutationFn: (itemIds: string[]) => listsApi.removeItems(organization.id, listId, itemIds), onSuccess: async () => { setSelected(new Set()); await refreshItems(); } });
  const duplicateListMutation = useMutation({ mutationFn: () => listsApi.duplicate(organization.id, listId), onSuccess: async (list) => { await refreshList(); navigate(`/lists/${list.id}`); } });

  async function exportCsv() {
    const result = await listsApi.exportCsv(organization.id, listId);
    const url = URL.createObjectURL(result.blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = result.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openCreate() {
    setEditingItem({ id: "", values: {}, creator: { id: "", name: "", avatar: null }, createdAt: "", updatedAt: "" });
    setEditValues({});
  }
  function openEdit(item: ListItemDto) {
    setEditingItem(item);
    setEditValues({ ...item.values });
  }
  function submitItem(event: FormEvent) {
    event.preventDefault();
    if (editingItem?.id) {
      updateItemMutation.mutate({ itemId: editingItem.id, values: editValues });
    } else {
      createItemMutation.mutate(editValues);
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function toggleSelectAll(items: ListItemDto[]) {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  }

  const list = listQuery.data;
  const items = itemsQuery.data?.items ?? [];
  const total = itemsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (listQuery.isPending) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.lists")} title={t("lists.detailTitle")} />
        <div className="space-y-4">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </Page>
    );
  }
  if (listQuery.isError || !list) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.lists")} title={t("lists.detailTitle")} />
        <EmptyState title={t("lists.listNotFound")} description={t("lists.errorLoadingList")} action={<Button variant="outline" onClick={() => navigate("/lists")}><ChevronLeft />{t("lists.backToLists")}</Button>} />
      </Page>
    );
  }

  return (
    <Page>
      <Breadcrumb items={[{ label: t("navigation.lists"), href: "/lists" }, { label: list.name }]} />
      <PageHeader title={list.name} description={`${list.description ?? t("forms.noDescription")} · ${t("lists.fieldsCount", { count: list.fields.length })} · ${t("lists.recordsCount", { count: list.itemCount })}`} actions={<><ContextualCopilot organizationId={organization.id} resourceType="list" resourceId={listId} resourceName={list.name} /><Button variant="outline" size="sm" onClick={() => toggleAlert.mutate()} loading={toggleAlert.isPending}>{subscribed ? <BellOff /> : <Bell />}{subscribed ? t("subscriptions.removeAlert") : t("subscriptions.alertMe")}</Button><Button variant="outline" size="sm" onClick={() => duplicateListMutation.mutate()} disabled={!canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined}><Copy />{t("common.duplicate")}</Button><Button variant="outline" size="sm" onClick={exportCsv}><Download />{t("lists.exportCsv")}</Button><Button size="sm" onClick={openCreate} disabled={!canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined}><Plus />{t("lists.newRecord")}</Button></>} />

      {!canManage ? <Alert variant="info">{t("lists.readOnlyNotice")}</Alert> : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as "data" | "builder")} items={[{ value: "data", label: t("lists.data") }, ...(canManage ? [{ value: "builder" as const, label: t("lists.builder"), icon: <Settings className="size-4" /> }] : [])]} />

      {tab === "data" ? (
        <DataTable
          list={list}
          canManage={canManage}
          items={items}
          total={total}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          search={search}
          sort={sort}
          order={order}
          selected={selected}
          onSearch={setSearch}
          onSort={(field) => { if (sort === field) setOrder(order === "asc" ? "desc" : "asc"); else { setSort(field); setOrder("asc"); } }}
          onPage={setPage}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={() => toggleSelectAll(items)}
          onEdit={openEdit}
          onRemove={async (id) => { if (await confirm(t("lists.deleteRecordConfirm"))) removeItemMutation.mutate(id); }}
          onRemoveSelected={async () => { if (await confirm(t("lists.deleteSelectedConfirm", { count: selected.size }))) removeItemsMutation.mutate([...selected]); }}
          viewsSlot={
            <SavedViewsDropdown
              resourceType="list"
              resourceId={listId}
              getConfig={() => ({ search, sort, order, pageSize })}
              applyConfig={(config) => {
                setSearch(typeof config.search === "string" ? config.search : "");
                setSort(typeof config.sort === "string" ? config.sort : "");
                setOrder(config.order === "desc" ? "desc" : "asc");
                setPage(1);
              }}
            />
          }
        />
      ) : (
        <ListBuilder list={list} onSaved={refreshList} />
      )}

      {editingItem ? (
        <ItemDialog list={list} item={editingItem} values={editValues} onChange={setEditValues} onSubmit={submitItem} onClose={() => setEditingItem(null)} pending={createItemMutation.isPending || updateItemMutation.isPending} />
      ) : null}
      {confirmDialog}
    </Page>
  );
}

interface DataTableProps {
  list: ListDefinitionDto;
  canManage: boolean;
  items: ListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search: string;
  sort: string;
  order: "asc" | "desc";
  selected: Set<string>;
  onSearch: (value: string) => void;
  onSort: (field: string) => void;
  onPage: (page: number) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (item: ListItemDto) => void;
  onRemove: (id: string) => void;
  onRemoveSelected: () => void;
  viewsSlot?: ReactNode;
}

function DataTable(props: DataTableProps) {
  const { t } = useTranslation();
  const { formatDate, formatDateTime, formatNumber } = useLocaleFormatter();
  const { list, items, total, page, totalPages, search, sort, order, selected, canManage, onSearch, onSort, onPage, onToggleSelect, onToggleSelectAll, onEdit, onRemove, onRemoveSelected, viewsSlot } = props;
  const allSelected = selected.size > 0 && selected.size === items.length;
  return <div className="space-y-3"><Toolbar><Input className="flex-1" placeholder={t("common.search")} value={search} onChange={(event) => onSearch(event.target.value)} />{viewsSlot}{selected.size ? <Button variant="destructive" size="sm" onClick={onRemoveSelected}><Trash2 />{t("lists.deleteSelected", { count: selected.size })}</Button> : null}</Toolbar>{items.length === 0 ? <EmptyState title={t("lists.noRecords")} description={t("lists.noRecordsDesc")} /> : <TableContainer><Table><TableHeader><TableRow>{canManage ? <TableHead className="w-10"><Checkbox checked={allSelected} onChange={onToggleSelectAll} aria-label={t("common.selectAll")} /></TableHead> : null}{list.fields.map((field) => <TableHead key={field.id}><button className="flex items-center gap-1 hover:text-foreground" onClick={() => onSort(field.slug)}>{field.name}{sort === field.slug ? order === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}</button></TableHead>)}<TableHead>{t("lists.createdBy")}</TableHead><TableHead>{t("lists.updated")}</TableHead>{canManage ? <TableHead className="text-right">{t("common.actions")}</TableHead> : null}</TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id} data-selected={selected.has(item.id)}>{canManage ? <TableCell><Checkbox checked={selected.has(item.id)} onChange={() => onToggleSelect(item.id)} aria-label={t("lists.selectRecord")} /></TableCell> : null}{list.fields.map((field) => <TableCell key={field.id}>{formatValue(field, item.values[field.slug], t, formatDate, formatDateTime, formatNumber)}</TableCell>)}<TableCell>{item.creator.name || "—"}</TableCell><TableCell>{formatDate(item.updatedAt)}</TableCell>{canManage ? <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" onClick={() => onEdit(item)} title={t("common.edit")}><Settings /></Button><Button variant="ghost" size="icon-sm" className="text-danger hover:bg-danger-subtle hover:text-danger" onClick={() => onRemove(item.id)} title={t("common.delete")}><Trash2 /></Button></div></TableCell> : null}</TableRow>)}</TableBody></Table></TableContainer>}<Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPage} /></div>;
}

function formatValue(field: ListFieldDto, value: unknown, t: (key: string) => string, formatDate: (v: string | Date) => string, formatDateTime: (v: string | Date) => string, formatNumber: (v: number, o?: Intl.NumberFormatOptions) => string): string {
  if (value == null || value === "") return "—";
  switch (field.type) {
    case "boolean": return value ? t("common.yes") : t("common.no");
    case "currency": return typeof value === "number" ? formatNumber(value, { style: "currency", currency: "EUR" }) : String(value);
    case "date": return formatDate(String(value));
    case "datetime": return formatDateTime(String(value));
    case "choice": {
      const opt = field.options?.find((o) => o.value === value);
      return opt?.label ?? String(value);
    }
    default: return String(value);
  }
}

interface ItemDialogProps {
  list: ListDefinitionDto;
  item: ListItemDto;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  pending: boolean;
}

function ItemDialog({list, item, values, onChange, onSubmit, onClose, pending }: ItemDialogProps) {
  const { t } = useTranslation();
  function setField(slug: string, value: unknown) { onChange({ ...values, [slug]: value }); }
  return <Dialog open onOpenChange={(open) => !open && onClose()} title={item.id ? t("lists.editRecord") : t("lists.newRecord")} description={list.fields.length ? t("lists.fillFields", { name: list.name }) : t("lists.addFieldsFirst")} footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="list-item-form" loading={pending} disabled={!list.fields.length}>{t("common.save")}</Button></>}><form id="list-item-form" className="space-y-4" onSubmit={onSubmit}>{list.fields.map((field) => <FieldInput key={field.id} field={field} value={values[field.slug]} onChange={(value) => setField(field.slug, value)} />)}</form></Dialog>;
}

function FieldInput({ field, value, onChange }: { field: ListFieldDto; value: unknown; onChange: (value: unknown) => void }) {
  const { t } = useTranslation();
  if (field.type === "boolean") return <label className="flex items-center gap-2 rounded-md bg-surface-secondary p-3 text-sm font-medium text-secondary-foreground"><Checkbox id={field.id} checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />{field.name}</label>;
  let control: React.ReactNode;
  if (field.type === "longtext") control = <Textarea rows={4} value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} required={field.required} />;
  else if (field.type === "choice") control = <Select value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} required={field.required}><option value="">—</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>;
  else control = <Input type={field.type === "currency" || field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : ["date", "email", "url"].includes(field.type) ? field.type : "text"} step={field.type === "currency" ? "0.01" : field.type === "number" ? "any" : undefined} value={(value as string | number) ?? ""} onChange={(event) => onChange(event.target.value)} required={field.required} placeholder={["user", "relation", "file"].includes(field.type) ? t("lists.referenceId") : undefined} />;
  return <Field label={field.name} required={field.required}>{control}</Field>;
}

function ListBuilder({ list, onSaved }: { list: ListDefinitionDto; onSaved: () => void }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const FIELD_TYPE_LABELS: Record<ListFieldType, string> = {
  text: t("forms.fieldText"),
  longtext: t("forms.fieldLongText"),
  number: t("forms.fieldNumber"),
  currency: t("forms.fieldCurrency"),
  date: t("forms.fieldDate"),
  datetime: t("forms.fieldDateTime"),
  boolean: t("forms.fieldBoolean"),
  choice: t("forms.fieldChoice"),
  email: t("forms.fieldEmail"),
  url: t("forms.fieldUrl"),
  user: t("forms.fieldUser"),
  relation: t("lists.fieldRelation"),
  file: t("forms.fieldFile")
};
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [fields, setFields] = useState<ListFieldInput[]>(() => list.fields.map((f) => ({ ...f })));
  const [saving, setSaving] = useState(false);

  const allListsQuery = useQuery({ queryKey: ["lists", organization.id, "all"], queryFn: () => listsApi.list(organization.id, {}) });

  function addField() {
    setFields([...fields, { name: "", slug: "", type: "text", required: false, options: null, relationListId: null, order: fields.length }]);
  }
  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i })));
  }
  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    setFields(next.map((f, i) => ({ ...f, order: i })));
  }
  function updateField(index: number, patch: Partial<ListFieldInput>) {
    setFields(fields.map((f, i) => {
      if (i !== index) return f;
      const updated = { ...f, ...patch };
      if (patch.name && !patch.slug) updated.slug = slugify(patch.name);
      if (patch.type && patch.type !== "choice") updated.options = null;
      if (patch.type && patch.type !== "relation") updated.relationListId = null;
      return updated;
    }));
  }
  function addOption(index: number) {
    setFields(fields.map((f, i) => {
      if (i !== index) return f;
      const options = [...(f.options ?? []), { value: "", label: "" }];
      return { ...f, options };
    }));
  }
  function updateOption(fieldIndex: number, optionIndex: number, patch: { value?: string; label?: string }) {
    setFields(fields.map((f, i) => {
      if (i !== fieldIndex || !f.options) return f;
      const options = f.options.map((o, j) => j === optionIndex ? { ...o, ...patch } : o);
      return { ...f, options };
    }));
  }
  function removeOption(fieldIndex: number, optionIndex: number) {
    setFields(fields.map((f, i) => {
      if (i !== fieldIndex || !f.options) return f;
      return { ...f, options: f.options.filter((_, j) => j !== optionIndex) };
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await listsApi.update(organization.id, list.id, { name, description: description || null, fields });
      await queryClient.invalidateQueries({ queryKey: ["list", organization.id, list.id] });
      await queryClient.invalidateQueries({ queryKey: ["list-items", organization.id, list.id] });
      await queryClient.invalidateQueries({ queryKey: ["lists", organization.id] });
      onSaved();
      toast({ tone: "success", title: t("lists.saved") });
    } catch (error) {
      toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error as Error, t) });
    } finally {
      setSaving(false);
    }
  }

  const otherLists = (allListsQuery.data?.lists ?? []).filter((l) => l.id !== list.id);

  return (
    <form className="space-y-6" onSubmit={save}>
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h3 className="nx-h3 text-foreground">{t("lists.properties")}</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t("common.name")} htmlFor="list-name"><Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></Field>
          <Field label={t("common.description")} htmlFor="list-description"><Input id="list-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={480} /></Field>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="nx-h3 text-foreground">{t("common.fields")} ({fields.length})</h3>
          <Button type="button" size="sm" variant="outline" onClick={addField}><Plus className="size-4" />{t("forms.addField")}</Button>
        </div>
        <div className="mt-4 space-y-3">
          {fields.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("documents.meta.noFields")}</p> : null}
          {fields.map((field, index) => (
            <div key={index} className="rounded-md border border-border bg-surface-secondary p-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1 pt-2">
                  <button type="button" className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 nx-focus-ring" disabled={index === 0} onClick={() => moveField(index, -1)} aria-label={t("common.moveUp")}><ArrowUp className="size-4" /></button>
                  <button type="button" className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 nx-focus-ring" disabled={index === fields.length - 1} onClick={() => moveField(index, 1)} aria-label={t("common.moveDown")}><ArrowDown className="size-4" /></button>
                </div>
                <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label={t("common.name")} htmlFor={`${index}-name`}><Input id={`${index}-name`} value={field.name} onChange={(e) => updateField(index, { name: e.target.value })} required maxLength={120} /></Field>
                  <Field label={t("lists.fieldSlug")} htmlFor={`${index}-slug`}><Input id={`${index}-slug`} value={field.slug} onChange={(e) => updateField(index, { slug: e.target.value })} required /></Field>
                  <Field label={t("common.type")} htmlFor={`${index}-type`}>
                    <Select id={`${index}-type`} value={field.type} onChange={(e) => updateField(index, { type: e.target.value as ListFieldType })}>
                      {FIELD_TYPES.map((type) => <option key={type} value={type}>{FIELD_TYPE_LABELS[type]}</option>)}
                    </Select>
                  </Field>
                  <label className="flex items-center gap-2 pt-6"><Checkbox checked={field.required} onChange={(e) => updateField(index, { required: e.target.checked })} /><span className="text-sm text-secondary-foreground">{t("common.required")}</span></label>
                </div>
                <Button variant="ghost" size="icon-sm" className="mt-2 text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={() => removeField(index)} aria-label={t("lists.removeField")}><Trash2 className="size-4" /></Button>
              </div>
              {field.type === "choice" ? (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between"><span className="nx-label text-muted-foreground">{t("common.options")}</span><button type="button" className="text-xs text-primary transition-opacity hover:opacity-80 nx-focus-ring" onClick={() => addOption(index)}>{t("common.addOption")}</button></div>
                  {(field.options ?? []).map((opt, optionIndex) => (
                    <div key={optionIndex} className="flex items-center gap-2">
                      <Input className="h-8 w-32 text-xs" placeholder={t("common.value")} value={opt.value} onChange={(e) => updateOption(index, optionIndex, { value: e.target.value })} />
                      <Input className="h-8 flex-1 text-xs" placeholder={t("common.label")} value={opt.label} onChange={(e) => updateOption(index, optionIndex, { label: e.target.value })} />
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={() => removeOption(index, optionIndex)} aria-label={t("lists.removeOption")}><X className="size-3.5" /></Button>
                    </div>
                  ))}
                </div>
              ) : null}
              {field.type === "relation" ? (
                <div className="mt-3 border-t border-border pt-3">
                  <Field label={t("lists.relationTarget")} htmlFor={`${index}-relation`}>
                    <Select id={`${index}-relation`} className="max-w-xs" value={field.relationListId ?? ""} onChange={(e) => updateField(index, { relationListId: e.target.value || null })}>
                      <option value="">—</option>
                      {otherLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </Select>
                  </Field>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !name.trim()}><Save className="size-4" />{saving ? t("common.saving") : t("lists.saveList")}</Button>
      </div>
    </form>
  );
}
