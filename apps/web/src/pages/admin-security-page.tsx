import { useQuery } from "@tanstack/react-query";
import { Activity, KeyRound, Lock, MonitorSmartphone, ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, EmptyState, Page, PageHeader, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "../components/ui";
import { securityApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

export function AdminSecurityPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { formatDateTime } = useLocaleFormatter();
  const overview = useQuery({ queryKey: ["security-overview", organization.id], queryFn: () => securityApi.overview(organization.id) });
  const data = overview.data;

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("admin.securityTitle")} description={t("admin.securityDesc")} />

      {overview.isPending ? <div className="space-y-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 w-full" />)}</div> : null}
      {overview.isError ? <Alert variant="danger">{apiErrorText(overview.error, t)}</Alert> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><KeyRound className="size-4 text-muted-foreground" />{t("admin.securitySsoTitle")}</h2>
              <div className="mt-3">
                <Badge variant={data.sso.enabled ? "success" : "neutral"}>{data.sso.enabled ? t("admin.securitySsoEnabled") : t("admin.securitySsoDisabled")}</Badge>
              </div>
              {data.sso.issuerUrl ? <p className="mt-2 break-all text-xs text-muted-foreground">{t("admin.securitySsoIssuer")}: {data.sso.issuerUrl}</p> : null}
              {data.sso.emailDomains.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">{t("admin.securitySsoDomains")}: {data.sso.emailDomains.join(", ")}</p> : null}
              {!data.sso.issuerUrl ? <p className="mt-2 text-xs text-muted-foreground">{t("admin.securitySsoNone")}</p> : null}
            </section>

            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Lock className="size-4 text-muted-foreground" />{t("admin.securityPolicyTitle")}</h2>
              <ul className="mt-3 space-y-1 text-sm text-secondary-foreground">
                <li>{t("admin.securityPolicyMinLength", { count: data.passwordPolicy.minLength })}</li>
                {data.passwordPolicy.requireUpper ? <li>{t("admin.requireUppercase")}</li> : null}
                {data.passwordPolicy.requireLower ? <li>{t("admin.requireLowercase")}</li> : null}
                {data.passwordPolicy.requireDigit ? <li>{t("admin.requireNumber")}</li> : null}
                {data.passwordPolicy.requireSymbol ? <li>{t("admin.requireSymbol")}</li> : null}
              </ul>
            </section>

            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Users className="size-4 text-muted-foreground" />{t("admin.securityMembersTitle")}</h2>
              <p className="mt-1 text-2xl font-semibold text-foreground">{data.members.active}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("admin.securitySuspendedMembers")}: {data.members.suspended} · {t("admin.pendingInvitations")}: {data.members.pendingInvitations}
              </p>
            </section>

            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><MonitorSmartphone className="size-4 text-muted-foreground" />{t("admin.securitySessionsTitle")}</h2>
              <p className="mt-1 text-2xl font-semibold text-foreground">{data.sessions.active}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("admin.securityActiveSessions")}</p>
            </section>
          </div>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Activity className="size-5" />{t("admin.securityEventsTitle")}</h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">{t("admin.securityFailedLogins")}</p><p className="mt-1 text-2xl font-semibold text-foreground">{data.securityEvents30d.failedLogins}</p></div>
              <div className="rounded-lg border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">{t("admin.securityLogins")}</p><p className="mt-1 text-2xl font-semibold text-foreground">{data.securityEvents30d.logins}</p></div>
              <div className="rounded-lg border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">{t("admin.securitySettingsChanges")}</p><p className="mt-1 text-2xl font-semibold text-foreground">{data.securityEvents30d.settingsChanges}</p></div>
              <div className="rounded-lg border border-border bg-surface p-4"><p className="text-sm text-muted-foreground">{t("admin.securityRoleChanges")}</p><p className="mt-1 text-2xl font-semibold text-foreground">{data.securityEvents30d.roleChanges}</p></div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><ShieldCheck className="size-5" />{t("admin.securityRecentTitle")}</h2>
            {data.recentSecurityEvents.length === 0 ? <EmptyState title={t("admin.securityNoEvents")} /> : (
              <TableContainer><Table>
                <TableHeader><TableRow><TableHead>{t("common.dateTime")}</TableHead><TableHead>{t("admin.actor")}</TableHead><TableHead>{t("admin.action")}</TableHead><TableHead className="hidden sm:table-cell">{t("admin.ip")}</TableHead><TableHead>{t("admin.filterResult")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.recentSecurityEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(event.occurredAt)}</TableCell>
                      <TableCell>{event.actorName ?? t("common.system")}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{event.action}</TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{event.ipAddress ?? "—"}</TableCell>
                      <TableCell><Badge variant={event.result === "SUCCESS" ? "success" : "danger"}>{event.result === "SUCCESS" ? t("admin.resultSuccess") : t("admin.resultFailure")}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></TableContainer>
            )}
          </section>
        </>
      ) : null}
    </Page>
  );
}
