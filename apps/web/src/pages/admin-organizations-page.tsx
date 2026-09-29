import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlatformOrganizationDto } from "@nexora/contracts";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Button, EmptyState, Input, Page, PageHeader, Pagination, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, useConfirm, useToast } from "../components/ui";
import { platformOrganizationsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

export function AdminOrganizationsPage() {
  const { t } = useTranslation();
  const { formatDate } = useLocaleFormatter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const organizationsQuery = useQuery({
    queryKey: ["platform-organizations", search, page],
    queryFn: () => platformOrganizationsApi.list({ search: search || undefined, page, pageSize: 50 })
  });

  const remove = useMutation({
    mutationFn: (organizationId: string) => platformOrganizationsApi.remove(organizationId),
    onSuccess: async () => {
      toast({ title: t("admin.organizationDeleted"), tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["platform-organizations"] });
    },
    onError: (error) => toast({ title: t("admin.organizationsLoadError"), description: apiErrorText(error, t), tone: "danger" })
  });

  async function removeOrganization(org: PlatformOrganizationDto) {
    if (await confirm({ title: t("admin.deleteOrganizationConfirm", { name: org.name, count: org.memberCount }), confirmLabel: t("common.delete") })) {
      remove.mutate(org.id);
    }
  }

  const organizations = organizationsQuery.data?.organizations ?? [];
  const total = organizationsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("admin.organizationsTitle")} description={t("admin.organizationsDesc")} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm sm:flex-row sm:flex-wrap">
        <Input className="sm:w-72" placeholder={t("common.search")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {organizationsQuery.isPending ? (
        <TableContainer>
          <Table>
            <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("common.owner")}</TableHead><TableHead>{t("admin.members")}</TableHead><TableHead>{t("admin.orgPlan")}</TableHead><TableHead>{t("common.status")}</TableHead><TableHead>{t("common.createdAt")}</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {organizationsQuery.isError ? <Alert variant="danger">{t("admin.organizationsLoadError")}</Alert> : null}

      {organizationsQuery.data ? (
        organizations.length === 0 ? (
          <EmptyState title={t("admin.noOrganizations")} description={t("admin.noOrganizationsDesc")} />
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.owner")}</TableHead>
                  <TableHead>{t("admin.members")}</TableHead>
                  <TableHead>{t("admin.orgPlan")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("common.createdAt")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <span className="block font-medium text-foreground">{org.name}</span>
                      <span className="block text-xs text-muted-foreground">{org.slug}</span>
                    </TableCell>
                    <TableCell>
                      {org.ownerEmail ? (
                        <>
                          <span className="block">{org.ownerName}</span>
                          <a className="block text-xs text-primary hover:underline" href={`mailto:${org.ownerEmail}`}>{org.ownerEmail}</a>
                        </>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{org.memberCount}</TableCell>
                    <TableCell>
                      {org.planName ?? "—"}
                      {org.subscriptionStatus && org.subscriptionStatus !== "ACTIVE" ? (
                        <span className="block text-xs text-muted-foreground">{org.subscriptionStatus}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.status === "ACTIVE" ? "success" : "neutral"}>{org.status}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(org.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.delete")} className="text-muted-foreground hover:bg-danger-subtle hover:text-danger" disabled={remove.isPending} onClick={() => void removeOrganization(org)}><Trash2 className="size-4" /></Button>
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

      {confirmDialog}
    </Page>
  );
}
