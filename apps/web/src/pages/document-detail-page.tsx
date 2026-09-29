import type { DocumentItemDto, DocumentSharePermission, DocumentShareTargetType, DocumentVersionDto, FolderItemDto, FolderMetadataFieldDto } from "@nexora/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Calendar,
  Check,
  Copy,
  Download,
  Eye,
  FileClock,
  FileText,
  FolderInput,
  HardDrive,
  History,
  KeyRound,
  Link2,
  Lock,
  MessageSquare,
  Move,
  Pencil,
  Pin,
  PinOff,
  RefreshCcw,
  Share2,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  Trash2,
  Unlock,
  Upload,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ContextualCopilot } from "../components/ai/contextual-copilot";
import { useWorkspace } from "../components/layout/app-layout";
import {
  Alert,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  Timeline,
  useConfirm,
  useToast
} from "../components/ui";
import { ApiClientError, documentsApi, subscriptionsApi, usersApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useRealtimeChannel, type RealtimeStatus } from "../components/collaboration/use-realtime-channel";
import { LivePresence } from "../components/collaboration/live-presence";
import { MentionText, MentionTextarea } from "../components/collaboration/mention-textarea";
import { useCollaborationMembers } from "../components/collaboration/use-collaboration-members";
import { ManageAccessDialog } from "../components/documents/manage-access-dialog";
import { RequestAccessPanel } from "../components/documents/request-access-panel";
import { useLocaleFormatter } from "../lib/format";

type DetailTab = "preview" | "details" | "versions" | "comments" | "activity";

