import { useQuery } from "@tanstack/react-query";
import type { AnalyticsPeriodDays, OperationalAnalyticsResponse, TaskStatus } from "@nexora/contracts";
import {
  BarChart3,
  CheckCircle2,
  CheckSquare2,
  Clock3,
  FileText,
  Gauge,
  GitBranch,
  Lock,
  RefreshCw,
  TriangleAlert,
  UsersRound
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { DashboardSection } from "../components/dashboard/widgets";
import {
  Alert,
  Button,
  EmptyState,
  Page,
  PageHeader,
  Skeleton,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui";
import { analyticsApi } from "../lib/api";
import { useLocaleFormatter } from "../lib/format";
import { cn } from "../lib/utils";

const PERIODS: AnalyticsPeriodDays[] = [7, 30, 90];
const TASK_STATUS_LABEL_KEYS: Record<TaskStatus, string> = { TODO: "common.todo", IN_PROGRESS: "common.inProgress", IN_REVIEW: "common.inReview", DONE: "common.completed", CANCELLED: "common.cancelled" };
const TASK_STATUS_BAR: Record<TaskStatus, string> = { TODO: "bg-muted-foreground", IN_PROGRESS: "bg-info", IN_REVIEW: "bg-warning", DONE: "bg-success", CANCELLED: "bg-danger" };
const humanize = (value: string) => value.replaceAll("_", " ");
const resourceTypeKey = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

export function AnalyticsPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const [days, setDays] = useState<AnalyticsPeriodDays>(30);
  const canView = organization.permissions.includes("analytics.view");
  const query = useQuery({
    queryKey: ["analytics", "operational", organization.id, days],
    queryFn: () => analyticsApi.operational(organization.id, days),
    enabled: canView
  });

  const periodSelector = (
    <div className="flex gap-1 rounded-lg border border-border bg-surface p-1 shadow-sm" role="group" aria-label={t("analytics.period")}>
      {PERIODS.map((period) => (
        <button key={period} type="button" aria-pressed={days === period} className={cn("nx-focus-ring rounded-md px-3 py-1.5 text-sm font-medium transition-colors", days === period ? "bg-primary text-white" : "text-secondary-foreground hover:bg-surface-secondary")} onClick={() => setDays(period)}>
          {t(`analytics.last${period}Days`)}
        </button>
      ))}
    </div>
  );

  if (!canView) {
    return (
      <Page>
        <PageHeader eyebrow={organization.name} title={t("analytics.title")} />
        <EmptyState icon={Lock} title={t("analytics.forbiddenTitle")} description={t("analytics.forbiddenDescription")} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader eyebrow={organization.name} title={t("analytics.title")} description={t("analytics.subtitle")} actions={<><ContextualHelpButton route="/analytics" showLabel />{periodSelector}</>} />
      {query.isPending ? <AnalyticsSkeleton /> : null}
      {query.isError ? (
        <Alert variant="danger" title={t("analytics.loadingError")}>
          <p>{t("analytics.loadingErrorDesc")}</p>
          <Button className="mt-3" size="sm" onClick={() => void query.refetch()}><RefreshCw />{t("common.retry")}</Button>
        </Alert>
      ) : null}
      {query.data ? <AnalyticsContent data={query.data} /> : null}
    </Page>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-14" />)}</div>
      <Skeleton className="h-64" />
      <div className="grid gap-8 lg:grid-cols-2"><Skeleton className="h-52" /><Skeleton className="h-52" /></div>
      <Skeleton className="h-64" />
    </div>
  );
}

function AnalyticsContent({ data }: { data: OperationalAnalyticsResponse }) {
  const { t } = useTranslation();
  const { formatNumber, formatPercent } = useLocaleFormatter();
  const { summary } = data;
  const percent = (value: number | null) => value === null ? "—" : formatPercent(value / 100);
  const hours = (value: number | null) => value === null ? "—" : `${formatNumber(value, { maximumFractionDigits: 1 })} ${t("analytics.hoursShort")}`;

  return (
    <>
      <section aria-labelledby="analytics-summary">
        <div className="mb-4"><h2 id="analytics-summary" className="nx-h3">{t("analytics.summary")}</h2><p className="mt-0.5 text-sm text-muted-foreground">{t("analytics.summaryDesc")}</p></div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 border-y border-border py-6 md:grid-cols-4">
          <Stat label={t("analytics.tasksCreated")} value={formatNumber(summary.tasksCreated)} icon={CheckSquare2} />
          <Stat label={t("analytics.tasksCompleted")} value={formatNumber(summary.tasksCompleted)} icon={CheckCircle2} />
          <Stat label={t("analytics.completionRatio")} value={percent(summary.currentTaskCompletionRatio)} icon={Gauge} />
          <Stat label={t("analytics.overdueTasks")} value={formatNumber(summary.overdueTasks)} icon={TriangleAlert} />
          <Stat label={t("analytics.documentsCreated")} value={formatNumber(summary.documentsCreated)} icon={FileText} />
          <Stat label={t("analytics.activeUsers")} value={formatNumber(summary.activeUsers)} icon={UsersRound} />
          <Stat label={t("analytics.avgApprovalHours")} value={hours(summary.avgApprovalHours)} icon={Clock3} />
          <Stat label={t("analytics.workflowSuccessRate")} value={percent(summary.workflowSuccessRate)} detail={t("analytics.workflowRunsCount", { count: summary.workflowRuns })} icon={GitBranch} />
        </div>
      </section>

      <DashboardSection title={t("analytics.trend")} description={t("analytics.trendDesc")}>
        <TrendChart trend={data.trend} />
      </DashboardSection>

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <DashboardSection title={t("analytics.taskStatus")} description={t("analytics.taskStatusDesc")}>
          <TaskStatusBreakdown items={data.taskStatus} />
        </DashboardSection>
        <DashboardSection title={t("analytics.approvals")} description={t("analytics.approvalsDesc")}>
          <ApprovalOutcomes outcomes={data.approvalOutcomes} />
        </DashboardSection>
      </div>

      <DashboardSection title={t("analytics.workflowPerformance")} description={t("analytics.workflowPerformanceDesc")}>
        <WorkflowPerformance rows={data.workflowPerformance} />
      </DashboardSection>

      <DashboardSection title={t("analytics.adoption")} description={t("analytics.adoptionDesc")}>
        <AdoptionList items={data.adoption} />
      </DashboardSection>
    </>
  );
}

function TrendChart({ trend }: { trend: OperationalAnalyticsResponse["trend"] }) {
  const { t } = useTranslation();
  const { formatDate } = useLocaleFormatter();
  const series = [
    { key: "tasksCreated" as const, label: t("analytics.legendTasksCreated"), bar: "fill-primary", dot: "bg-primary" },
    { key: "tasksCompleted" as const, label: t("analytics.legendTasksCompleted"), bar: "fill-success", dot: "bg-success" },
    { key: "documentsCreated" as const, label: t("analytics.legendDocuments"), bar: "fill-info", dot: "bg-info" }
  ];
  const hasData = trend.some((day) => day.tasksCreated + day.tasksCompleted + day.documentsCreated > 0);
  if (trend.length === 0 || !hasData) return <EmptyState icon={BarChart3} title={t("analytics.trendEmpty")} />;

  const max = Math.max(1, ...trend.flatMap((day) => [day.tasksCreated, day.tasksCompleted, day.documentsCreated]));
  const width = 720;
  const height = 220;
  const padX = 4;
  const padTop = 8;
  const padBottom = 6;
  const inner = height - padTop - padBottom;
  const group = (width - padX * 2) / trend.length;
  const barWidth = Math.max((group * 0.72) / series.length, 0.8);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {series.map((item) => <span key={item.key} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", item.dot)} />{item.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-56 w-full" preserveAspectRatio="none" role="img" aria-label={t("analytics.trend")}>
        <line x1={0} x2={width} y1={height - padBottom + 0.5} y2={height - padBottom + 0.5} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {trend.map((day, index) => series.map((item, seriesIndex) => {
          const value = day[item.key];
          if (value === 0) return null;
          const barHeight = Math.max((value / max) * inner, 1);
          const x = padX + index * group + (group - barWidth * series.length) / 2 + seriesIndex * barWidth;
          return (
            <rect key={`${day.date}-${item.key}`} x={x} y={height - padBottom - barHeight} width={Math.max(barWidth - 0.4, 0.4)} height={barHeight} className={item.bar}>
              <title>{`${formatDate(day.date, { day: "numeric", month: "short" })} — ${item.label}: ${value}`}</title>
            </rect>
          );
        }))}
      </svg>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>{formatDate(trend[0]!.date, { day: "numeric", month: "short" })}</span>
        <span>{formatDate(trend[trend.length - 1]!.date, { day: "numeric", month: "short" })}</span>
      </div>
    </div>
  );
}

function TaskStatusBreakdown({ items }: { items: OperationalAnalyticsResponse["taskStatus"] }) {
  const { t } = useTranslation();
  const { formatNumber, formatPercent } = useLocaleFormatter();
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return <EmptyState icon={CheckSquare2} title={t("analytics.taskStatusEmpty")} />;
  return (
    <div className="space-y-4">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-secondary">
        {items.map((item) => item.count > 0 ? <div key={item.status} className={cn("h-full", TASK_STATUS_BAR[item.status])} style={{ width: `${(item.count / total) * 100}%` }} /> : null)}
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.status} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-2 font-medium text-secondary-foreground"><span className={cn("size-2.5 shrink-0 rounded-full", TASK_STATUS_BAR[item.status])} />{t(TASK_STATUS_LABEL_KEYS[item.status])}</span>
            <span className="text-muted-foreground">{formatNumber(item.count)} · {formatPercent(item.count / total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovalOutcomes({ outcomes }: { outcomes: OperationalAnalyticsResponse["approvalOutcomes"] }) {
  const { t } = useTranslation();
  const { formatNumber } = useLocaleFormatter();
  const items = [
    { label: t("analytics.pendingApprovals"), value: outcomes.pending, bar: "bg-warning" },
    { label: t("analytics.approvedApprovals"), value: outcomes.approved, bar: "bg-success" },
    { label: t("analytics.rejectedApprovals"), value: outcomes.rejected, bar: "bg-danger" }
  ];
  const decided = outcomes.approved + outcomes.rejected;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-md border border-border px-3 py-3 text-center">
            <strong className="block text-xl font-semibold tracking-tight text-foreground">{formatNumber(item.value)}</strong>
            <span className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-2 shrink-0 rounded-full", item.bar)} />{item.label}</span>
          </div>
        ))}
      </div>
      {decided > 0 ? (
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-secondary">
          <div className="h-full bg-success" style={{ width: `${(outcomes.approved / decided) * 100}%` }} />
          <div className="h-full bg-danger" style={{ width: `${(outcomes.rejected / decided) * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function WorkflowPerformance({ rows }: { rows: OperationalAnalyticsResponse["workflowPerformance"] }) {
  const { t } = useTranslation();
  const { formatNumber, formatPercent } = useLocaleFormatter();
  const percent = (value: number | null) => value === null ? "—" : formatPercent(value / 100);
  const hours = (value: number | null) => value === null ? "—" : `${formatNumber(value, { maximumFractionDigits: 1 })} ${t("analytics.hoursShort")}`;
  if (rows.length === 0) return <EmptyState icon={GitBranch} title={t("analytics.workflowsEmpty")} />;
  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("analytics.workflowColumn")}</TableHead>
            <TableHead className="text-right">{t("analytics.runs")}</TableHead>
            <TableHead className="text-right">{t("analytics.completed")}</TableHead>
            <TableHead className="text-right">{t("analytics.failed")}</TableHead>
            <TableHead className="text-right">{t("analytics.successRate")}</TableHead>
            <TableHead className="text-right">{t("analytics.avgDuration")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.workflowId}>
              <TableCell className="max-w-48 truncate font-medium text-foreground">{row.workflowName}</TableCell>
              <TableCell className="text-right">{formatNumber(row.runs)}</TableCell>
              <TableCell className="text-right">{formatNumber(row.completed)}</TableCell>
              <TableCell className="text-right">{formatNumber(row.failed)}</TableCell>
              <TableCell className="text-right">{percent(row.successRate)}</TableCell>
              <TableCell className="text-right whitespace-nowrap">{hours(row.avgDurationHours)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function AdoptionList({ items }: { items: OperationalAnalyticsResponse["adoption"] }) {
  const { t, i18n } = useTranslation();
  const { formatNumber } = useLocaleFormatter();
  if (items.length === 0) return <EmptyState icon={BarChart3} title={t("analytics.adoptionEmpty")} />;
  const max = Math.max(...items.map((item) => item.actions), 1);
  const label = (resourceType: string) => {
    const key = `analytics.resourceTypes.${resourceTypeKey(resourceType)}`;
    return i18n.exists(key) ? t(key) : humanize(resourceType);
  };
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.resourceType} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs font-medium text-secondary-foreground sm:w-40">{label(item.resourceType)}</span>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-secondary"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max((item.actions / max) * 100, 3)}%` }} /></div>
          <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{formatNumber(item.actions)}</span>
        </div>
      ))}
    </div>
  );
}
