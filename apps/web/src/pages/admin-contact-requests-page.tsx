import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContactRequestDto, LeadStatus } from "@nexora/contracts";
import { Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, Page, PageHeader, Pagination, Select, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Textarea, useConfirm, useToast } from "../components/ui";
import { contactRequestsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";
import { cn } from "../lib/utils";

const STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "DEMO", "PROPOSAL", "WON", "LOST"];
const STATUS_VARIANT: Record<LeadStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  NEW: "info",
  CONTACTED: "neutral",
  DEMO: "warning",
  PROPOSAL: "warning",
  WON: "success",
  LOST: "danger"
};

export function AdminContactRequestsPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useLocaleFormatter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<ContactRequestDto | null>(null);
  const [notes, setNotes] = useState("");

  const requestsQuery = useQuery({
    queryKey: ["admin-contact-requests", search, status, page],
    queryFn: () => contactRequestsApi.list({ search: search || undefined, status, page, pageSize: 50 })
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-contact-requests"] });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { status?: LeadStatus; notes?: string } }) => contactRequestsApi.update(id, input),
    onSuccess: async (lead) => {
      toast({ title: t("admin.leadUpdated"), tone: "success" });
      setViewing((current) => (current?.id === lead.id ? lead : current));
      await invalidate();
    },
    onError: (error) => toast({ title: t("admin.leadUpdateError"), description: apiErrorText(error, t), tone: "danger" })
  });

  const remove = useMutation({
    mutationFn: (requestId: string) => contactRequestsApi.remove(requestId),
    onSuccess: async () => {
      toast({ title: t("admin.contactRequestDeleted"), tone: "success" });
      setViewing(null);
      await invalidate();
    },
    onError: (error) => toast({ title: t("admin.contactRequestsLoadError"), description: apiErrorText(error, t), tone: "danger" })
  });

  async function removeRequest(item: ContactRequestDto) {
    if (await confirm({ title: t("admin.deleteContactRequestConfirm"), confirmLabel: t("common.delete") })) {
      remove.mutate(item.id);
    }
  }

  function open(item: ContactRequestDto) {
    setViewing(item);
    setNotes(item.notes);
  }

  const requests = requestsQuery.data?.requests ?? [];
  const total = requestsQuery.data?.total ?? 0;
  const counts = requestsQuery.data?.statusCounts;
  const allCount = counts ? STATUSES.reduce((sum, key) => sum + counts[key], 0) : 0;
  const totalPages = Math.ceil(total / 50);
  const statusLabel = (value: LeadStatus) => t(`admin.leadStatus.${value}`);
  const intentLabel = (value: string) => t(`public.contact.intents.${value}`);

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("admin.contactRequestsTitle")} description={t("admin.pipelineDesc")} />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("admin.pipelineStages")}>
        {[undefined, ...STATUSES].map((key) => {
          const active = status === key;
          const count = key ? counts?.[key] ?? 0 : allCount;
          return (
            <button
              key={key ?? "ALL"}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => { setStatus(key); setPage(1); }}
              className={cn("nx-focus-ring rounded-full border px-3 py-1.5 text-sm transition-colors", active ? "border-primary bg-primary-subtle font-medium text-primary" : "border-border bg-surface text-secondary-foreground hover:border-border-strong")}
            >
              {key ? statusLabel(key) : t("admin.leadAll")} <span className="ml-1 text-xs text-muted-foreground">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm sm:flex-row sm:flex-wrap">
        <Input className="sm:w-72" placeholder={t("common.search")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {requestsQuery.isPending ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : null}

      {requestsQuery.isError ? <Alert variant="danger">{t("admin.contactRequestsLoadError")}</Alert> : null}

      {requestsQuery.data ? (
        requests.length === 0 ? (
          <EmptyState title={t("admin.noContactRequests")} description={t("admin.noContactRequestsDesc")} />
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.dateTime")}</TableHead>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("public.contact.company")}</TableHead>
                  <TableHead>{t("admin.leadIntent")}</TableHead>
                  <TableHead>{t("public.contact.teamSize")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(item.createdAt)}</TableCell>
                    <TableCell>
                      <span className="block font-medium text-foreground">{item.name}</span>
                      <a className="block text-xs text-primary hover:underline" href={`mailto:${item.email}`}>{item.email}</a>
                    </TableCell>
                    <TableCell>{item.company ?? "—"}</TableCell>
                    <TableCell>{intentLabel(item.intent)}</TableCell>
                    <TableCell>{item.teamSize ?? "—"}</TableCell>
                    <TableCell className="min-w-36">
                      <Select
                        aria-label={t("common.status")}
                        className="h-8"
                        value={item.status}
                        disabled={update.isPending}
                        onChange={(e) => update.mutate({ id: item.id, input: { status: e.target.value as LeadStatus } })}
                      >
                        {STATUSES.map((key) => <option key={key} value={key}>{statusLabel(key)}</option>)}
                      </Select>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="icon-sm" aria-label={t("admin.viewMessage")} onClick={() => open(item)}><Eye className="size-4" /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.delete")} className="text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={() => void removeRequest(item)}><Trash2 className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      ) : null}

      {totalPages > 1 ? (
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      ) : null}

      <Dialog
        open={viewing !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setViewing(null); }}
        title={viewing?.name ?? ""}
        description={viewing ? `${viewing.email}${viewing.company ? ` · ${viewing.company}` : ""} · ${formatDateTime(viewing.createdAt)}` : undefined}
        footer={viewing ? (
          <>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => void removeRequest(viewing)}>{t("common.delete")}</Button>
            <Button variant="outline" onClick={() => setViewing(null)}>{t("common.close")}</Button>
            <Button loading={update.isPending} disabled={notes === viewing.notes} onClick={() => update.mutate({ id: viewing.id, input: { notes } })}>{t("admin.leadSaveNotes")}</Button>
          </>
        ) : undefined}
      >
        {viewing ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[viewing.status]}>{statusLabel(viewing.status)}</Badge>
              <Badge variant="outline">{intentLabel(viewing.intent)}</Badge>
              {viewing.teamSize ? <Badge variant="outline">{t("public.contact.teamSize")}: {viewing.teamSize}</Badge> : null}
            </div>
            <p className="whitespace-pre-wrap text-sm text-secondary-foreground">{viewing.message}</p>
            <Field label={t("admin.leadNotes")}>
              <Textarea rows={5} value={notes} placeholder={t("admin.leadNotesPlaceholder")} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </Dialog>

      {confirmDialog}
    </Page>
  );
}