export function DocumentDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const { organization, session } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { formatBytes, formatDateTime } = useLocaleFormatter();
  const [tab, setTab] = useState<DetailTab>("preview");
  const [shareOpen, setShareOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [versionOpen, setVersionOpen] = useState(false);

  const queryKey = ["document", organization.id, id];
  const detail = useQuery({ queryKey, queryFn: () => documentsApi.get(organization.id, id) });
  const alertCheck = useQuery({ queryKey: ["subscription-check", organization.id, "document", id], queryFn: () => subscriptionsApi.check(organization.id, "document", id) });
  const subscribed = alertCheck.data?.subscribed ?? false;
  const folders = useQuery({ queryKey: ["document-move-folders", organization.id], queryFn: () => documentsApi.list(organization.id, { filter: "folders", sort: "name", order: "asc" }), enabled: moveOpen });
  const comments = useQuery({ queryKey: ["document-comments", organization.id, id], queryFn: () => documentsApi.listComments(organization.id, id) });
  const realtime = useRealtimeChannel({
    organizationId: organization.id,
    channel: { type: "document", resourceId: id },
    enabled: Boolean(id) && detail.isSuccess,
    onEvent: (event) => {
      if (event.type === "connected" || event.type === "comment.created" || event.type === "comment.deleted") {
        void queryClient.invalidateQueries({ queryKey: ["document-comments", organization.id, id] });
      }
      if (event.type === "connected" || event.type === "resource.updated") {
        void queryClient.invalidateQueries({ queryKey: ["document", organization.id, id] });
        void queryClient.invalidateQueries({ queryKey: ["document-activity", organization.id, id] });
      }
    }
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const notifyError = (title: string) => (error: Error) => {
    if (error instanceof ApiClientError && error.code === "DOCUMENT_CHECKED_OUT") {
      toast({ tone: "danger", title: t("documents.checkedOutError") });
      return;
    }
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
  const checkOut = useMutation({ mutationFn: () => documentsApi.checkOut(organization.id, id), onSuccess: async () => { await refresh(); await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] }); toast({ tone: "success", title: t("documents.checkedOutSuccess") }); }, onError: notifyError(t("documents.errorCheckOut")) });
  const checkIn = useMutation({ mutationFn: () => documentsApi.checkIn(organization.id, id), onSuccess: async () => { await refresh(); await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] }); toast({ tone: "success", title: t("documents.checkedInSuccess") }); }, onError: notifyError(t("documents.errorCheckIn")) });
  const favorite = useMutation({ mutationFn: () => documentsApi.favorite(organization.id, detail.data!.document, !detail.data!.document.favorite), onSuccess: async () => { await refresh(); toast({ tone: "success", title: detail.data!.document.favorite ? t("documents.favoriteRemoved") : t("documents.favoriteAdded") }); }, onError: notifyError(t("documents.errorFavorite")) });
  const pin = useMutation({ mutationFn: () => documentsApi.pin(organization.id, detail.data!.document, !detail.data!.document.pinnedAt), onSuccess: async () => { await refresh(); await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] }); toast({ tone: "success", title: t("documents.pinUpdated") }); }, onError: notifyError(t("documents.errorPin")) });
  const uploadVersion = useMutation({ mutationFn: ({ file, versionType }: { file: File; versionType: "major" | "minor" }) => documentsApi.uploadVersion(organization.id, id, file, versionType), onSuccess: async () => { setVersionOpen(false); await refresh(); setTab("versions"); toast({ tone: "success", title: t("documents.newVersionAdded") }); }, onError: notifyError(t("documents.errorAddingVersion")) });
  const restore = useMutation({ mutationFn: (versionId: string) => documentsApi.restoreVersion(organization.id, id, versionId), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("documents.versionRestoredSuccess") }); }, onError: notifyError(t("documents.errorRestoringVersion")) });
  const rename = useMutation({ mutationFn: () => documentsApi.rename(organization.id, detail.data!.document, renameValue.trim()), onSuccess: async () => { setRenameOpen(false); await refresh(); toast({ tone: "success", title: t("documents.documentRenamed") }); }, onError: notifyError(t("documents.errorRenamingDocument")) });
  const move = useMutation({ mutationFn: (folderId: string | null) => documentsApi.move(organization.id, detail.data!.document, folderId), onSuccess: async () => { setMoveOpen(false); await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] }); await refresh(); toast({ tone: "success", title: t("documents.documentMoved") }); }, onError: notifyError(t("documents.errorMovingDocument")) });
  const remove = useMutation({ mutationFn: () => documentsApi.remove(organization.id, detail.data!.document), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] }); toast({ tone: "success", title: t("documents.documentDeleted") }); navigate("/documents"); }, onError: notifyError(t("documents.errorDeletingDocument")) });
  const toggleAlert = useMutation({
    mutationFn: async () => {
      if (subscribed) await subscriptionsApi.unsubscribe(organization.id, { targetType: "document", targetId: id });
      else await subscriptionsApi.subscribe(organization.id, { targetType: "document", targetId: id, events: ["created", "updated", "deleted", "version.added", "commented"] });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscription-check", organization.id, "document", id] });
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", organization.id] });
      toast({ tone: "success", title: subscribed ? t("subscriptions.removed") : t("subscriptions.activated") });
    },
    onError: notifyError(t("subscriptions.errorSaving"))
  });
  const publish = useMutation({ mutationFn: () => documentsApi.publish(organization.id, id), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("documents.publishSubmitted") }); }, onError: notifyError(t("documents.errorPublishing")) });
  const decidePublish = useMutation({ mutationFn: (approve: boolean) => approve ? documentsApi.approvePublication(organization.id, id) : documentsApi.rejectPublication(organization.id, id), onSuccess: async (_result, approve) => { await refresh(); toast({ tone: "success", title: approve ? t("documents.publishApproved") : t("documents.publishRejected") }); }, onError: notifyError(t("documents.errorPublishing")) });
  const setRecord = useMutation({ mutationFn: (isRecord: boolean) => documentsApi.setRecord(organization.id, id, isRecord), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("documents.recordUpdated") }); }, onError: notifyError(t("documents.errorRecord")) });
  const setLegalHold = useMutation({ mutationFn: (legalHold: boolean) => documentsApi.setLegalHold(organization.id, id, legalHold), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("documents.holdUpdated") }); }, onError: notifyError(t("documents.errorHold")) });

  async function saveDownload(request: Promise<{ blob: Blob; name: string }>) {
    try { saveBlob(await request); } catch (error) { notifyError(t("documents.errorDownload"))(error as Error); }
  }

  if (detail.isPending) return <DocumentDetailSkeleton />;
  if (detail.isError && detail.error instanceof ApiClientError && detail.error.status === 403) return <RequestAccessPanel resourceType="document" resourceId={id} />;
  if (detail.isError) return <div className="mx-auto max-w-3xl"><Alert variant="danger" title={t("documents.openError")}><p>{apiErrorText(detail.error, t)}</p><Link to="/documents"><Button className="mt-4" variant="outline"><ArrowLeft />{t("documents.trash.backToDocuments")}</Button></Link></Alert></div>;
  const document = detail.data.document;
  const checkedOutByMe = document.checkedOut !== null && document.checkedOut.user.id === session.user.id;
  const checkedOutByOther = document.checkedOut !== null && !checkedOutByMe;
  const lockedTitle = checkedOutByOther ? t("documents.checkedOutBlocked", { name: document.checkedOut!.user.name }) : undefined;
  const currentVersion = detail.data.versions.find((version) => version.current) ?? detail.data.versions[0];
  const breadcrumbItems = [...detail.data.breadcrumbs.map((crumb) => ({ label: crumb.name, href: crumb.id ? `/documents?folder=${crumb.id}` : "/documents" })), { label: document.name }];

  return (
    <div className="mx-auto max-w-[90rem] space-y-5">
      <Breadcrumb items={breadcrumbItems} />

      <header className="flex flex-col gap-5 border-b border-border pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-center gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary-subtle-foreground"><FileText className="size-6" /></span><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="nx-h1 truncate">{document.name}</h1>{document.favorite ? <Star className="size-4 shrink-0 fill-warning text-warning" /> : null}{document.publishStatus !== "PUBLISHED" ? <Badge variant={document.publishStatus === "PENDING" ? "warning" : document.publishStatus === "REJECTED" ? "danger" : "outline"}>{{ DRAFT: t("documents.statusDraft"), PENDING: t("documents.statusPending"), REJECTED: t("documents.statusRejected") }[document.publishStatus as "DRAFT" | "PENDING" | "REJECTED"]}</Badge> : null}{document.isRecord ? <Badge variant="primary"><Lock className="size-3" />{t("documents.recordBadge")}</Badge> : null}{document.legalHold ? <Badge variant="danger"><ShieldAlert className="size-3" />{t("documents.legalHoldBadge")}</Badge> : null}</div><p className="mt-1 text-sm text-muted-foreground">{document.extension.toUpperCase()} — {formatBytes(document.sizeBytes)} — {currentVersion?.label ?? "v1"}</p></div></div>
        <div className="flex flex-wrap gap-2">{document.documentKind !== "FILE" ? <Button variant="outline" onClick={() => navigate(`/documents/${id}/editor`)}><Pencil />{t("editor.open")}</Button> : null}<ContextualCopilot organizationId={organization.id} resourceType="document" resourceId={id} resourceName={document.name} /><Button variant="ghost" size="icon" aria-label={document.favorite ? t("documents.unfavorite") : t("documents.favorite")} title={document.favorite ? t("documents.unfavorite") : t("documents.favorite")} loading={favorite.isPending} onClick={() => favorite.mutate()}><Star className={document.favorite ? "fill-warning text-warning" : ""} /></Button>{document.permissions.edit ? <Button variant="ghost" size="icon" aria-label={document.pinnedAt ? t("documents.unpin") : t("documents.pinToTop")} title={document.pinnedAt ? t("documents.unpin") : t("documents.pinToTop")} loading={pin.isPending} onClick={() => pin.mutate()}>{document.pinnedAt ? <PinOff /> : <Pin />}</Button> : null}<Button variant="outline" loading={toggleAlert.isPending} onClick={() => toggleAlert.mutate()}>{subscribed ? <BellOff /> : <Bell />}{subscribed ? t("subscriptions.removeAlert") : t("subscriptions.alertMe")}</Button>{document.permissions.edit && (document.publishStatus === "DRAFT" || document.publishStatus === "REJECTED") ? <Button variant="outline" loading={publish.isPending} onClick={() => publish.mutate()}><Send />{t("documents.publish")}</Button> : null}{document.publishStatus === "PENDING" && document.permissions.share ? <><Button variant="outline" loading={decidePublish.isPending} onClick={() => decidePublish.mutate(true)}><Check />{t("documents.approvePublish")}</Button><Button variant="outline" loading={decidePublish.isPending} onClick={() => decidePublish.mutate(false)}><X />{t("documents.rejectPublish")}</Button></> : null}{document.checkedOut === null && document.permissions.edit ? <Button variant="outline" loading={checkOut.isPending} onClick={() => checkOut.mutate()}><Lock />{t("documents.checkOut")}</Button> : null}{checkedOutByMe ? <Button variant="outline" loading={checkIn.isPending} onClick={() => checkIn.mutate()}><Unlock />{t("documents.checkIn")}</Button> : null}{checkedOutByOther ? <><Badge variant="warning"><Lock className="size-3" />{t("documents.checkedOutBy", { name: document.checkedOut!.user.name })}</Badge>{document.permissions.delete ? <Button variant="outline" loading={checkIn.isPending} onClick={async () => { if (await confirm(t("documents.forceCheckInConfirm"))) checkIn.mutate(); }}><Unlock />{t("documents.forceCheckIn")}</Button> : null}</> : null}{document.permissions.share ? <><Button variant="outline" onClick={() => setShareOpen(true)}><Share2 />{t("common.share")}</Button><Button variant="outline" onClick={() => setLinkOpen(true)}><Link2 />{t("documents.createLink")}</Button></> : null}{document.permissions.edit ? <Button variant="outline" disabled={checkedOutByOther} title={lockedTitle} onClick={() => setVersionOpen(true)}><Upload />{t("documents.uploadNewVersion")}</Button> : null}<Button onClick={() => void saveDownload(documentsApi.download(organization.id, id))}><Download />{t("common.download")}</Button></div>
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)} items={[{ value: "preview", label: t("documents.preview"), icon: <Eye className="size-4" /> }, { value: "details", label: t("documents.details"), icon: <InfoIcon /> }, { value: "versions", label: `${t("documents.versions")} (${detail.data.versions.length})`, icon: <History className="size-4" /> }, { value: "comments", label: `${t("documents.comments")} (${comments.data?.length ?? 0})`, icon: <MessageSquare className="size-4" /> }, { value: "activity", label: t("documents.activity"), icon: <FileClock className="size-4" /> }]} />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0">
          {tab === "preview" ? <DocumentPreview organizationId={organization.id} document={document} onDownload={() => void saveDownload(documentsApi.download(organization.id, id))} /> : null}
          {tab === "details" ? <><DocumentInformation document={document} version={currentVersion?.version ?? 1} /><DocumentMetadataSection organizationId={organization.id} documentId={id} fields={detail.data.metadataFields} metadata={document.metadata} metadataAuto={document.metadataAuto} disabled={!document.permissions.edit || checkedOutByOther} lockedTitle={lockedTitle} onSaved={refresh} /></> : null}
          {tab === "comments" ? <DocumentComments organizationId={organization.id} documentId={id} comments={comments.data ?? []} pending={comments.isPending} userId={session.user.id} status={realtime.status} presence={realtime.presence} /> : null}
          {tab === "versions" ? <Versions versions={detail.data.versions} canRestore={document.permissions.edit} restoring={restore.isPending} onDownload={(version) => void saveDownload(documentsApi.downloadVersion(organization.id, id, version.id))} onRestore={async (version) => { if (await confirm(t("documents.restoreVersionConfirm", { version: version.label }))) restore.mutate(version.id); }} /> : null}
          {tab === "activity" ? <DocumentActivity organizationId={organization.id} documentId={id} /> : null}
        </main>

        <aside className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="nx-h3">{t("documents.information")}</h2>
          <dl className="mt-5 space-y-4"><Metadata icon={UserRound} label={t("common.owner")} value={document.owner.name} avatar={<Avatar name={document.owner.name} src={document.owner.avatar} size="sm" />} /><Metadata icon={FileText} label={t("common.type")} value={document.mimeType} /><Metadata icon={HardDrive} label={t("common.size")} value={formatBytes(document.sizeBytes)} /><Metadata icon={Calendar} label={t("documents.created")} value={formatDateTime(document.createdAt)} /><Metadata icon={Calendar} label={t("documents.modified")} value={formatDateTime(document.updatedAt)} /><Metadata icon={FileClock} label={t("documents.currentVersion")} value={`v${currentVersion?.version ?? 1}`} /></dl>
          <div className="mt-6 border-t border-border pt-5"><div className="flex items-center gap-2"><Tags className="size-4 text-muted-foreground" /><h3 className="nx-label">{t("common.tags")}</h3></div><p className="mt-2 text-sm text-muted-foreground">{t("documents.noTags")}</p></div>
          <div className="mt-6 border-t border-border pt-5"><div className="flex items-center gap-2"><Lock className="size-4 text-muted-foreground" /><h3 className="nx-label">{t("documents.permissions")}</h3></div><div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(document.permissions).filter(([, allowed]) => allowed).map(([permission]) => <Badge key={permission} variant="outline">{{ view: t("documents.permissionsView"), edit: t("documents.permissionsEdit"), delete: t("documents.permissionsDelete"), share: t("documents.permissionsShare") }[permission as keyof typeof document.permissions]}</Badge>)}</div></div>
          <div className="mt-6 grid grid-cols-2 gap-2">{document.permissions.edit && !document.isRecord ? <><Button variant="outline" size="sm" disabled={checkedOutByOther} title={lockedTitle} onClick={() => { setRenameValue(document.name); setRenameOpen(true); }}><FileText />{t("common.rename")}</Button><Button variant="outline" size="sm" disabled={checkedOutByOther} title={lockedTitle} onClick={() => setMoveOpen(true)}><Move />{t("common.move")}</Button></> : null}{document.permissions.share ? <><Button variant="outline" size="sm" onClick={() => setShareOpen(true)}><Share2 />{t("common.share")}</Button><Button variant="outline" size="sm" onClick={() => setAccessOpen(true)}><KeyRound />{t("access.manageAccess")}</Button><Button variant="outline" size="sm" loading={setRecord.isPending} onClick={() => setRecord.mutate(!document.isRecord)}><ShieldCheck />{document.isRecord ? t("documents.undeclareRecord") : t("documents.declareRecord")}</Button><Button variant="outline" size="sm" loading={setLegalHold.isPending} onClick={() => setLegalHold.mutate(!document.legalHold)}><ShieldAlert />{document.legalHold ? t("documents.removeHold") : t("documents.applyHold")}</Button></> : null}{document.permissions.delete && !document.isRecord && !document.legalHold ? <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-subtle hover:text-danger" loading={remove.isPending} onClick={async () => { if (await confirm(t("documents.deleteConfirm", { name: document.name }))) remove.mutate(); }}><Trash2 />{t("common.delete")}</Button> : null}</div>
        </aside>
      </div>

      <Link to={document.folderId ? `/documents?folder=${document.folderId}` : "/documents"}><Button variant="ghost"><ArrowLeft />{t("documents.backToFolder")}</Button></Link>

      {shareOpen ? <ShareDialog documentId={id} onClose={() => setShareOpen(false)} /> : null}
      {accessOpen ? <ManageAccessDialog item={document} onClose={() => setAccessOpen(false)} onShare={() => { setAccessOpen(false); setShareOpen(true); }} /> : null}
      {linkOpen ? <LinkDialog documentId={id} onClose={() => setLinkOpen(false)} /> : null}
      <RenameDialog open={renameOpen} value={renameValue} onChange={setRenameValue} onClose={() => setRenameOpen(false)} loading={rename.isPending} error={rename.error ? apiErrorText(rename.error, t) : undefined} onSubmit={() => rename.mutate()} />
      {moveOpen ? <MoveDialog document={document} folders={folders.data?.folders ?? []} loadingFolders={folders.isPending} loading={move.isPending} error={move.error ? apiErrorText(move.error, t) : undefined} onClose={() => setMoveOpen(false)} onSubmit={(folderId) => move.mutate(folderId)} /> : null}
      {versionOpen ? <VersionDialog documentName={document.name} loading={uploadVersion.isPending} error={uploadVersion.error ? apiErrorText(uploadVersion.error, t) : undefined} onClose={() => setVersionOpen(false)} onSubmit={(file, versionType) => uploadVersion.mutate({ file, versionType })} /> : null}
      {confirmDialog}
    </div>
  );
}

