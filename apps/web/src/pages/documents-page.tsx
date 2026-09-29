import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocumentItemDto, FolderItemDto, FolderMetadataFieldDto, GovernanceSettings, QuickActionDto, SavedViewConfig } from "@nexora/contracts";
import {
  Bell,
  BellOff,
  Clock,
  Copy,
  Download,
  File,
  FileArchive,
  FileBadge,
  FileImage,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Grid2X2,
  KeyRound,
  List,
  Lock,
  MoreHorizontal,
  Move,
  Pin,
  PinOff,
  Search,
  Share2,
  Shield,
  ShieldAlert,
  Star,
  Tags,
  Trash2,
  Upload,
  X,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { useWorkspace } from "../components/layout/app-layout";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import {
  Alert,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Checkbox,
  Dialog,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  EmptyState,
  Field,
  Input,
  Page,
  PageHeader,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useConfirm,
  useToast
} from "../components/ui";
import { FolderMetadataDialog } from "../components/documents/folder-metadata-dialog";
import { FolderGovernanceDialog } from "../components/documents/folder-governance-dialog";
import { ManageAccessDialog } from "../components/documents/manage-access-dialog";
import { SavedViewsDropdown } from "../components/views/saved-views-dropdown";
import { collectDroppedFiles, directoryOf, UploadQueuePanel, type DroppedFile, type UploadQueueItem } from "../components/documents/upload-queue";
import { ApiClientError, automationApi, documentsApi, subscriptionsApi, templatesApi, usersApi, type FileManagerItem } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

type TransferMode = "move" | "copy";
type QuickView = "all" | "recent" | "favorites" | "shared";
const ITEM_ALERT_EVENTS = ["created", "updated", "deleted", "version.added", "commented"];
type ItemActions = {
  open: (item: FileManagerItem) => void;
  download: (item: DocumentItemDto) => void;
  favorite: (item: FileManagerItem) => void;
  rename: (item: FileManagerItem) => void;
  transfer: (items: FileManagerItem[], mode: TransferMode) => void;
  share: (items: FileManagerItem[]) => void;
  remove: (items: FileManagerItem[]) => void;
  metadata: (item: FolderItemDto) => void;
  governance: (item: FolderItemDto) => void;
  access: (item: FileManagerItem) => void;
  pin: (item: FileManagerItem) => void;
  alert: (item: FileManagerItem) => void;
  template: (item: FileManagerItem) => void;
  alerts: Set<string>;
  select: (item: FileManagerItem, selected: boolean) => void;
  selected: Set<string>;
  quickActions: QuickActionDto[];
  runQuickAction: (action: QuickActionDto, item: FileManagerItem) => void;
};

export function DocumentsPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const canEditDocuments = organization.permissions.includes("documents.edit");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const [params, setParams] = useSearchParams();
  const folderId = params.get("folder") || undefined;
  const search = params.get("search") || "";
  const sort = params.get("sort") || "name";
  const order = params.get("order") || "asc";
  const filter = params.get("filter") || "all";
  const metaFilter = params.get("meta") || "";
  const metaSlug = metaFilter.split(":")[0] ?? "";
  const metaValue = metaFilter.includes(":") ? metaFilter.split(":").slice(1).join(":") : "";
  const [view, setView] = useState<"list" | "grid">(() => localStorage.getItem("nexora.documents.view") === "grid" ? "grid" : "list");
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renameItem, setRenameItem] = useState<FileManagerItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [transfer, setTransfer] = useState<{ items: FileManagerItem[]; mode: TransferMode } | null>(null);
  const [shareItems, setShareItems] = useState<FileManagerItem[]>([]);
  const [metadataFolder, setMetadataFolder] = useState<FolderItemDto | null>(null);
  const [governanceFolder, setGovernanceFolder] = useState<FolderItemDto | null>(null);
  const [accessItem, setAccessItem] = useState<FileManagerItem | null>(null);
  const [quickView, setQuickView] = useState<QuickView>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const queryKey = ["documents", organization.id, folderId, search, sort, order, filter, metaFilter];
  const listing = useQuery({ queryKey, queryFn: () => documentsApi.list(organization.id, { folderId, search: search || undefined, sort, order, filter, meta: metaFilter || undefined }) });
  const quickActionsQuery = useQuery({ queryKey: ["quick-actions", organization.id, folderId], queryFn: () => automationApi.listQuickActions(organization.id, { folderId }) });
  const recentQuery = useQuery({ queryKey: ["documents-recent", organization.id], queryFn: () => documentsApi.recent(organization.id), enabled: quickView === "recent" });
  const favoritesQuery = useQuery({ queryKey: ["documents-favorites", organization.id], queryFn: () => documentsApi.favorites(organization.id), enabled: quickView === "favorites" });
  const sharedQuery = useQuery({ queryKey: ["documents-shared", organization.id], queryFn: () => documentsApi.shared(organization.id), enabled: quickView === "shared" });
  const subscriptionsQuery = useQuery({ queryKey: ["subscriptions", organization.id], queryFn: () => subscriptionsApi.mine(organization.id) });
  const alertKeys = useMemo(() => new Set((subscriptionsQuery.data?.subscriptions ?? []).map((subscription) => `${subscription.targetType}:${subscription.targetId}`)), [subscriptionsQuery.data]);
  const baseItems = useMemo<FileManagerItem[]>(() => {
    if (quickView === "recent") return recentQuery.data?.documents ?? [];
    if (quickView === "favorites") return [...(favoritesQuery.data?.folders ?? []), ...(favoritesQuery.data?.documents ?? [])];
    if (quickView === "shared") return sharedQuery.data?.sharedWithMe ?? [];
    return [...(listing.data?.folders ?? []), ...(listing.data?.documents ?? [])];
  }, [quickView, recentQuery.data, favoritesQuery.data, sharedQuery.data, listing.data]);
  const items = useMemo(() => quickView === "all" || !search ? baseItems : baseItems.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())), [baseItems, quickView, search]);
  const activeQuery = quickView === "recent" ? recentQuery : quickView === "favorites" ? favoritesQuery : quickView === "shared" ? sharedQuery : listing;
  const currentGovernance = quickView === "all" ? listing.data?.folder?.governance ?? null : null;
  const activeDocuments = useMemo(() => items.filter((item): item is DocumentItemDto => item.kind === "document"), [items]);
  const selectedItems = useMemo(() => items.filter((item) => selected.has(itemKey(item))), [items, selected]);
  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : undefined;
  const detailQueries = useQueries({ queries: activeDocuments.map((document) => ({ queryKey: ["document", organization.id, document.id], queryFn: () => documentsApi.get(organization.id, document.id), staleTime: 60_000 })) });
  const versionStates = new Map(activeDocuments.map((document, index) => [document.id, { version: detailQueries[index]?.data?.versions[0]?.version, pending: detailQueries[index]?.isPending }]));

  useEffect(() => setSelected(new Set()), [folderId, search, filter, quickView]);

  const refresh = async () => {
    setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] });
    await queryClient.invalidateQueries({ queryKey: ["documents-recent", organization.id] });
    await queryClient.invalidateQueries({ queryKey: ["documents-favorites", organization.id] });
    await queryClient.invalidateQueries({ queryKey: ["documents-shared", organization.id] });
  };
  const notifyError = (title: string) => (error: Error) => {
    if (error instanceof ApiClientError && error.code === "RETENTION_BLOCKED") {
      toast({ tone: "danger", title, description: t("governance.retentionBlocked") });
      return;
    }
    if (error instanceof ApiClientError && error.code === "SENSITIVITY_BLOCKED") {
      toast({ tone: "danger", title, description: t("governance.sensitivityBlocked") });
      return;
    }
    toast({ tone: "danger", title, description: apiErrorText(error, t) });
  };
  const createFolder = useMutation({ mutationFn: () => documentsApi.createFolder(organization.id, folderName.trim(), folderId ?? null), onSuccess: async () => { setFolderDialog(false); setFolderName(""); await refresh(); toast({ tone: "success", title: t("documents.folderCreated") }); }, onError: notifyError(t("documents.errorCreatingFolder")) });
  const upload = useMutation({ mutationFn: (file: File) => documentsApi.upload(organization.id, file, folderId ?? null), onSuccess: async (result) => { await refresh(); toast({ tone: "success", title: t("dashboard.documentAdded"), description: result.document.name }); }, onError: notifyError(t("documents.errorAddingDocument")) });
  const createEditorDoc = useMutation({
    mutationFn: (kind: "DOC" | "SHEET") => documentsApi.createEditorDocument(organization.id, { kind, name: kind === "DOC" ? t("editor.defaultDocName") : t("editor.defaultSheetName"), folderId: folderId ?? null }),
    onSuccess: async (result) => { await refresh(); navigate(`/documents/${result.document.id}/editor`); },
    onError: notifyError(t("editor.createError"))
  });
  const rename = useMutation({ mutationFn: () => documentsApi.rename(organization.id, renameItem!, renameValue.trim()), onSuccess: async () => { setRenameItem(null); await refresh(); toast({ tone: "success", title: t("documents.nameUpdated") }); }, onError: notifyError(t("documents.errorRenaming")) });
  const transferMutation = useMutation({ mutationFn: async (destinationId: string | null) => { if (!transfer) return; for (const item of transfer.items) { if (transfer.mode === "move") await documentsApi.move(organization.id, item, destinationId); else await documentsApi.copy(organization.id, item, destinationId); } }, onSuccess: async () => { const mode = transfer?.mode; setTransfer(null); await refresh(); toast({ tone: "success", title: mode === "move" ? t("documents.movedItems") : t("documents.copiedItems") }); }, onError: notifyError(t("documents.errorTransfer")) });
  const favorite = useMutation({ mutationFn: (item: FileManagerItem) => documentsApi.favorite(organization.id, item, !item.favorite), onSuccess: refresh, onError: notifyError(t("documents.errorFavorite")) });
  const pin = useMutation({ mutationFn: (item: FileManagerItem) => documentsApi.pin(organization.id, item, !item.pinnedAt), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("documents.pinUpdated") }); }, onError: notifyError(t("documents.errorPin")) });
  const remove = useMutation({ mutationFn: async (targets: FileManagerItem[]) => { for (const item of targets) await documentsApi.remove(organization.id, item); }, onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("documents.itemsDeleted") }); }, onError: notifyError(t("documents.errorDeleting")) });
  const toggleAlert = useMutation({
    mutationFn: async (item: FileManagerItem) => {
      if (alertKeys.has(itemKey(item))) await subscriptionsApi.unsubscribe(organization.id, { targetType: item.kind, targetId: item.id });
      else await subscriptionsApi.subscribe(organization.id, { targetType: item.kind, targetId: item.id, events: ITEM_ALERT_EVENTS });
    },
    onSuccess: async (_result, item) => {
      const wasSubscribed = alertKeys.has(itemKey(item));
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", organization.id] });
      toast({ tone: "success", title: wasSubscribed ? t("subscriptions.removed") : t("subscriptions.activated") });
    },
    onError: notifyError(t("subscriptions.errorSaving"))
  });
  const toggleTemplate = useMutation({
    mutationFn: (item: FileManagerItem): Promise<unknown> => item.kind === "document" ? templatesApi.setDocumentTemplate(organization.id, item.id, !item.isTemplate) : templatesApi.setFolderTemplate(organization.id, item.id, !item.isTemplate),
    onSuccess: async (_result, item) => {
      await refresh();
      toast({ tone: "success", title: item.isTemplate ? t("templates.unmarked") : t("templates.marked") });
    },
    onError: notifyError(t("templates.errorMarking"))
  });
  const runQuickAction = useMutation({
    mutationFn: ({ action, item }: { action: QuickActionDto; item: FileManagerItem }) => automationApi.runQuickAction(organization.id, action.id, item.id),
    onSuccess: async (_result, { action, item }) => {
      await queryClient.invalidateQueries({ queryKey: ["workflow-instances", organization.id] });
      toast({ tone: "success", title: t("automation.actionStarted"), description: t("automation.actionStartedDesc", { action: action.name, name: item.name }) });
    },
    onError: notifyError(t("automation.errorRunning"))
  });

  function updateParam(key: string, value?: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "folder") next.delete("folder");
    setParams(next);
  }
  function openFolder(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set("folder", id); else next.delete("folder");
    setParams(next);
  }
  function openItem(item: FileManagerItem) { if (item.kind === "folder") { setQuickView("all"); openFolder(item.id); } else navigate(item.documentKind === "FILE" ? `/documents/${item.id}` : `/documents/${item.id}/editor`); }
  async function download(document: DocumentItemDto) {
    try {
      const result = await documentsApi.download(organization.id, document.id);
      saveBlob(result);
    } catch (error) { notifyError(t("documents.errorDownload"))(error as Error); }
  }
  async function downloadSelected() {
    try {
      const result = await documentsApi.bulkDownload(organization.id, {
        documentIds: selectedItems.filter((item) => item.kind === "document").map((item) => item.id),
        folderIds: selectedItems.filter((item) => item.kind === "folder").map((item) => item.id)
      });
      saveBlob(result);
    } catch (error) { notifyError(t("documents.errorDownload"))(error as Error); }
  }
  function changeView(next: "list" | "grid") { setView(next); localStorage.setItem("nexora.documents.view", next); }
  function getViewConfig(): SavedViewConfig {
    return { search, sort, order, filter, meta: metaFilter, view };
  }
  function applyViewConfig(config: SavedViewConfig) {
    const next = new URLSearchParams(params);
    for (const key of ["search", "sort", "order", "filter", "meta"]) {
      const value = config[key];
      if (typeof value === "string" && value) next.set(key, value); else next.delete(key);
    }
    setParams(next);
    if (config.view === "list" || config.view === "grid") changeView(config.view);
  }
  function updateQueueEntry(id: string, patch: Partial<UploadQueueItem>) {
    setUploadQueue((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }
  function enqueueUploads(files: DroppedFile[]) {
    if (!files.length) return;
    const entries = files.map<UploadQueueItem>((dropped) => ({ id: crypto.randomUUID(), name: dropped.file.name, path: dropped.path, status: "pending" }));
    setUploadQueue((current) => [...current, ...entries]);
    void (async () => {
      let succeeded = 0;
      let failed = 0;
      for (let index = 0; index < files.length; index += 1) {
        const entry = entries[index]!;
        const dropped = files[index]!;
        updateQueueEntry(entry.id, { status: "uploading" });
        try {
          await documentsApi.upload(organization.id, dropped.file, folderId ?? null, dropped.path);
          updateQueueEntry(entry.id, { status: "done" });
          succeeded += 1;
        } catch {
          updateQueueEntry(entry.id, { status: "error" });
          failed += 1;
        }
      }
      await refresh();
      toast({ tone: failed ? "warning" : "success", title: t("documents.uploadsFinished"), description: t("documents.uploadsSummary", { done: succeeded, failed }) });
    })();
  }
  function isFileDrag(event: React.DragEvent) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }
  function onDragEnter(event: React.DragEvent) {
    if (!canEditDocuments || !isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragOver(event: React.DragEvent) {
    if (!canEditDocuments || !isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave(event: React.DragEvent) {
    if (!isFileDrag(event)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }
  async function onDrop(event: React.DragEvent) {
    if (!canEditDocuments || !isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    try {
      const files = await collectDroppedFiles(event.dataTransfer);
      enqueueUploads(files);
    } catch (error) {
      notifyError(t("documents.errorAddingDocument"))(error as Error);
    }
  }
  async function askRemove(targets: FileManagerItem[]) {
    if (!targets.length) return;
    const folders = targets.filter((item) => item.kind === "folder").length;
    const warning = folders ? ` ${t("documents.deleteWarning")}` : "";
    const confirmMsg = targets.length === 1 ? t("documents.deleteItemConfirm", { name: targets[0]!.name }) : t("documents.deleteItemsConfirm", { count: targets.length });
    if (await confirm(`${confirmMsg}${warning} ${t("documents.deleteActionWarning")}`)) remove.mutate(targets);
  }
  function setItemSelected(item: FileManagerItem, checked: boolean) { setSelected((current) => { const next = new Set(current); if (checked) next.add(itemKey(item)); else next.delete(itemKey(item)); return next; }); }
  function selectAll(checked: boolean) { setSelected(checked ? new Set(items.map(itemKey)) : new Set()); }
  const metadataFields = useMemo(() => (listing.data?.metadataFields ?? []).slice().sort((a, b) => a.order - b.order).slice(0, 3), [listing.data]);
  const actions: ItemActions = { open: openItem, download, favorite: (item) => favorite.mutate(item), rename: (item) => { setRenameItem(item); setRenameValue(item.name); }, transfer: (targets, mode) => setTransfer({ items: targets, mode }), share: setShareItems, remove: askRemove, metadata: setMetadataFolder, governance: setGovernanceFolder, access: setAccessItem, pin: (item) => pin.mutate(item), alert: (item) => toggleAlert.mutate(item), template: (item) => toggleTemplate.mutate(item), alerts: alertKeys, select: setItemSelected, selected, quickActions: quickActionsQuery.data?.actions ?? [], runQuickAction: (action, item) => runQuickAction.mutate({ action, item }) };

  return (
    <Page className="space-y-5" onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={(event) => void onDrop(event)}>
      {dragging ? <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center border-4 border-dashed border-primary bg-primary/10"><div className="rounded-lg border border-border bg-surface px-8 py-6 text-center shadow-[var(--nx-shadow-overlay)]"><Upload className="mx-auto size-8 text-primary" /><p className="nx-h3 mt-3">{t("documents.dropToUpload")}</p><p className="mt-1 text-sm text-muted-foreground">{t("documents.dropToUploadDesc")}</p></div></div> : null}
      <UploadQueuePanel items={uploadQueue} onDismiss={() => setUploadQueue([])} />
      <PageHeader
        eyebrow={organization.name}
        title={t("documents.title")}
        description={t("documents.pageDescription")}
        actions={<div className="flex flex-col gap-2 sm:flex-row"><ContextualHelpButton route="/documents" showLabel /><Button variant="outline" onClick={() => navigate("/documents/trash")}><Trash2 />{t("documents.trash.title")}</Button><Button variant="outline" onClick={() => setTemplatesOpen(true)} disabled={!canEditDocuments} title={!canEditDocuments ? t("errors.FORBIDDEN") : undefined}><FileBadge />{t("templates.newFromTemplate")}</Button><Button variant="outline" onClick={() => setFolderDialog(true)} disabled={!canEditDocuments} title={!canEditDocuments ? t("errors.FORBIDDEN") : undefined}><FolderPlus />{t("documents.newFolder")}</Button><Button variant="outline" onClick={() => folderInput.current?.click()} disabled={!canEditDocuments} title={!canEditDocuments ? t("errors.FORBIDDEN") : undefined}><FolderUp />{t("documents.uploadFolder")}</Button><Dropdown trigger={<Button variant="outline" disabled={!canEditDocuments} title={!canEditDocuments ? t("errors.FORBIDDEN") : undefined}><FilePlus2 />{t("editor.new")}</Button>}><DropdownItem onClick={() => createEditorDoc.mutate("DOC")}><FileText className="size-4" />{t("editor.newDoc")}</DropdownItem><DropdownItem onClick={() => createEditorDoc.mutate("SHEET")}><FileSpreadsheet className="size-4" />{t("editor.newSheet")}</DropdownItem></Dropdown><Button onClick={() => fileInput.current?.click()} loading={upload.isPending} disabled={!canEditDocuments} title={!canEditDocuments ? t("errors.FORBIDDEN") : undefined}><Upload />{t("documents.addDocument")}</Button><input ref={fileInput} className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }} /><input ref={(element) => { folderInput.current = element; if (element && !element.hasAttribute("webkitdirectory")) element.setAttribute("webkitdirectory", ""); }} className="hidden" type="file" onChange={(event) => { const files = Array.from(event.target.files ?? []).map((file) => ({ file, path: directoryOf(file.webkitRelativePath) })); if (files.length) enqueueUploads(files); event.target.value = ""; }} /></div>} />

      {!canEditDocuments ? <Alert variant="info">{t("documents.readOnlyNotice")}</Alert> : null}

      <Breadcrumb items={(listing.data?.breadcrumbs ?? [{ id: null, name: t("documents.breadcrumb") }]).map((crumb) => ({ label: crumb.name, href: crumb.id ? `/documents?folder=${crumb.id}` : "/documents", icon: crumb.id ? undefined : <FolderOpen className="size-4" /> }))} />

      <section className="rounded-lg border border-border bg-surface shadow-sm">
        {selectedItems.length ? <SelectionToolbar items={selectedItems} onClear={() => setSelected(new Set())} onDownload={() => void downloadSelected()} onMove={() => setTransfer({ items: selectedItems, mode: "move" })} onCopy={() => setTransfer({ items: selectedItems, mode: "copy" })} onShare={() => setShareItems(selectedItems)} onRemove={() => askRemove(selectedItems)} /> : <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center"><div className="flex h-10 w-fit shrink-0 items-center gap-0.5 rounded-md border border-border-strong p-1" role="group" aria-label={t("documents.quickViews")}>{(["all", "recent", "favorites", "shared"] as const).map((value) => <Button key={value} variant={quickView === value ? "secondary" : "ghost"} size="sm" aria-pressed={quickView === value} onClick={() => setQuickView(value)}>{{ all: t("documents.viewAll"), recent: t("documents.viewRecent"), favorites: t("documents.viewFavorites"), shared: t("documents.viewShared") }[value]}</Button>)}</div><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={t("documents.search")} className="pl-9 pr-9" placeholder={t("documents.search")} value={search} onChange={(event) => updateParam("search", event.target.value)} />{search ? <button type="button" aria-label={t("documents.clearSearch")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => updateParam("search")}><X className="size-4" /></button> : null}</div><div className="grid grid-cols-2 gap-2 sm:flex">{quickView === "all" ? <><Select aria-label={t("common.filters")} className="min-w-36" value={filter} onChange={(event) => updateParam("filter", event.target.value)}><option value="all">{t("documents.filterAll")}</option><option value="documents">{t("documents.filterDocuments")}</option><option value="folders">{t("documents.filterFolders")}</option><option value="favorites">{t("documents.filterFavorites")}</option></Select>{(listing.data?.metadataFields ?? []).length > 0 ? <><Select aria-label={t("documents.metaFilterField")} className="min-w-36" value={metaSlug} onChange={(event) => { const slug = event.target.value; updateParam("meta", slug ? `${slug}:${metaValue}` : undefined); }}><option value="">{t("documents.metaFilterAll")}</option>{(listing.data?.metadataFields ?? []).map((field) => <option key={field.id} value={field.slug}>{field.name}</option>)}</Select>{metaSlug ? <Input aria-label={t("documents.metaFilterValue")} className="min-w-32" placeholder={t("documents.metaFilterValue")} value={metaValue} onChange={(event) => updateParam("meta", `${metaSlug}:${event.target.value}`)} /> : null}</> : null}<Select aria-label={t("common.sort")} className="min-w-40" value={`${sort}:${order}`} onChange={(event) => { const [nextSort, nextOrder] = event.target.value.split(":"); const next = new URLSearchParams(params); next.set("sort", nextSort!); next.set("order", nextOrder!); setParams(next); }}><option value="name:asc">{t("documents.sortNameAsc")}</option><option value="name:desc">{t("documents.sortNameDesc")}</option><option value="updatedAt:desc">{t("documents.sortRecent")}</option><option value="updatedAt:asc">{t("documents.sortOldest")}</option><option value="size:desc">{t("documents.sortSize")}</option><option value="type:asc">{t("documents.sortType")}</option><option value="owner:asc">{t("documents.sortOwner")}</option></Select><SavedViewsDropdown resourceType="documents" resourceId={folderId ?? null} getConfig={getViewConfig} applyConfig={applyViewConfig} /></> : null}<div className="col-span-2 flex h-10 items-center rounded-md border border-border-strong p-1 sm:col-auto"><Button variant={view === "list" ? "secondary" : "ghost"} size="icon-sm" aria-label={t("documents.listView")} onClick={() => changeView("list")}><List /></Button><Button variant={view === "grid" ? "secondary" : "ghost"} size="icon-sm" aria-label={t("documents.gridView")} onClick={() => changeView("grid")}><Grid2X2 /></Button></div></div></div>}

        {activeQuery.isPending ? <DocumentsSkeleton view={view} /> : null}
        {activeQuery.isError ? <div className="p-6"><Alert variant="danger" title={t("documents.loadingError")}><p>{apiErrorText(activeQuery.error, t)}</p><Button className="mt-4" size="sm" onClick={() => void activeQuery.refetch()}>{t("common.retry")}</Button></Alert></div> : null}
        {activeQuery.data && items.length === 0 ? (quickView === "all" ? <EmptyDocuments filtered={Boolean(search || filter !== "all")} canEdit={canEditDocuments} onUpload={() => fileInput.current?.click()} onCreateFolder={() => setFolderDialog(true)} /> : <EmptyState icon={quickView === "recent" ? Clock : quickView === "shared" ? Share2 : Star} title={quickView === "recent" ? t("documents.recentEmpty") : quickView === "shared" ? t("documents.sharedEmpty") : t("documents.favoritesEmpty")} description={quickView === "recent" ? t("documents.recentEmptyDesc") : quickView === "shared" ? t("documents.sharedEmptyDesc") : t("documents.favoritesEmptyDesc")} />) : null}
        {activeQuery.data && items.length > 0 ? <div className={selectedItem ? "grid xl:grid-cols-[minmax(0,1fr)_19rem]" : ""}><div className="min-w-0">{view === "list" ? <ListView items={items} versions={versionStates} actions={actions} fields={metadataFields} inheritedGovernance={currentGovernance} onSelectAll={selectAll} allSelected={selected.size === items.length} /> : <GridView items={items} actions={actions} inheritedGovernance={currentGovernance} />}</div>{selectedItem ? <DetailPanel item={selectedItem} version={selectedItem.kind === "document" ? versionStates.get(selectedItem.id)?.version : undefined} actions={actions} onClose={() => setSelected(new Set())} /> : null}</div> : null}
        {activeQuery.data ? <footer className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{quickView === "all" ? (listing.data?.total ?? 0) : items.length} {(quickView === "all" ? listing.data?.total ?? 0 : items.length) === 1 ? t("documents.itemSingular") : t("documents.itemPlural")}</footer> : null}
      </section>

      <TextDialog open={folderDialog} title={t("documents.createFolderTitle")} label={t("documents.newFolderName")} value={folderName} pending={createFolder.isPending} error={createFolder.error ? apiErrorText(createFolder.error, t) : undefined} onChange={setFolderName} onClose={() => setFolderDialog(false)} onSubmit={() => createFolder.mutate()} />
      <TextDialog open={Boolean(renameItem)} title={t(renameItem?.kind === "folder" ? "documents.renameFolder" : "documents.renameDocument")} label={t("documents.newName")} value={renameValue} pending={rename.isPending} error={rename.error ? apiErrorText(rename.error, t) : undefined} onChange={setRenameValue} onClose={() => setRenameItem(null)} onSubmit={() => rename.mutate()} />
      {transfer ? <TransferDialog transfer={transfer} currentFolderId={folderId ?? null} folders={listing.data?.folders ?? []} pending={transferMutation.isPending} error={transferMutation.error ? apiErrorText(transferMutation.error, t) : undefined} onClose={() => setTransfer(null)} onSubmit={(destination) => transferMutation.mutate(destination)} /> : null}
      {shareItems.length ? <ShareDialog items={shareItems} onClose={() => setShareItems([])} onSuccess={refresh} /> : null}
      {metadataFolder ? <FolderMetadataDialog folder={metadataFolder} onClose={() => setMetadataFolder(null)} /> : null}
      {governanceFolder ? <FolderGovernanceDialog folder={governanceFolder} onClose={() => setGovernanceFolder(null)} /> : null}
      {accessItem ? <ManageAccessDialog item={accessItem} onClose={() => setAccessItem(null)} onShare={() => { const item = accessItem; setAccessItem(null); setShareItems([item]); }} /> : null}
      {templatesOpen ? <TemplatesDialog folderId={folderId ?? null} onClose={() => setTemplatesOpen(false)} onInstantiated={refresh} /> : null}
      {confirmDialog}
    </Page>
  );
}

function formatMetadataValue(field: FolderMetadataFieldDto, value: unknown, t: (key: string) => string, formatDate: (value: string | Date) => string): string {
  if (value == null || value === "") return "—";
  switch (field.type) {
    case "boolean": return value ? t("common.yes") : t("common.no");
    case "date": return formatDate(String(value));
    case "datetime": return formatDate(String(value));
    case "choice": return field.options?.find((o) => o.value === value)?.label ?? String(value);
    default: return String(value);
  }
}

function ListView({ items, versions, actions, fields, allSelected, onSelectAll, inheritedGovernance }: { items: FileManagerItem[]; versions: Map<string, { version: number | undefined; pending: boolean | undefined }>; actions: ItemActions; fields: FolderMetadataFieldDto[]; allSelected: boolean; onSelectAll: (checked: boolean) => void; inheritedGovernance?: GovernanceSettings | null }) {
  const { t } = useTranslation();
  const { formatBytes, formatDate } = useLocaleFormatter();
  return <><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead className="w-12"><Checkbox aria-label={t("common.selectAll")} checked={allSelected} onChange={(event) => onSelectAll(event.target.checked)} /></TableHead><TableHead>{t("common.name")}</TableHead><TableHead>{t("common.type")}</TableHead><TableHead className="hidden lg:table-cell">{t("common.size")}</TableHead><TableHead className="hidden xl:table-cell">{t("common.owner")}</TableHead><TableHead className="hidden lg:table-cell">{t("documents.modified")}</TableHead>{fields.map((field) => <TableHead key={field.id} className="hidden xl:table-cell">{field.name}</TableHead>)}<TableHead className="hidden sm:table-cell text-right">{t("common.version")}</TableHead><TableHead className="w-12"><span className="sr-only">{t("common.actions")}</span></TableHead></TableRow></TableHeader><TableBody>{items.map((item) => { const state = item.kind === "document" ? versions.get(item.id) : undefined; return <TableRow key={itemKey(item)} data-selected={actions.selected.has(itemKey(item))}><TableCell><Checkbox aria-label={t("common.selectItem", { name: item.name })} checked={actions.selected.has(itemKey(item))} onChange={(event) => actions.select(item, event.target.checked)} /></TableCell><TableCell><button type="button" className="nx-focus-ring group flex min-w-0 items-center gap-3 rounded-sm text-left" onClick={() => actions.open(item)}><FileIcon item={item} /><span className="min-w-0"><span className="block max-w-72 truncate font-medium text-foreground group-hover:text-primary">{item.name}</span>{item.kind === "folder" ? <span className="mt-0.5 block text-xs text-muted-foreground">{t("documents.folder")}</span> : null}</span>{item.favorite ? <Star className="size-3.5 shrink-0 fill-warning text-warning" /> : null}{item.isTemplate ? <Badge variant="primary" className="shrink-0">{t("templates.badge")}</Badge> : null}{item.kind === "document" && item.checkedOut ? <span title={t("documents.checkedOutBy", { name: item.checkedOut.user.name })}><Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("documents.checkedOutBy", { name: item.checkedOut.user.name })} /></span> : null}{item.pinnedAt ? <Pin className="size-3.5 shrink-0 text-primary" aria-label={t("documents.pinned")} /> : null}<GovernanceBadges item={item} inheritedGovernance={inheritedGovernance} /></button></TableCell><TableCell className="text-xs uppercase">{item.kind === "folder" ? t("documents.folder") : item.extension}</TableCell><TableCell className="hidden lg:table-cell">{item.kind === "folder" ? "—" : formatBytes(item.sizeBytes)}</TableCell><TableCell className="hidden xl:table-cell">{item.owner ? <span className="flex items-center gap-2"><Avatar name={item.owner.name} src={item.owner.avatar} size="sm" /><span className="max-w-32 truncate">{item.owner.name}</span></span> : t("documents.organization")}</TableCell><TableCell className="hidden whitespace-nowrap lg:table-cell">{formatDate(item.updatedAt)}</TableCell>{fields.map((field) => <TableCell key={field.id} className="hidden xl:table-cell text-sm text-muted-foreground">{item.kind === "document" ? formatMetadataValue(field, item.metadata[field.slug], t, formatDate) : "—"}</TableCell>)}<TableCell className="hidden text-right sm:table-cell">{item.kind === "folder" ? "—" : state?.pending ? <Skeleton className="ml-auto h-5 w-8" /> : state?.version ? <Badge variant="outline">v{state.version}</Badge> : "—"}</TableCell><TableCell><ItemMenu item={item} actions={actions} /></TableCell></TableRow>; })}</TableBody></Table></div><div className="divide-y divide-border md:hidden">{items.map((item) => <div key={itemKey(item)} className="flex items-center gap-3 p-3"><Checkbox aria-label={t("common.selectItem", { name: item.name })} checked={actions.selected.has(itemKey(item))} onChange={(event) => actions.select(item, event.target.checked)} /><button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => actions.open(item)}><FileIcon item={item} /><span className="min-w-0"><span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground"><span className="truncate">{item.name}</span>{item.pinnedAt ? <Pin className="size-3 shrink-0 text-primary" aria-label={t("documents.pinned")} /> : null}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.kind === "folder" ? t("documents.folder") : `${item.extension.toUpperCase()} — ${formatBytes(item.sizeBytes)}`} — {formatDate(item.updatedAt)}</span></span></button><ItemMenu item={item} actions={actions} /></div>)}</div></>;
}

function GridView({ items, actions, inheritedGovernance }: { items: FileManagerItem[]; actions: ItemActions; inheritedGovernance?: GovernanceSettings | null }) {
  const { t } = useTranslation();
  const { formatBytes } = useLocaleFormatter();
  return <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{items.map((item) => { const checked = actions.selected.has(itemKey(item)); return <article key={itemKey(item)} data-selected={checked} className="group relative rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-secondary/50 data-[selected=true]:border-primary data-[selected=true]:bg-primary-subtle"><div className="absolute left-3 top-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[selected=true]:opacity-100"><Checkbox aria-label={t("common.selectItem", { name: item.name })} checked={checked} onChange={(event) => actions.select(item, event.target.checked)} /></div><div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><ItemMenu item={item} actions={actions} /></div><button type="button" className="nx-focus-ring w-full rounded-md text-left" onClick={() => actions.open(item)}><div className="grid h-24 place-items-center rounded-md bg-surface-secondary"><FileIcon item={item} large /></div><p className="mt-3 flex items-center gap-1.5 truncate text-sm font-semibold text-foreground"><span className="truncate">{item.name}</span>{item.kind === "document" && item.checkedOut ? <span title={t("documents.checkedOutBy", { name: item.checkedOut.user.name })}><Lock className="size-3.5 shrink-0 text-muted-foreground" /></span> : null}{item.isTemplate ? <Badge variant="primary" className="shrink-0">{t("templates.badge")}</Badge> : null}{item.pinnedAt ? <Pin className="size-3.5 shrink-0 text-primary" aria-label={t("documents.pinned")} /> : null}<GovernanceBadges item={item} inheritedGovernance={inheritedGovernance} /></p><p className="mt-1 text-xs text-muted-foreground">{item.kind === "folder" ? t("documents.folder") : `${item.extension.toUpperCase()} — ${formatBytes(item.sizeBytes)}`}</p><p className="mt-2 truncate text-xs text-secondary-foreground">{item.owner?.name ?? t("documents.organization")}</p></button>{item.favorite ? <Star className="absolute bottom-4 right-4 size-3.5 fill-warning text-warning" /> : null}</article>; })}</div>;
}

function SelectionToolbar({ items, onClear, onDownload, onMove, onCopy, onShare, onRemove }: { items: FileManagerItem[]; onClear: () => void; onDownload: () => void; onMove: () => void; onCopy: () => void; onShare: () => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const documents = items.filter((item) => item.kind === "document");
  const canEdit = items.every((item) => item.permissions.edit);
  const canShare = items.every((item) => item.permissions.share);
  const canDelete = items.every((item) => item.permissions.delete);
  return <div className="flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary-subtle px-3 py-2.5"><Button variant="ghost" size="icon-sm" aria-label={t("documents.clearSelection")} onClick={onClear}><X /></Button><span className="mr-auto text-sm font-semibold text-primary-subtle-foreground">{t("documents.selected", { count: items.length })}</span>{documents.length ? <Button variant="ghost" size="sm" onClick={onDownload}><Download />{t("common.download")}</Button> : null}{canEdit ? <><Button variant="ghost" size="sm" onClick={onMove}><Move />{t("common.move")}</Button><Button variant="ghost" size="sm" onClick={onCopy}><Copy />{t("common.copy")}</Button></> : null}{canShare ? <Button variant="ghost" size="sm" onClick={onShare}><Share2 />{t("common.share")}</Button> : null}{canDelete ? <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-subtle hover:text-danger" onClick={onRemove}><Trash2 />{t("documents.apagar")}</Button> : null}</div>;
}

function DetailPanel({ item, version, actions, onClose }: { item: FileManagerItem; version?: number; actions: ItemActions; onClose: () => void }) {
  const { t } = useTranslation();
  const { formatBytes, formatDateTime } = useLocaleFormatter();
  return <aside className="border-t border-border bg-surface-secondary/45 p-5 xl:border-l xl:border-t-0"><div className="flex items-start justify-between gap-3"><FileIcon item={item} large /><Button variant="ghost" size="icon-sm" aria-label={t("documents.closeDetails")} onClick={onClose}><X /></Button></div><h2 className="mt-4 break-words text-sm font-semibold text-foreground">{item.name}</h2><p className="mt-1 text-xs text-muted-foreground">{item.kind === "folder" ? t("documents.folder") : `${item.extension.toUpperCase()} — ${formatBytes(item.sizeBytes)}`}</p><dl className="mt-6 space-y-3 text-sm"><Detail label={t("common.owner")} value={item.owner?.name ?? t("documents.organization")} /><Detail label={t("documents.created")} value={formatDateTime(item.createdAt)} /><Detail label={t("documents.modified")} value={formatDateTime(item.updatedAt)} />{item.kind === "document" ? <><Detail label={t("common.type")} value={item.mimeType} /><Detail label={t("common.version")} value={version ? `v${version}` : "—"} /></> : null}</dl><div className="mt-6"><p className="nx-label">{t("documents.permissions")}</p><div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(item.permissions).filter(([, allowed]) => allowed).map(([permission]) => <Badge key={permission} variant="outline">{{ view: t("documents.permissionsView"), edit: t("documents.permissionsEdit"), delete: t("documents.permissionsDelete"), share: t("documents.permissionsShare") }[permission as keyof typeof item.permissions]}</Badge>)}</div></div><div className="mt-6 grid grid-cols-2 gap-2">{item.kind === "document" ? <Button size="sm" onClick={() => actions.download(item)}><Download />{t("common.download")}</Button> : <Button size="sm" onClick={() => actions.open(item)}><FolderOpen />{t("documents.open")}</Button>}{item.permissions.share ? <Button variant="outline" size="sm" onClick={() => actions.share([item])}><Share2 />{t("common.share")}</Button> : null}{item.permissions.edit ? <><Button variant="outline" size="sm" onClick={() => actions.rename(item)}><FileText />{t("documents.rename")}</Button><Button variant="outline" size="sm" onClick={() => actions.transfer([item], "move")}><Move />{t("common.move")}</Button></> : null}</div></aside>;
}

function ItemMenu({ item, actions }: { item: FileManagerItem; actions: ItemActions }) {
  const { t } = useTranslation();
  const subscribed = actions.alerts.has(itemKey(item));
  return <Dropdown trigger={<Button variant="ghost" size="icon-sm" aria-label={t("documents.actionsFor", { name: item.name })}><MoreHorizontal /></Button>}><DropdownItem onClick={() => actions.favorite(item)}><Star />{item.favorite ? t("documents.unfavorite") : t("documents.favorite")}</DropdownItem>{item.permissions.edit ? <DropdownItem onClick={() => actions.pin(item)}>{item.pinnedAt ? <PinOff /> : <Pin />}{item.pinnedAt ? t("documents.unpin") : t("documents.pinToTop")}</DropdownItem> : null}<DropdownItem onClick={() => actions.alert(item)}>{subscribed ? <BellOff /> : <Bell />}{subscribed ? t("subscriptions.removeAlert") : t("subscriptions.alertMe")}</DropdownItem>{item.kind === "document" ? <DropdownItem onClick={() => actions.download(item)}><Download />{t("common.download")}</DropdownItem> : null}{item.permissions.edit ? <><DropdownItem onClick={() => actions.rename(item)}><FileText />{t("documents.rename")}</DropdownItem><DropdownItem onClick={() => actions.transfer([item], "move")}><Move />{t("common.move")}</DropdownItem><DropdownItem onClick={() => actions.transfer([item], "copy")}><Copy />{t("common.copy")}</DropdownItem><DropdownItem onClick={() => actions.template(item)}><FileBadge />{item.isTemplate ? t("templates.unmark") : t("templates.mark")}</DropdownItem>{item.kind === "folder" ? <DropdownItem onClick={() => actions.metadata(item)}><Tags />{t("documents.meta.menuItem")}</DropdownItem> : null}{item.kind === "folder" ? <DropdownItem onClick={() => actions.governance(item)}><Shield />{t("governance.menuItem")}</DropdownItem> : null}</> : null}{item.permissions.share ? <><DropdownItem onClick={() => actions.share([item])}><Share2 />{t("common.share")}</DropdownItem><DropdownItem onClick={() => actions.access(item)}><KeyRound />{t("access.manageAccess")}</DropdownItem></> : null}{actions.quickActions.filter((action) => action.targetType === item.kind).map((action) => <DropdownItem key={action.id} onClick={() => actions.runQuickAction(action, item)}><Zap />{action.name}</DropdownItem>)}{item.permissions.delete ? <><DropdownSeparator /><DropdownItem destructive onClick={() => actions.remove([item])}><Trash2 />{t("documents.apagar")}</DropdownItem></> : null}</Dropdown>;
}

function GovernanceBadges({ item, inheritedGovernance }: { item: FileManagerItem; inheritedGovernance?: GovernanceSettings | null }) {
  const { t } = useTranslation();
  const governance = item.kind === "folder" ? item.governance : inheritedGovernance ?? null;
  if (!governance) return null;
  const confidential = governance.sensitivity === "CONFIDENTIAL" || governance.sensitivity === "RESTRICTED";
  const sensitivityLabel = governance.sensitivity === "CONFIDENTIAL" ? t("governance.badgeConfidential") : t("governance.badgeRestricted");
  return <>
    {confidential ? <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-danger-subtle px-1.5 py-0.5 text-[10px] font-semibold text-danger" title={sensitivityLabel}><ShieldAlert className="size-3" />{sensitivityLabel}</span> : null}
    {governance.retentionMode === "BLOCK_DELETE" ? <span title={t("governance.badgeRetention")}><Lock className="size-3.5 shrink-0 text-warning" /></span> : null}
    {governance.retentionMode === "RETAIN" ? <span title={t("governance.badgeRetentionDays", { days: governance.retentionDays ?? 0 })}><Clock className="size-3.5 shrink-0 text-warning" /></span> : null}
  </>;
}

function FileIcon({ item, large }: { item: FileManagerItem; large?: boolean }) {
  const iconClass = large ? "size-8" : "size-4";
  const wrapperClass = large ? "size-12" : "size-8";
  if (item.kind === "folder") return <span className={`grid ${wrapperClass} shrink-0 place-items-center rounded-md bg-warning-subtle text-warning`}><Folder className={iconClass} fill="currentColor" fillOpacity={0.12} /></span>;
  if (item.documentKind === "SHEET") return <span className={`grid ${wrapperClass} shrink-0 place-items-center rounded-md bg-success-subtle text-success`}><FileSpreadsheet className={iconClass} /></span>;
  if (item.documentKind === "DOC") return <span className={`grid ${wrapperClass} shrink-0 place-items-center rounded-md bg-primary-subtle text-primary-subtle-foreground`}><FileText className={iconClass} /></span>;
  const Icon = item.mimeType.startsWith("image/") ? FileImage : item.extension === "zip" ? FileArchive : ["xls", "xlsx", "csv"].includes(item.extension) ? FileSpreadsheet : item.mimeType === "application/pdf" || item.mimeType.startsWith("text/") ? FileText : File;
  return <span className={`grid ${wrapperClass} shrink-0 place-items-center rounded-md bg-primary-subtle text-primary-subtle-foreground`}><Icon className={iconClass} /></span>;
}

function TextDialog({ open, title, label, value, pending, error, onChange, onClose, onSubmit }: { open: boolean; title: string; label: string; value: string; pending: boolean; error?: string; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const { t } = useTranslation();
  function submit(event: FormEvent) { event.preventDefault(); if (value.trim()) onSubmit(); }
  return <Dialog open={open} onOpenChange={(next) => !next && onClose()} title={title} footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="document-text-form" loading={pending} disabled={!value.trim()}>{t("common.save")}</Button></>}><form id="document-text-form" onSubmit={submit}><Field label={label} error={error} required><Input autoFocus value={value} onChange={(event) => onChange(event.target.value)} /></Field></form></Dialog>;
}

function TransferDialog({ transfer, currentFolderId, folders, pending, error, onClose, onSubmit }: { transfer: { items: FileManagerItem[]; mode: TransferMode }; currentFolderId: string | null; folders: FolderItemDto[]; pending: boolean; error?: string; onClose: () => void; onSubmit: (id: string | null) => void }) {
  const { t } = useTranslation();
  const [destination, setDestination] = useState("");
  const excluded = new Set(transfer.items.filter((item) => item.kind === "folder").map((item) => item.id));
  return <Dialog open onOpenChange={(next) => !next && onClose()} title={`${transfer.mode === "move" ? t("documents.moveTitle") : t("documents.copyTitle")} ${transfer.items.length === 1 ? transfer.items[0]!.name : `${transfer.items.length} ${t("documents.itemPlural")}`}`} description={t("documents.transferDescription")} footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button loading={pending} onClick={() => onSubmit(destination || null)}>{transfer.mode === "move" ? t("documents.moveTitle") : t("documents.createCopy")}</Button></>}><Field label={t("documents.selectDestination")} error={error}><Select value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">{t("documents.rootFolderLabel")}</option>{currentFolderId ? <option value={currentFolderId}>{t("documents.currentFolder")}</option> : null}{folders.filter(({ id }) => !excluded.has(id)).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</Select></Field></Dialog>;
}

function ShareDialog({ items, onClose, onSuccess }: { items: FileManagerItem[]; onClose: () => void; onSuccess: () => Promise<void> }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const users = useQuery({ queryKey: ["organization-users", organization.id], queryFn: () => usersApi.list(organization.id) });
  const [membershipId, setMembershipId] = useState("");
  const [access, setAccess] = useState({ view: true, edit: false, delete: false, share: false });
  const share = useMutation({ mutationFn: async () => { for (const item of items) await documentsApi.share(organization.id, item, { membershipId, ...access }); }, onSuccess: async () => { await onSuccess(); toast({ tone: "success", title: items.length === 1 ? t("documents.shareSuccessOne") : t("documents.shareSuccessMany") }); onClose(); } });
  const folderItem = items.length === 1 && items[0]!.kind === "folder" ? items[0]! : null;
  return <Dialog open onOpenChange={(next) => !next && onClose()} title={`${t("documents.shareTitle")} ${items.length === 1 ? items[0]!.name : `${items.length} ${t("documents.itemPlural")}`}`} footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button loading={share.isPending} disabled={!membershipId} onClick={() => share.mutate()}><Share2 />{t("common.share")}</Button></>}><div className="space-y-4"><Field label={t("documents.shareUser")} error={share.error ? apiErrorText(share.error, t) : undefined}><Select value={membershipId} onChange={(event) => setMembershipId(event.target.value)}><option value="">{t("documents.selectUser")}</option>{users.data?.map((user) => <option key={user.memberId} value={user.memberId}>{user.name} — {user.email}</option>)}</Select></Field><fieldset><legend className="nx-label mb-2">{t("documents.permissions")}</legend><div className="grid grid-cols-2 gap-2">{(["view", "edit", "delete", "share"] as const).map((key) => <label className="flex items-center gap-2 rounded-md bg-surface-secondary px-3 py-2.5 text-sm text-secondary-foreground" key={key}><Checkbox checked={access[key]} onChange={(event) => setAccess({ ...access, [key]: event.target.checked })} />{{ view: t("documents.permissionsView"), edit: t("documents.permissionsEdit"), delete: t("documents.permissionsDelete"), share: t("documents.permissionsShare") }[key]}</label>)}</div></fieldset>{folderItem ? <FolderLinksSection folderId={folderItem.id} /> : null}</div></Dialog>;
}

function FolderLinksSection({ folderId }: { folderId: string }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["folder-share-links", organization.id, folderId];
  const links = useQuery({ queryKey, queryFn: () => documentsApi.folderShareLinks(organization.id, folderId) });
  const [hours, setHours] = useState(168);
  const [password, setPassword] = useState("");
  const [permission, setPermission] = useState<"READ" | "UPLOAD">("READ");
  const [createdUrl, setCreatedUrl] = useState("");
  const create = useMutation({ mutationFn: () => documentsApi.createFolderShareLink(organization.id, folderId, { expiresInHours: hours, password: password || undefined, permission }), onSuccess: async (link) => { setCreatedUrl(link.url ?? ""); await queryClient.invalidateQueries({ queryKey }); toast({ tone: "success", title: t("documents.linkCreated") }); }, onError: (error: Error) => toast({ tone: "danger", title: t("documents.linkCreateError"), description: error instanceof ApiClientError && error.code === "SENSITIVITY_BLOCKED" ? t("governance.sensitivityBlocked") : apiErrorText(error, t) }) });
  const revoke = useMutation({ mutationFn: (linkId: string) => documentsApi.revokeFolderShareLink(organization.id, folderId, linkId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey }); toast({ tone: "success", title: t("documents.linkRevoked") }); } });
  const { formatDateTime } = useLocaleFormatter();
  return (
    <div className="border-t border-border pt-4">
      <p className="nx-label mb-1">{t("documents.folderLinksTitle")}</p>
      <p className="mb-3 text-xs text-muted-foreground">{t("documents.folderLinksDesc")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("documents.validity")}><Select value={hours} onChange={(event) => setHours(Number(event.target.value))}><option value={24}>{t("documents.24hours")}</option><option value={168}>{t("documents.7days")}</option><option value={720}>{t("documents.30days")}</option></Select></Field>
        <Field label={t("documents.permission")}><Select value={permission} onChange={(event) => setPermission(event.target.value as "READ" | "UPLOAD")}><option value="READ">{t("documents.readAccess")}</option><option value="UPLOAD">{t("documents.uploadAccess")}</option></Select></Field>
        <Field label={t("auth.login.password")}><Input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
      </div>
      <Button className="mt-3" size="sm" variant="outline" loading={create.isPending} disabled={Boolean(password && password.length < 8)} onClick={() => create.mutate()}>{t("documents.createLink")}</Button>
      {createdUrl ? <div className="mt-3 flex items-center gap-2 rounded-md bg-success-subtle p-3"><Input className="border-0 bg-transparent shadow-none" readOnly value={createdUrl} /><Button variant="ghost" size="icon-sm" aria-label={t("documents.copyLink")} onClick={() => { void navigator.clipboard.writeText(createdUrl); toast({ tone: "success", title: t("documents.linkCopied") }); }}><Copy /></Button></div> : null}
      {links.isPending ? <Skeleton className="mt-3 h-10 w-full" /> : null}
      {links.data?.length ? (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {links.data.map((link) => (
            <li key={link.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Badge variant="outline">{link.permission === "UPLOAD" ? t("documents.uploadAccess") : t("documents.readAccess")}</Badge>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{t("documents.linkExpires")} {formatDateTime(link.expiresAt)}</span>
              <Button variant="ghost" size="icon-sm" aria-label={t("documents.revokeLink")} loading={revoke.isPending && revoke.variables === link.id} onClick={() => revoke.mutate(link.id)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TemplatesDialog({ folderId, onClose, onInstantiated }: { folderId: string | null; onClose: () => void; onInstantiated: () => Promise<void> }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const templates = useQuery({ queryKey: ["templates", organization.id], queryFn: () => templatesApi.list(organization.id) });
  const instantiate = useMutation({
    mutationFn: (item: FileManagerItem): Promise<unknown> => item.kind === "document" ? templatesApi.instantiateDocument(organization.id, item.id, { folderId }) : templatesApi.instantiateFolder(organization.id, item.id, { parentId: folderId }),
    onSuccess: async () => {
      await onInstantiated();
      toast({ tone: "success", title: t("templates.instantiated") });
      onClose();
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("templates.errorInstantiating"), description: apiErrorText(error, t) })
  });

  const documents = templates.data?.documents ?? [];
  const folders = templates.data?.folders ?? [];
  const empty = templates.data && documents.length === 0 && folders.length === 0;

  function TemplateRow({ item }: { item: FileManagerItem }) {
    return (
      <li className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5">
        <FileIcon item={item} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{item.name}</span>
          <span className="block text-xs text-muted-foreground">{item.kind === "folder" ? t("documents.folder") : item.extension.toUpperCase()}</span>
        </span>
        <Button size="sm" variant="outline" loading={instantiate.isPending && instantiate.variables?.id === item.id} disabled={instantiate.isPending} onClick={() => instantiate.mutate(item)}>{t("templates.useTemplate")}</Button>
      </li>
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} title={t("templates.dialogTitle")} description={t("templates.dialogDesc")}>
      {templates.isPending ? <div className="space-y-2">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-12" key={index} />)}</div> : null}
      {templates.isError ? <Alert variant="danger" title={t("templates.errorLoading")} /> : null}
      {empty ? <EmptyState icon={FileBadge} title={t("templates.empty")} description={t("templates.emptyDesc")} /> : null}
      {templates.data && !empty ? (
        <div className="space-y-5">
          {documents.length ? (
            <section>
              <h3 className="nx-label mb-2">{t("templates.documentsSection")}</h3>
              <ul className="space-y-2">{documents.map((item) => <TemplateRow key={item.id} item={item} />)}</ul>
            </section>
          ) : null}
          {folders.length ? (
            <section>
              <h3 className="nx-label mb-2">{t("templates.foldersSection")}</h3>
              <ul className="space-y-2">{folders.map((item) => <TemplateRow key={item.id} item={item} />)}</ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function EmptyDocuments({ filtered, canEdit, onUpload, onCreateFolder }: { filtered: boolean; canEdit: boolean; onUpload: () => void; onCreateFolder: () => void }) {
  const { t } = useTranslation();
  return <EmptyState icon={filtered ? Search : Folder} title={filtered ? t("documents.noResultsFound") : t("documents.empty")} description={filtered ? t("documents.noResultsDesc") : canEdit ? t("documents.emptyDesc") : t("documents.readOnlyNotice")} action={filtered || !canEdit ? undefined : <div className="flex flex-col gap-2 sm:flex-row"><Button onClick={onUpload}><Upload />{t("documents.addDocument")}</Button><Button variant="outline" onClick={onCreateFolder}><FolderPlus />{t("documents.newFolder")}</Button></div>} />;
}

function DocumentsSkeleton({ view }: { view: "list" | "grid" }) { return view === "grid" ? <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton className="h-44" key={index} />)}</div> : <div className="space-y-px">{Array.from({ length: 7 }, (_, index) => <div className="flex items-center gap-3 border-b border-border p-3" key={index}><Skeleton className="size-8" /><Skeleton className="h-4 flex-1" /><Skeleton className="hidden h-4 w-28 md:block" /><Skeleton className="h-4 w-20" /></div>)}</div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words text-secondary-foreground">{value}</dd></div>; }
function itemKey(item: FileManagerItem) { return `${item.kind}:${item.id}`; }
function saveBlob(result: { blob: Blob; name: string }) { const url = URL.createObjectURL(result.blob); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = result.name; anchor.click(); URL.revokeObjectURL(url); }

