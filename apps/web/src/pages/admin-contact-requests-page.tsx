import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContactRequestDto } from "@nexora/contracts";
import { Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, EmptyState, Input, Page, PageHeader, Pagination, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, useConfirm, useToast } from "../components/ui";
import { contactRequestsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

export function AdminContactRequestsPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useLocaleFormatter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<ContactRequestDto | null>(null);

  const requestsQuery = useQuery({
    queryKey: ["admin-contact-requests", search, page],
    queryFn: () => contactRequestsApi.list({ search: search || undefined, page, pageSize: 50 })
  });

  const remove = useMutation({
    mutationFn: (requestId: string) => contactRequestsApi.remove(requestId),
    onSuccess: async () => {
      toast({ title: t("admin.contactRequestDeleted"), tone: "success" });
      setViewing(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-contact-requests"] });
    },
    onError: (error) => toast({ title: t("admin.contactRequestsLoadError"), description: apiErrorText(error, t), tone: "danger" })
  });

  async function removeRequest(item: ContactRequestDto) {
    if (await confirm({ title: t("admin.deleteContactRequestConfirm"), confirmLabel: t("common.delete") })) {
      remove.mutate(item.id);
    }
  }

  const requests = requestsQuery.data?.requests ?? [];
  const total = requestsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("admin.contactRequestsTitle")} description={t("admin.contactRequestsDesc")} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm sm:flex-row sm:flex-wrap">
        <Input className="sm:w-72" placeholder={t("common.search")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {requestsQuery.isPending ? (
        <TableContainer>
          <Table>
            <TableHeader><TableRow><TableHead>{t("common.dateTime")}</TableHead><TableHead>{t("common.name")}</TableHead><TableHead>{t("admin.userEmail")}</TableHead><TableHead>{t("public.contact.company")}</TableHead><TableHead>{t("public.contact.message")}</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
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
                  <TableHead>{t("admin.userEmail")}</TableHead>
                  <TableHead>{t("public.contact.company")}</TableHead>
                  <TableHead>{t("public.contact.message")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(item.createdAt)}</TableCell>
                    <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                    <TableCell><a className="text-primary hover:underline" href={`mailto:${item.email}`}>{item.email}</a></TableCell>
                    <TableCell>{item.company ?? "—"}</TableCell>
                    <TableCell className="max-w-72"><span className="block truncate text-secondary-foreground">{item.message}</span></TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="icon-sm" aria-label={t("admin.viewMessage")} onClick={() => setViewing(item)}><Eye className="size-4" /></Button>
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
        onOpenChange={(open) => { if (!open) setViewing(null); }}
        title={viewing?.name ?? ""}
        description={viewing ? `${viewing.email}${viewing.company ? ` · ${viewing.company}` : ""} · ${formatDateTime(viewing.createdAt)}` : undefined}
        footer={viewing ? (
          <>
            <Button variant="outline" onClick={() => setViewing(null)}>{t("common.close")}</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => void removeRequest(viewing)}>{t("common.delete")}</Button>
          </>
        ) : undefined}
      >
        <p className="whitespace-pre-wrap text-sm text-secondary-foreground">{viewing?.message}</p>
      </Dialog>

      {confirmDialog}
    </Page>
  );
}