function DocumentPreview({organizationId, document, onDownload }: { organizationId: string; document: DocumentItemDto; onDownload: () => void }) {
  const { t } = useTranslation();
  const isDocx = document.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || document.extension.toLowerCase() === "docx";
  const previewable = isDocx || document.mimeType.startsWith("image/") || document.mimeType === "application/pdf" || document.mimeType.startsWith("text/") || document.mimeType === "text/csv";
  const preview = useQuery({ queryKey: ["document-preview", organizationId, document.id, document.updatedAt], queryFn: () => documentsApi.download(organizationId, document.id), enabled: previewable, staleTime: 60_000 });
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [docxHtml, setDocxHtml] = useState("");
  const [docxError, setDocxError] = useState(false);
  useEffect(() => {
    if (!preview.data?.blob) return;
    if (isDocx) {
      let cancelled = false;
      preview.data.blob.arrayBuffer()
        .then((buffer) => import("mammoth/mammoth.browser").then((mammoth) => mammoth.convertToHtml({ arrayBuffer: buffer })))
        .then((result) => { if (!cancelled) setDocxHtml(`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;line-height:1.6;color:#1f2937;max-width:52rem;margin:0 auto;padding:1.5rem;}img{max-width:100%;height:auto;}table{border-collapse:collapse;}td,th{border:1px solid #d1d5db;padding:0.375rem 0.75rem;}</style></head><body>${result.value}</body></html>`); })
        .catch(() => { if (!cancelled) setDocxError(true); });
      return () => { cancelled = true; };
    }
    if (document.mimeType.startsWith("text/") || document.mimeType === "text/csv") { preview.data.blob.text().then(setText); return; }
    const next = URL.createObjectURL(preview.data.blob); setUrl(next); return () => URL.revokeObjectURL(next);
  }, [document.mimeType, isDocx, preview.data?.blob]);

  if (document.documentKind !== "FILE") return <div className="rounded-lg border border-border bg-surface"><EmptyState icon={FileText} title={document.documentKind === "SHEET" ? "Nexora Sheets" : "Nexora Docs"} description={t("editor.previewDesc")} action={<Link to={`/documents/${document.id}/editor`}><Button><Pencil />{t("editor.open")}</Button></Link>} /></div>;
  if (!previewable) return <div className="rounded-lg border border-border bg-surface"><EmptyState icon={FileText} title={t("documents.previewNotAvailable", { format: document.extension.toUpperCase() })} description={t("documents.previewNotAvailableDesc")} action={<Button onClick={onDownload}><Download />{t("documents.downloadToView")}</Button>} /></div>;
  if (preview.isError || docxError) return <Alert variant="danger" title={t("documents.errorLoadingPreview")}>{preview.error ? <p>{apiErrorText(preview.error, t)}</p> : null}<Button className="mt-4" size="sm" onClick={() => { setDocxError(false); void preview.refetch(); }}>{t("common.retry")}</Button></Alert>;
  if (preview.isPending || (isDocx && !docxHtml)) return <Skeleton className="h-[min(68vh,44rem)] w-full" />;
  if (isDocx) return <iframe sandbox="" title={t("documents.previewOf", { name: document.name })} srcDoc={docxHtml} className="h-[min(72vh,50rem)] w-full rounded-lg border border-border bg-white" />;
  if (document.mimeType.startsWith("image/")) return <div className="grid min-h-96 place-items-center rounded-lg border border-border bg-surface-secondary p-4"><img src={url} alt={t("documents.previewOf", { name: document.name })} className="max-h-[68vh] max-w-full object-contain" /></div>;
  if (document.mimeType === "application/pdf") return <iframe title={t("documents.previewOf", { name: document.name })} src={url} className="h-[min(72vh,50rem)] w-full rounded-lg border border-border bg-surface" />;
  return <pre className="nx-scrollbar max-h-[68vh] min-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface p-5 font-mono text-xs leading-6 text-secondary-foreground">{text}</pre>;
}

