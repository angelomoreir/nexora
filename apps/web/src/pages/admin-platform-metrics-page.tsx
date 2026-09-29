import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Activity, Building2, CreditCard, Euro, TrendingUp, UserPlus, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, Card, Page, PageHeader, Skeleton } from "../components/ui";
import { platformMetricsApi } from "../lib/api";
import { useLocaleFormatter } from "../lib/format";

function Kpi({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-secondary-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

export function AdminPlatformMetricsPage() {
  const { t } = useTranslation();
  const { locale, formatNumber, formatPercent, formatDateTime } = useLocaleFormatter();
  const metricsQuery = useQuery({ queryKey: ["platform-metrics"], queryFn: () => platformMetricsApi.get() });
  const metrics = metricsQuery.data;

  const money = (cents: number) => formatNumber(cents / 100, { style: "currency", currency: metrics?.currency ?? "EUR", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
  const monthLabel = (month: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(new Date(`${month}-01T00:00:00Z`));
  const growth = metrics && metrics.organizations.newPrev30d > 0
    ? (metrics.organizations.new30d - metrics.organizations.newPrev30d) / metrics.organizations.newPrev30d
    : null;
  const maxSignups = Math.max(1, ...(metrics?.signupsByMonth.map((row) => row.organizations) ?? [1]));
  const maxPlanOrgs = Math.max(1, ...(metrics?.plans.map((row) => row.organizations) ?? [1]));

  return (
    <Page>
      <PageHeader
        eyebrow={t("navigation.admin")}
        title={t("admin.platformMetricsTitle")}
        description={metrics ? `${t("admin.platformMetricsDesc")} · ${t("admin.metricsUpdated", { date: formatDateTime(metrics.generatedAt) })}` : t("admin.platformMetricsDesc")}
      />

      {metricsQuery.isError ? <Alert variant="danger">{t("admin.metricsLoadError")}</Alert> : null}

      {metricsQuery.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : null}

      {metrics ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Euro} label={t("admin.metricMrr")} value={money(metrics.mrrCents)} hint={t("admin.metricArr", { value: money(metrics.arrCents) })} />
            <Kpi icon={CreditCard} label={t("admin.metricPaying")} value={formatNumber(metrics.subscriptions.paying)} hint={t("admin.metricArpa", { value: money(metrics.arpaCents) })} />
            <Kpi icon={TrendingUp} label={t("admin.metricConversion")} value={formatPercent(metrics.conversionRate)} hint={t("admin.metricConversionHint")} />
            <Kpi icon={Activity} label={t("admin.metricActivation")} value={formatPercent(metrics.activationRate)} hint={t("admin.metricActivationHint", { count: metrics.organizations.activated })} />
            <Kpi icon={Building2} label={t("admin.metricOrganizations")} value={formatNumber(metrics.organizations.total)} hint={t("admin.metricActiveOrgs", { count: metrics.organizations.active })} />
            <Kpi
              icon={UserPlus}
              label={t("admin.metricNewOrgs")}
              value={formatNumber(metrics.organizations.new30d)}
              hint={growth === null ? t("admin.metricPrevPeriod", { count: metrics.organizations.newPrev30d }) : `${growth >= 0 ? "+" : ""}${formatPercent(growth)} ${t("admin.metricVsPrev")}`}
            />
            <Kpi icon={Users} label={t("admin.metricUsers")} value={formatNumber(metrics.users.total)} hint={t("admin.metricNewUsers", { count: metrics.users.new30d })} />
            <Kpi
              icon={CreditCard}
              label={t("admin.metricChurn")}
              value={formatNumber(metrics.subscriptions.canceled30d)}
              hint={t("admin.metricRisk", { pastDue: metrics.subscriptions.pastDue, trialing: metrics.subscriptions.trialing })}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="font-semibold text-foreground">{t("admin.metricSignupsByMonth")}</h2>
              <div className="mt-4 flex h-40 items-end gap-3" role="img" aria-label={t("admin.metricSignupsByMonth")}>
                {metrics.signupsByMonth.map((row) => (
                  <div key={row.month} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs font-medium text-foreground">{row.organizations}</span>
                    <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(4, (row.organizations / maxSignups) * 120)}px` }} />
                    <span className="text-xs text-muted-foreground">{monthLabel(row.month)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold text-foreground">{t("admin.metricByPlan")}</h2>
              <ul className="mt-4 space-y-3">
                {metrics.plans.map((plan) => (
                  <li key={plan.code}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-foreground">{plan.name}</span>
                      <span className="text-muted-foreground">
                        {t("admin.metricPlanRow", { orgs: plan.organizations, paying: plan.paying })} · {money(plan.mrrCents)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-surface-secondary">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${(plan.organizations / maxPlanOrgs) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">{t("admin.metricsFootnote")}</p>
        </>
      ) : null}
    </Page>
  );
}
