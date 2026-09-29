import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AnnouncementDto } from "@nexora/contracts";
import { Megaphone, Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Textarea, useToast } from "../components/ui";
import { announcementsApi, teamsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

export function AdminAnnouncementsPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatDateTime } = useLocaleFormatter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AnnouncementDto | null>(null);

  const queryKey = ["announcements", organization.id];
  const announcements = useQuery({ queryKey, queryFn: () => announcementsApi.list(organization.id, true) });
  const teams = useQuery({ queryKey: ["teams", organization.id], queryFn: () => teamsApi.list(organization.id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const remove = useMutation({
    mutationFn: (id: string) => announcementsApi.remove(organization.id, id),
    onSuccess: async () => { setConfirmDelete(null); await refresh(); toast({ tone: "success", title: t("announcements.deleted") }); },
    onError: (error: Error) => toast({ tone: "danger", title: t("announcements.errorDeleting"), description: apiErrorText(error, t) })
  });

  const items = announcements.data?.announcements ?? [];
  const teamName = (audience: string) => audience.startsWith("TEAM:") ? teams.data?.find((team) => team.id === audience.slice(5))?.name ?? audience : t("announcements.audienceAll");

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("announcements.title")} description={t("announcements.description")}
        actions={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Megaphone />{t("announcements.create")}</Button>} />

      {announcements.isPending ? <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div> : null}
      {announcements.isError ? <Alert variant="danger" title={t("announcements.loadingError")}>{apiErrorText(announcements.error, t)}</Alert> : null}
      {announcements.data && items.length === 0 ? <EmptyState icon={Megaphone} title={t("announcements.empty")} description={t("announcements.emptyDesc")} action={<Button onClick={() => { setEditing(null); setFormOpen(true); }}>{t("announcements.create")}</Button>} /> : null}

      {items.length > 0 ? (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("announcements.titleField")}</TableHead>
                <TableHead>{t("announcements.audience")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("announcements.publishAt")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("announcements.expiresAt")}</TableHead>
                <TableHead className="w-24 text-right"><span className="sr-only">{t("common.actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((announcement) => (
                <TableRow key={announcement.id}>
                  <TableCell className="font-medium text-foreground">{announcement.title}</TableCell>
                  <TableCell><Badge variant={announcement.audience === "ALL" ? "primary" : "outline"}>{teamName(announcement.audience)}</Badge></TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatDateTime(announcement.publishAt)}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">{announcement.expiresAt ? formatDateTime(announcement.expiresAt) : "—"}</TableCell>
                  <TableCell>
                    <span className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.edit")} onClick={() => { setEditing(announcement); setFormOpen(true); }}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" className="text-danger hover:bg-danger-subtle hover:text-danger" aria-label={t("common.delete")} onClick={() => setConfirmDelete(announcement)}><Trash2 /></Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {formOpen ? <AnnouncementFormDialog announcement={editing} teams={(teams.data ?? []).map((team) => ({ id: team.id, name: team.name }))} onClose={() => setFormOpen(false)} onSaved={refresh} /> : null}
      <Dialog open={confirmDelete !== null} onOpenChange={(next) => !next && setConfirmDelete(null)} title={t("common.delete")} description={t("announcements.deleteConfirm", { name: confirmDelete?.title ?? "" })}
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</Button><Button variant="destructive" loading={remove.isPending} onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}>{t("common.delete")}</Button></>} />
    </Page>
  );
}

function toInputDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

function AnnouncementFormDialog({ announcement, teams, onClose, onSaved }: { announcement: AnnouncementDto | null; teams: { id: string; name: string }[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [audience, setAudience] = useState(announcement?.audience ?? "ALL");
  const [publishAt, setPublishAt] = useState(toInputDateTime(announcement?.publishAt ?? null));
  const [expiresAt, setExpiresAt] = useState(toInputDateTime(announcement?.expiresAt ?? null));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        audience,
        publishAt: publishAt ? new Date(publishAt).toISOString() : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
      };
      return announcement ? announcementsApi.update(organization.id, announcement.id, payload) : announcementsApi.create(organization.id, payload);
    },
    onSuccess: async () => { await onSaved(); toast({ tone: "success", title: announcement ? t("announcements.updated") : t("announcements.created") }); onClose(); },
    onError: (error: Error) => toast({ tone: "danger", title: t("announcements.errorSaving"), description: apiErrorText(error, t) })
  });

  function submit(event: FormEvent) { event.preventDefault(); if (title.trim() && body.trim()) save.mutate(); }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} size="lg" title={announcement ? t("announcements.editTitle") : t("announcements.createTitle")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="announcement-form" loading={save.isPending} disabled={!title.trim() || !body.trim()}>{t("common.save")}</Button></>}>
      <form id="announcement-form" className="space-y-4" onSubmit={submit}>
        <Field label={t("announcements.titleField")} required><Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} /></Field>
        <Field label={t("announcements.body")} required><Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} maxLength={10000} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("announcements.audience")}>
            <Select value={audience} onChange={(event) => setAudience(event.target.value)}>
              <option value="ALL">{t("announcements.audienceAll")}</option>
              {teams.map((team) => <option key={team.id} value={`TEAM:${team.id}`}>{team.name}</option>)}
            </Select>
          </Field>
          <Field label={t("announcements.publishAt")}><Input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} /></Field>
          <Field label={t("announcements.expiresAt")}><Input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></Field>
        </div>
      </form>
    </Dialog>
  );
}