function DocumentInformation({ document, version }: { document: DocumentItemDto; version: number }) {
  const { t } = useTranslation();
  const { formatBytes, formatDateTime } = useLocaleFormatter();
  const rows = [[t("common.name"), document.name], [t("documents.originalName"), document.originalName], [t("documents.extension"), document.extension.toUpperCase()], [t("documents.mimeType"), document.mimeType], [t("common.size"), formatBytes(document.sizeBytes)], [t("common.owner"), document.owner.name], [t("documents.created"), formatDateTime(document.createdAt)], [t("documents.modified"), formatDateTime(document.updatedAt)], [t("common.version"), `v${version}`]];
  return <section className="rounded-lg border border-border bg-surface"><header className="border-b border-border px-5 py-4"><h2 className="nx-h3">{t("documents.metadata")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("documents.informationDesc")}</p></header><dl className="divide-y divide-border">{rows.map(([label, value]) => <div key={label} className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-all text-sm font-medium text-secondary-foreground">{value}</dd></div>)}</dl></section>;
}

function Versions({versions, canRestore, restoring, onDownload, onRestore }: { versions: DocumentVersionDto[]; canRestore: boolean; restoring: boolean; onDownload: (version: DocumentVersionDto) => void; onRestore: (version: DocumentVersionDto) => void }) {
  const { t } = useTranslation();
  const { formatBytes, formatDateTime } = useLocaleFormatter();
  return <section className="rounded-lg border border-border bg-surface p-5"><Timeline items={versions.map((version) => ({ id: version.id, title: `${version.label}${version.current ? ` · ${t("documents.current")}` : ""}`, description: t("documents.versionDescription", { creator: version.creator.name, size: formatBytes(version.sizeBytes), name: version.originalName }), time: formatDateTime(version.createdAt), tone: version.current ? "primary" : "neutral" }))} /><div className="mt-5 divide-y divide-border border-t border-border">{versions.map((version) => <div key={version.id} className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"><div className="flex items-center gap-2"><Badge variant={version.current ? "primary" : "outline"}>{version.label}</Badge>{version.versionType === "MINOR" ? <Badge variant="warning">{t("documents.versionDraft")}</Badge> : null}<span className="text-xs text-muted-foreground">{version.mimeType}</span></div><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => onDownload(version)}><Download />{t("common.download")}</Button>{canRestore && !version.current ? <Button size="sm" variant="outline" loading={restoring} onClick={() => onRestore(version)}><RefreshCcw />{t("documents.restoreVersion")}</Button> : null}</div></div>)}</div></section>;
}

function ShareDialog({documentId, onClose }: { documentId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const targets = useQuery({ queryKey: ["document-share-targets", organization.id, documentId], queryFn: () => documentsApi.shareTargets(organization.id, documentId) });
  const [type, setType] = useState<DocumentShareTargetType>("USER");
  const [targetId, setTargetId] = useState("");
  const [permission, setPermission] = useState<DocumentSharePermission>("READ");
  const share = useMutation({ mutationFn: () => documentsApi.shareDocument(organization.id, documentId, { targetType: type, targetId, permission }), onSuccess: () => { toast({ tone: "success", title: t("documents.shareSuccessOne") }); onClose(); } });
  const options = type === "USER" ? targets.data?.users ?? [] : type === "TEAM" ? targets.data?.teams ?? [] : targets.data?.organizations ?? [];
  return <Dialog open onOpenChange={(next) => !next && onClose()} title={t("documents.shareDocument")} description={t("documents.shareDocumentDesc")} footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button loading={share.isPending} disabled={!targetId} onClick={() => share.mutate()}><Share2 />{t("common.share")}</Button></>}><div className="space-y-4"><div className="grid grid-cols-3 gap-2">{(["USER", "TEAM", "ORGANIZATION"] as const).map((value) => <Button key={value} type="button" size="sm" variant={type === value ? "secondary" : "outline"} onClick={() => { setType(value); setTargetId(""); }}>{{ USER: t("documents.shareUser"), TEAM: t("documents.team"), ORGANIZATION: t("documents.organization") }[value]}</Button>)}</div><Field label={t("documents.shareTarget")}><Select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">{t("common.select")}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}{"email" in option ? ` — ${option.email}` : ""}</option>)}</Select></Field><Field label={t("documents.permission")} error={share.error instanceof ApiClientError && share.error.code === "SENSITIVITY_BLOCKED" ? t("governance.sensitivityBlocked") : share.error ? apiErrorText(share.error, t) : undefined}><Select value={permission} onChange={(event) => setPermission(event.target.value as DocumentSharePermission)}><option value="READ">{t("documents.readAccess")}</option><option value="EDIT">{t("documents.editAccess")}</option></Select></Field></div></Dialog>;
}

function LinkDialog({documentId, onClose }: { documentId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { formatDateTime } = useLocaleFormatter();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["document-share-links", organization.id, documentId];
  const links = useQuery({ queryKey, queryFn: () => documentsApi.shareLinks(organization.id, documentId) });
  const [hours, setHours] = useState(24);
  const [password, setPassword] = useState("");
  const [permission, setPermission] = useState<DocumentSharePermission>("READ");
  const [createdUrl, setCreatedUrl] = useState("");
  const create = useMutation({ mutationFn: () => documentsApi.createShareLink(organization.id, documentId, { expiresInHours: hours, password: password || undefined, permission }), onSuccess: async (link) => { setCreatedUrl(link.url ?? ""); await queryClient.invalidateQueries({ queryKey }); toast({ tone: "success", title: t("documents.linkCreated") }); } });
  const revoke = useMutation({ mutationFn: (linkId: string) => documentsApi.revokeShareLink(organization.id, documentId, linkId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey }); toast({ tone: "success", title: t("documents.linkRevoked") }); } });
  return <Dialog open onOpenChange={(next) => !next && onClose()} title={t("documents.shareLinks")} description={t("documents.shareLinksDesc")} size="lg" footer={<Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>}><div className="grid gap-4 sm:grid-cols-3"><Field label={t("documents.validity")}><Select value={hours} onChange={(event) => setHours(Number(event.target.value))}><option value={1}>{t("documents.1hour")}</option><option value={24}>{t("documents.24hours")}</option><option value={168}>{t("documents.7days")}</option><option value={720}>{t("documents.30days")}</option></Select></Field><Field label={t("documents.permission")}><Select value={permission} onChange={(event) => setPermission(event.target.value as DocumentSharePermission)}><option value="READ">{t("documents.readAccess")}</option><option value="EDIT">{t("documents.editAccess")}</option></Select></Field><Field label={t("auth.login.password")} helper={t("documents.passwordHint")}><Input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></Field></div><Button className="mt-4" loading={create.isPending} disabled={Boolean(password && password.length < 8)} onClick={() => create.mutate()}><Link2 />{t("documents.createLink")}</Button>{createdUrl ? <div className="mt-4 flex items-center gap-2 rounded-md bg-success-subtle p-3"><Input className="border-0 bg-transparent shadow-none" readOnly value={createdUrl} /><Button variant="ghost" size="icon-sm" aria-label={t("documents.copyLink")} onClick={() => { void navigator.clipboard.writeText(createdUrl); toast({ tone: "success", title: t("documents.linkCopied") }); }}><Copy /></Button></div> : null}{create.error ? <Alert className="mt-4" variant="danger" title={t("documents.linkCreateError")}>{create.error instanceof ApiClientError && create.error.code === "SENSITIVITY_BLOCKED" ? t("governance.sensitivityBlocked") : apiErrorText(create.error, t)}</Alert> : null}<div className="mt-6 border-t border-border pt-5"><h3 className="nx-label mb-3">{t("documents.activeLinks")}</h3>{links.isPending ? <Skeleton className="h-20" /> : links.data?.length ? <div className="divide-y divide-border">{links.data.map((link) => <div key={link.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-medium text-foreground">{link.permission === "EDIT" ? t("documents.permissionEdit") : t("documents.permissionView")}{link.passwordProtected ? ` — ${t("documents.linkProtected")}` : ""}</p><p className="mt-0.5 text-xs text-muted-foreground">{t("documents.expires")} {formatDateTime(link.expiresAt)}</p></div><Button variant="ghost" size="sm" className="text-danger hover:bg-danger-subtle hover:text-danger" loading={revoke.isPending} onClick={() => revoke.mutate(link.id)}>{t("documents.revoke")}</Button></div>)}</div> : <p className="text-sm text-muted-foreground">{t("documents.noActiveLinks")}</p>}</div></Dialog>;
}

function RenameDialog({open, value, onChange, onClose, loading, error, onSubmit }: { open: boolean; value: string; onChange: (value: string) => void; onClose: () => void; loading: boolean; error?: string; onSubmit: () => void }) {
  const { t } = useTranslation();
  function submit(event: FormEvent) { event.preventDefault(); if (value.trim()) onSubmit(); }
  return <Dialog open={open} onOpenChange={(next) => !next && onClose()} title={t("documents.renameDocument")} footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="rename-document-form" loading={loading} disabled={!value.trim()}>{t("common.save")}</Button></>}><form id="rename-document-form" onSubmit={submit}><Field label={t("documents.newName")} required error={error}><Input autoFocus value={value} onChange={(event) => onChange(event.target.value)} /></Field></form></Dialog>;
}

function MoveDialog({document, folders, loadingFolders, loading, error, onClose, onSubmit }: { document: DocumentItemDto; folders: FolderItemDto[]; loadingFolders: boolean; loading: boolean; error?: string; onClose: () => void; onSubmit: (folderId: string | null) => void }) {
  const { t } = useTranslation();
  const [destination, setDestination] = useState(document.folderId ?? "");
  return <Dialog open onOpenChange={(next) => !next && onClose()} title={t("documents.moveDocument")} description={t("documents.moveDocumentDesc")} footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button loading={loading} onClick={() => onSubmit(destination || null)}><FolderInput />{t("common.move")}</Button></>}><Field label={t("documents.selectDestination")} error={error}>{loadingFolders ? <Skeleton className="h-10" /> : <Select value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">{t("documents.rootFolder")}</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</Select>}</Field></Dialog>;
}

function VersionDialog({documentName, loading, error, onClose, onSubmit }: { documentName: string; loading: boolean; error?: string; onClose: () => void; onSubmit: (file: File, versionType: "major" | "minor") => void }) {
  const { t } = useTranslation();
  const { formatBytes } = useLocaleFormatter();
  const [file, setFile] = useState<File | null>(null);
  const [versionType, setVersionType] = useState<"major" | "minor">("major");
  return <Dialog open onOpenChange={(next) => !next && onClose()} title={t("documents.addNewVersion")} description={t("documents.replaceDesc", { name: documentName })} footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button loading={loading} disabled={!file} onClick={() => file && onSubmit(file, versionType)}><Upload />{t("documents.addVersion")}</Button></>}><Field label={t("documents.upload")} required error={error}><Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field><Field label={t("documents.versionType")} helper={t("documents.versionTypeHint")}><Select value={versionType} onChange={(event) => setVersionType(event.target.value as "major" | "minor")}><option value="major">{t("documents.versionMajor")}</option><option value="minor">{t("documents.versionMinor")}</option></Select></Field>{file ? <div className="mt-4 flex items-center gap-3 rounded-md bg-surface-secondary p-3"><FileText className="size-4 text-muted-foreground" /><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{file.name}</p><p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p></div><Check className="ml-auto size-4 text-success" /></div> : null}</Dialog>;
}

function DocumentActivity({ organizationId, documentId }: { organizationId: string; documentId: string }) {
  const { t } = useTranslation();
  const { formatDateTime } = useLocaleFormatter();
  const activity = useQuery({ queryKey: ["document-activity", organizationId, documentId], queryFn: () => documentsApi.activity(organizationId, documentId) });
  if (activity.isPending) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>;
  if (activity.isError) return <Alert variant="danger" title={t("documents.activityError")}><p>{apiErrorText(activity.error, t)}</p></Alert>;
  const { stats, activity: entries } = activity.data;
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="grid grid-cols-3 gap-3">
        {([["views", stats.views], ["downloads", stats.downloads], ["edits", stats.edits]] as const).map(([key, value]) => <div key={key} className="rounded-md bg-surface-secondary p-3 text-center"><p className="text-lg font-semibold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{t(`documents.activity${key[0]!.toUpperCase()}${key.slice(1)}`)}</p></div>)}
      </div>
      {entries.length === 0 ? <EmptyState icon={FileClock} title={t("documents.activityEmpty")} description={t("documents.activityEmptyDesc")} /> : (
        <div className="mt-5"><Timeline items={entries.map((entry) => ({ id: entry.id, title: t(`documents.activityActions.${entry.action}`, { defaultValue: entry.action }), description: entry.actor?.name ?? t("documents.activitySystem"), time: formatDateTime(entry.occurredAt), tone: "neutral" }))} /></div>
      )}
    </section>
  );
}

function Metadata({ icon: Icon, label, value, avatar }: { icon: typeof FileText; label: string; value: string; avatar?: React.ReactNode }) { return <div className="flex gap-3"><span className="mt-0.5 text-muted-foreground">{avatar ?? <Icon className="size-4" />}</span><div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-0.5 break-all text-sm text-secondary-foreground">{value}</dd></div></div>; }
function InfoIcon() { return <HardDrive className="size-4" />; }
function DocumentDetailSkeleton() { return <div className="mx-auto max-w-[90rem] space-y-6"><Skeleton className="h-5 w-72" /><div className="flex justify-between border-b border-border pb-6"><div className="flex gap-4"><Skeleton className="size-12" /><div className="space-y-2"><Skeleton className="h-7 w-72" /><Skeleton className="h-4 w-40" /></div></div><Skeleton className="h-10 w-80" /></div><Skeleton className="h-10 w-96" /><div className="grid gap-6 xl:grid-cols-[1fr_20rem]"><Skeleton className="h-[34rem]" /><Skeleton className="h-[34rem]" /></div></div>; }
function saveBlob(result: { blob: Blob; name: string }) { const url = URL.createObjectURL(result.blob); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = result.name; anchor.click(); URL.revokeObjectURL(url); }

function DocumentComments({ organizationId, documentId, comments, pending, userId, status, presence }: { organizationId: string; documentId: string; comments: import("@nexora/contracts").DocumentCommentDto[]; pending: boolean; userId: string; status: RealtimeStatus; presence: import("@nexora/contracts").RealtimePresenceDto[] }) {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useConfirm();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatDateTime } = useLocaleFormatter();
  const [body, setBody] = useState("");
  const members = useCollaborationMembers(organizationId).data?.members ?? [];
  const queryKey = ["document-comments", organizationId, documentId];
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const add = useMutation({ mutationFn: (value: string) => documentsApi.createComment(organizationId, documentId, value), onSuccess: async () => { setBody(""); await refresh(); toast({ tone: "success", title: t("documents.commentsAdded") }); }, onError: (error: Error) => toast({ tone: "danger", title: t("documents.errorAddingComment"), description: apiErrorText(error, t) }) });
  const remove = useMutation({ mutationFn: (commentId: string) => documentsApi.deleteComment(organizationId, documentId, commentId), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("documents.commentDeleted") }); }, onError: (error: Error) => toast({ tone: "danger", title: t("documents.errorDeletingComment"), description: apiErrorText(error, t) }) });
  function submit(event: FormEvent) { event.preventDefault(); if (body.trim()) add.mutate(body.trim()); }
  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="space-y-3">
        {pending ? <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : null}
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-md border border-border bg-surface-secondary p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar name={comment.author.name} src={comment.author.avatar} size="sm" />
                <div>
                  <p className="text-sm font-medium text-foreground">{comment.author.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</p>
                </div>
              </div>
              {comment.author.id === userId ? <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={async () => { if (await confirm(t("documents.deleteCommentConfirm"))) remove.mutate(comment.id); }} aria-label={t("common.delete")}><Trash2 className="size-3.5" /></Button> : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-secondary-foreground"><MentionText text={comment.body} members={members} /></p>
          </div>
        ))}
        {!pending && comments.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t("common.noComments")}</p> : null}
      </div>
      <form className="mt-4" onSubmit={submit}>
        <MentionTextarea organizationId={organizationId} members={members} className="min-h-20" placeholder={t("documents.commentPlaceholder")} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">{t("collaboration.mentionHint")}</p>
            <LivePresence status={status} presence={presence} />
          </span>
          <Button type="submit" loading={add.isPending} disabled={!body.trim()}><Send className="size-4" />{t("documents.sendComment")}</Button>
        </div>
      </form>
      {confirmDialog}
    </section>
  );
}

