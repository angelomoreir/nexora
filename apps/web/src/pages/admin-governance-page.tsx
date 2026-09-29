import { useQuery } from "@tanstack/react-query";
import { Copy, FileWarning, Link2, Lock, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, EmptyState, Page, PageHeader, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "../components/ui";
import { governanceApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

export function AdminGovernancePage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { formatDateTime, formatBytes } = useLocaleFormatter();
  const report = useQuery({ queryKey: ["governance-report", organization.id], queryFn: () => governanceApi.report(organization.id) });
  const data = report.data;

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("governance.title")} description={t("governance.description")} />

      {report.isPending ? <div className="space-y-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 w-full" />)}</div> : null}
      {report.isError ? <Alert variant="danger" title={t("governance.loadingError")}>{apiErrorText(report.error, t)}</Alert> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">{t("governance.publicLinks")}</p><p className="mt-1 text-2xl font-semibold text-foreground">{data.publicLinks.length}</p></div>
            <div className="rounded-lg border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">{t("governance.inactive")}</p><p className="mt-1 text-2xl font-semibold text-foreground">{data.inactiveDocuments.length}</p></div>
            <div className="rounded-lg border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">{t("governance.duplicates")}</p><p className="mt-1 text-2xl font-semibold text-foreground">{data.duplicateDocuments.length}</p></div>
            <div className="rounded-lg border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">{t("governance.records")}</p><p className="mt-1 text-2xl font-semibold text-foreground">{data.recordsCount} <span className="text-sm font-normal text-muted-foreground">/ {data.legalHoldsCount} {t("governance.holds")}</span></p></div>
          </div>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Link2 className="size-5" />{t("governance.publicLinksTitle")}</h2>
            {data.publicLinks.length === 0 ? <EmptyState icon={ShieldCheck} title={t("governance.noPublicLinks")} /> : (
              <TableContainer><Table>
                <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("governance.targetType")}</TableHead><TableHead>{t("governance.permission")}</TableHead><TableHead>{t("governance.expiresAt")}</TableHead><TableHead className="hidden md:table-cell">{t("governance.createdBy")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.publicLinks.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium text-foreground">{link.targetName}</TableCell>
                      <TableCell><Badge variant="outline">{link.targetType}</Badge></TableCell>
                      <TableCell><Badge variant={link.permission === "READ" ? "neutral" : "warning"}>{link.permission}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{link.expiresAt ? formatDateTime(link.expiresAt) : "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{link.createdBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></TableContainer>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><FileWarning className="size-5" />{t("governance.inactiveTitle")}</h2>
            {data.inactiveDocuments.length === 0 ? <EmptyState icon={ShieldCheck} title={t("governance.noInactive")} /> : (
              <TableContainer><Table>
                <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("governance.lastActivity")}</TableHead><TableHead>{t("governance.size")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.inactiveDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium text-foreground">{doc.name}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(doc.lastActivityAt)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatBytes(doc.sizeBytes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></TableContainer>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Copy className="size-5" />{t("governance.duplicatesTitle")}</h2>
            {data.duplicateDocuments.length === 0 ? <EmptyState icon={ShieldCheck} title={t("governance.noDuplicates")} /> : (
              <TableContainer><Table>
                <TableHeader><TableRow><TableHead>{t("governance.duplicateFiles")}</TableHead><TableHead>{t("governance.size")}</TableHead><TableHead>{t("governance.copies")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.duplicateDocuments.map((dup) => (
                    <TableRow key={dup.checksum}>
                      <TableCell className="font-medium text-foreground">{dup.names.join(", ")}</TableCell>
                      <TableCell className="text-muted-foreground">{formatBytes(dup.sizeBytes)}</TableCell>
                      <TableCell><Badge variant="warning">{dup.documentIds.length}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></TableContainer>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Lock className="size-5" />{t("governance.recordsTitle")}</h2>
            <p className="text-sm text-secondary-foreground">{t("governance.recordsDesc", { records: data.recordsCount, holds: data.legalHoldsCount })}</p>
          </section>
        </>
      ) : null}
    </Page>
  );
}
