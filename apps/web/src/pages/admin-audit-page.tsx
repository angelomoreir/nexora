import { useQuery } from "@tanstack/react-query";
import type { AuditLogDto } from "@nexora/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, EmptyState, Input, Page, PageHeader, Pagination, Select, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "../components/ui";
import { auditApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

export function AdminAuditPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useLocaleFormatter();
  const { organization } = useWorkspace();
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [result, setResult] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const auditQuery = useQuery({
    queryKey: ["admin-audit", organization.id, action, resourceType, result, search, page],
    queryFn: () => auditApi.list(organization.id, {
      action: action || undefined,
      resourceType: resourceType || undefined,
      result: result || undefined,
      search: search || undefined,
      page,
      pageSize: 50
    })
  });

  const logs: AuditLogDto[] = auditQuery.data?.logs ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("admin.auditTitle")} description={t("admin.auditDesc")} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm sm:flex-row sm:flex-wrap">
        <Input className="sm:w-48" placeholder={t("common.search")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Input className="sm:w-40" placeholder={t("admin.filterAction")} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        <Input className="sm:w-40" placeholder={t("admin.filterResource")} value={resourceType} onChange={(e) => { setResourceType(e.target.value); setPage(1); }} />
        <Select className="sm:w-44" value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }}>
          <option value="">{t("admin.allResults")}</option>
          <option value="SUCCESS">{t("admin.resultSuccess")}</option>
          <option value="FAILURE">{t("admin.resultFailure")}</option>
        </Select>
      </div>

      {auditQuery.isError ? (
        <Alert variant="danger" title={t("common.error")}>{apiErrorText(auditQuery.error, t)}</Alert>
      ) : null}

      {auditQuery.isPending ? (
        <TableContainer>
          <Table>
            <TableHeader><TableRow><TableHead>{t("common.dateTime")}</TableHead><TableHead>{t("admin.userName")}</TableHead><TableHead>{t("admin.action")}</TableHead><TableHead>{t("admin.resource")}</TableHead><TableHead>{t("admin.ip")}</TableHead><TableHead>{t("admin.filterResult")}</TableHead></TableRow></TableHeader>
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

      {auditQuery.data ? (
        logs.length === 0 ? (
          <EmptyState title={t("admin.noAuditLogs")} description={t("admin.noAuditRecords")} />
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.dateTime")}</TableHead>
                  <TableHead>{t("admin.userName")}</TableHead>
                  <TableHead>{t("admin.action")}</TableHead>
                  <TableHead>{t("admin.resource")}</TableHead>
                  <TableHead>{t("admin.ip")}</TableHead>
                  <TableHead>{t("admin.filterResult")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(log.occurredAt)}</TableCell>
                    <TableCell>{log.actor ? log.actor.name : t("common.system")}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground">{log.action}</TableCell>
                    <TableCell>{log.resourceType}{log.resourceId ? ` · ${log.resourceId.slice(-8)}` : ""}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.ipAddress ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={log.result === "SUCCESS" ? "success" : "danger"}>{log.result === "SUCCESS" ? t("admin.resultSuccess") : t("admin.resultFailure")}</Badge>
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
    </Page>
  );
}