function DocumentMetadataSection({ organizationId, documentId, fields, metadata, metadataAuto, disabled, lockedTitle, onSaved }: { organizationId: string; documentId: string; fields: FolderMetadataFieldDto[]; metadata: Record<string, unknown>; metadataAuto: string[]; disabled: boolean; lockedTitle?: string; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, unknown>>(metadata);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  useEffect(() => { setValues(metadata); }, [metadata]);
  const autoSlugs = new Set(metadataAuto);
  const users = useQuery({ queryKey: ["organization-users", organizationId], queryFn: () => usersApi.list(organizationId), enabled: fields.some((f) => f.type === "user") });
  const save = useMutation({
    mutationFn: () => documentsApi.updateDocumentMetadata(organizationId, documentId, values),
    onSuccess: async () => { setFieldErrors({}); await onSaved(); toast({ tone: "success", title: t("documents.meta.saved") }); },
    onError: (error: Error) => {
      if (error instanceof ApiClientError && error.fields) setFieldErrors(error.fields);
      toast({ tone: "danger", title: t("documents.meta.errorSaving"), description: apiErrorText(error, t) });
    }
  });
  const autofill = useMutation({
    mutationFn: () => documentsApi.autofillMetadata(organizationId, documentId),
    onSuccess: async (result) => {
      const applied = Object.keys(result.applied).length;
      await onSaved();
      toast({ tone: applied ? "success" : "info", title: applied ? t("documents.metadataAutofilled", { count: applied }) : t("documents.metadataNoSuggestions") });
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("documents.errorAutofill"), description: apiErrorText(error, t) })
  });
  function setField(slug: string, value: unknown) { setValues((current) => ({ ...current, [slug]: value })); }
  return (
    <section className="mt-6 rounded-lg border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4"><h2 className="nx-h3">{t("documents.meta.title")}</h2>{!disabled && fields.length > 0 ? <Button type="button" variant="outline" size="sm" loading={autofill.isPending} onClick={() => autofill.mutate()}><Sparkles />{t("documents.suggestMetadata")}</Button> : null}</header>
      {fields.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">{t("documents.meta.none")}</p> : (
        <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <MetadataValueInput key={field.id} field={field} value={values[field.slug]} users={users.data ?? []} error={fieldErrors[field.slug]?.[0]} disabled={disabled} auto={autoSlugs.has(field.slug)} onChange={(value) => setField(field.slug, value)} />
            ))}
          </div>
          <div className="flex justify-end"><Button type="submit" loading={save.isPending} disabled={disabled} title={lockedTitle}>{t("common.save")}</Button></div>
        </form>
      )}
    </section>
  );
}

