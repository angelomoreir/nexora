import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TrashItemDto } from "@nexora/contracts";
import { ArrowLeft, File, Folder, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useWorkspace } from "../components/layout/app-layout";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import {
  Alert,
  Avatar,
  Button,
  Dialog,
  EmptyState,
  Page,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast
} from "../components/ui";
import { ApiClientError, documentsApi, settingsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

export function DocumentsTrashPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatDateTime } = useLocaleFormatter();
  const [confirmPurge, setConfirmPurge] = useState<TrashItemDto | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const queryKey = ["trash", organization.id];
  const trash = useQuery({ queryKey, queryFn: () => documentsApi.listTrash(organization.id) });
  const settings = useQuery({ queryKey: ["admin-settings", organization.id], queryFn: () => settingsApi.get(organization.id), staleTime: 60_000 });
  const items = [...(trash.data?.folders ?? []), ...(trash.data?.documents ?? [])].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] });
  };
  const notifyError = (title: string) => (error: Error) => {
    if (error instanceof ApiClientError && error.code === "RETENTION_BLOCKED") {
      toast({ tone: "danger", title, description: t("governance.retentionBlocked") });
      return;
    }
    toast({ tone: "danger", title, description: apiErrorText(error, t) });
  };
  const restore = useMutation({ mutationFn: (item: TrashItemDto) => documentsApi.restoreTrashItem(organization.id, item.kind, item.id), onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("documents.trash.restored") }); }, onError: notifyError(t("documents.trash.errorRestoring")) });
  const purge = useMutation({ mutationFn: (item: TrashItemDto) => documentsApi.purgeTrashItem(organization.id, item.kind, item.id), onSuccess: async () => { setConfirmPurge(null); await refresh(); toast({ tone: "success", title: t("documents.trash.purged") }); }, onError: notifyError(t("documents.trash.errorPurging")) });
  const empty = useMutation({ mutationFn: () => documentsApi.emptyTrash(organization.id), onSuccess: async () => { setConfirmEmpty(false); await refresh(); toast({ tone: "success", title: t("documents.trash.emptied") }); }, onError: notifyError(t("documents.trash.errorEmptying")) });

  const retentionDays = settings.data?.trashRetentionDays;
  const description = retentionDays ? t("documents.trash.descriptionDays", { days: retentionDays }) : t("documents.trash.description");

  return (
    <Page>
      <PageHeader
        eyebrow={organization.name}
        title={t("documents.trash.title")}
        description={description}
        actions={<><ContextualHelpButton route="/documents/trash" showLabel /><Button variant="destructive" disabled={items.length === 0} onClick={() => setConfirmEmpty(true)}><Trash2 />{t("documents.trash.empty")}</Button></>}
      />

      {trash.isPending ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : null}

      {trash.isError ? (
        <Alert variant="danger" title={t("documents.trash.loadingError")}><p>{apiErrorText(trash.error, t)}</p><Button className="mt-4" size="sm" onClick={() => void trash.refetch()}>{t("common.retry")}</Button></Alert>
      ) : null}

      {trash.data && items.length === 0 ? (
        <EmptyState icon={Trash2} title={t("documents.trash.emptyTitle")} description={t("documents.trash.emptyDesc")} action={<Link to="/documents"><Button variant="outline"><ArrowLeft />{t("documents.trash.backToDocuments")}</Button></Link>} />
      ) : null}

      {trash.data && items.length > 0 ? (
        <section className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("documents.trash.location")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("documents.trash.deletedBy")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("documents.trash.deletedAt")}</TableHead>
                <TableHead className="w-40 text-right"><span className="sr-only">{t("common.actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={`${item.kind}-${item.id}`}>
                  <TableCell>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-md ${item.kind === "folder" ? "bg-warning-subtle text-warning" : "bg-primary-subtle text-primary-subtle-foreground"}`}>{item.kind === "folder" ? <Folder className="size-4" fill="currentColor" fillOpacity={0.12} /> : <File className="size-4" />}</span>
                      <span className="min-w-0"><span className="block max-w-72 truncate font-medium text-foreground">{item.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.kind === "folder" ? t("documents.folder") : t("documents.document")}</span></span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{item.originalLocation}</TableCell>
                  <TableCell className="hidden md:table-cell">{item.deletedBy ? <span className="flex items-center gap-2"><Avatar name={item.deletedBy.name} src={item.deletedBy.avatar} size="sm" /><span className="text-sm text-secondary-foreground">{item.deletedBy.name}</span></span> : "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{formatDateTime(item.deletedAt)}</TableCell>
                  <TableCell>
                    <span className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" loading={restore.isPending && restore.variables?.id === item.id} onClick={() => restore.mutate(item)}><RotateCcw />{t("documents.trash.restore")}</Button>
                      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-subtle hover:text-danger" onClick={() => setConfirmPurge(item)}><Trash2 />{t("documents.trash.purge")}</Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <Dialog open={confirmPurge !== null} onOpenChange={(next) => !next && setConfirmPurge(null)} title={t("documents.trash.purgeTitle")} description={t("documents.trash.purgeConfirm", { name: confirmPurge?.name ?? "" })} footer={<><Button variant="ghost" onClick={() => setConfirmPurge(null)}>{t("common.cancel")}</Button><Button variant="destructive" loading={purge.isPending} onClick={() => confirmPurge && purge.mutate(confirmPurge)}>{t("documents.trash.purge")}</Button></>} />
      <Dialog open={confirmEmpty} onOpenChange={(next) => !next && setConfirmEmpty(false)} title={t("documents.trash.emptyTitle2")} description={t("documents.trash.emptyConfirm")} footer={<><Button variant="ghost" onClick={() => setConfirmEmpty(false)}>{t("common.cancel")}</Button><Button variant="destructive" loading={empty.isPending} onClick={() => empty.mutate()}>{t("documents.trash.empty")}</Button></>} />
    </Page>
  );
}