function MetadataValueInput({ field, value, users, error, disabled, auto, onChange }: { field: FolderMetadataFieldDto; value: unknown; users: { memberId: string; name: string }[]; error?: string; disabled: boolean; auto?: boolean; onChange: (value: unknown) => void }) {
  const { t } = useTranslation();
  const aiBadge = auto ? <Badge variant="primary" className="ml-1.5 align-middle" title={t("documents.aiFilledHint")}><Sparkles className="size-3" />{t("documents.aiBadge")}</Badge> : null;
  if (field.type === "boolean") {
    return <label className="flex items-center gap-2 rounded-md bg-surface-secondary p-3 text-sm font-medium text-secondary-foreground"><Checkbox checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{field.name}{aiBadge}{field.required ? <span className="text-xs text-muted-foreground">({t("common.required")})</span> : null}</label>;
  }
  let control: React.ReactNode;
  if (field.type === "longtext") control = <Textarea rows={3} value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled} />;
  else if (field.type === "choice") control = <Select value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled}><option value="">{t("common.select")}</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>;
  else if (field.type === "user") control = <Select value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled}><option value="">{t("common.select")}</option>{users.map((user) => <option key={user.memberId} value={user.memberId}>{user.name}</option>)}</Select>;
  else control = <Input type={field.type === "currency" || field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : ["date", "email", "url"].includes(field.type) ? field.type : "text"} step={field.type === "currency" ? "0.01" : field.type === "number" ? "any" : undefined} value={(value as string | number) ?? ""} onChange={(event) => onChange(field.type === "number" || field.type === "currency" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)} required={field.required} disabled={disabled} />;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center">
        <span className="nx-label block">{field.name}{field.required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}</span>
        {aiBadge}
      </div>
      {control}
      {error ? <p className="text-xs text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
