import { useQueries } from "@tanstack/react-query";
import type { DashboardResponse, DashboardWidgetDto } from "@nexora/contracts";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  CheckSquare2,
  Clock3,
  Database,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Inbox,
  Link2,
  Plus,
  ShieldCheck,
  Upload,
  UsersRound,
  X
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { documentsApi } from "../../lib/api";
import { useLocaleFormatter } from "../../lib/format";
import { Avatar, Badge, Button, EmptyState, Skeleton, Stat, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Timeline } from "../ui";

// --- Shared helpers (used by both the fixed dashboard and custom widgets) ---

export function documentIcon(mimeType?: string) { if (mimeType?.startsWith("image/")) return FileImage; if (mimeType?.includes("spreadsheet") || mimeType?.includes("excel") || mimeType === "text/csv") return FileSpreadsheet; if (mimeType?.includes("zip") || mimeType?.includes("archive")) return FileArchive; return FileText; }
export function fileType(mimeType: string | undefined, name: string) { const extension = name.split(".").pop(); if (extension && extension !== name) return extension; return mimeType?.split("/").pop()?.split(".").pop() ?? "file"; }
export function priorityVariant(priority: string): "neutral" | "warning" | "danger" { if (priority === "URGENT") return "danger"; if (priority === "HIGH") return "warning"; return "neutral"; }
export function activityTone(action: string): "neutral" | "primary" | "success" | "warning" | "danger" { if (action.includes("approved") || action.includes("completed")) return "success"; if (action.includes("rejected") || action.includes("deleted") || action.includes("removed")) return "danger"; if (action.includes("created") || action.includes("uploaded") || action.includes("started")) return "primary"; return "neutral"; }
export function priorityLabel(t: (key: string) => string, priority: string) { if (priority === "LOW") return t("common.low"); if (priority === "NORMAL") return t("common.normal"); if (priority === "HIGH") return t("common.high"); if (priority === "URGENT") return t("common.urgent"); return priority; }
// Audit actions follow the pattern "<resource>[.<sub-resource>].<verb>".
// Verbs are sentence templates containing {{resource}}; resource labels carry
// their own article/preposition per locale (or a leading phrase like " via SSO").
export function actionLabel(t: (key: string) => string, action: string) {
  const segments = action.split(".");
  const verb = segments[segments.length - 1];
  const resource = segments.slice(0, -1).join("_");
  const verbKey = `auditVerbs.${verb}`;
  const verbTemplate = t(verbKey);
  if (verbTemplate === verbKey) return humanizeAction(action);
  const resourceKey = `auditResources.${resource}`;
  const resourceLabel = t(resourceKey);
  const resolvedResource = resourceLabel !== resourceKey ? resourceLabel : resource ? ` ${humanizeAction(resource)}` : "";
  return verbTemplate.replace("{{resource}}", resolvedResource).trim();
}
export function humanizeAction(value: string) { return value.replaceAll(".", " ").replaceAll("_", " "); }
export function isOverdue(value: string | null) { return Boolean(value && new Date(value).getTime() < Date.now()); }
export function formatStatus(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }

export function DashboardSection({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section><header className="mb-5 flex items-start justify-between gap-4"><div><h2 className="nx-h2">{title}</h2><p className="mt-1 text-sm text-secondary-foreground">{description}</p></div>{action}</header>{children}</section>;
}

// --- Widget building blocks ---

export function MetricsGrid({ metrics, compact = false }: { metrics: DashboardResponse["metrics"]; compact?: boolean }) {
  const { t } = useTranslation();
  const { formatBytes } = useLocaleFormatter();
  return (
    <div className={compact ? "grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4" : "grid grid-cols-2 gap-x-4 gap-y-7 border-y border-border py-6 md:grid-cols-4 xl:grid-cols-7"}>
      <Stat label={t("dashboard.documents")} value={metrics.documents} icon={FileText} />
      <Stat label={t("dashboard.users")} value={metrics.users} icon={UsersRound} />
      <Stat label={t("dashboard.teams")} value={metrics.teams} icon={ShieldCheck} />
      <Stat label={t("dashboard.tasks")} value={metrics.pendingTasks} detail={t("dashboard.pendingLabel")} icon={CheckSquare2} />
      <Stat label={t("dashboard.activeWorkflows")} value={metrics.activeProcesses} detail={t("dashboard.activeLabel")} icon={GitBranch} />
      <Stat label={t("dashboard.pendingApprovals")} value={metrics.pendingApprovals} detail={t("dashboard.pendingLabel")} icon={CheckCircle2} />
      <Stat label={t("dashboard.storage")} value={formatBytes(metrics.storageBytes)} icon={Database} />
    </div>
  );
}

export function ActivityTimeline({ activity }: { activity: DashboardResponse["recentActivity"] }) {
  const { t } = useTranslation();
  const { formatDateTime } = useLocaleFormatter();
  if (activity.length === 0) return <EmptyState icon={Clock3} title={t("dashboard.noActivity")} description={t("dashboard.noActivityDesc")} />;
  return (
    <Timeline items={activity.map((item) => ({
      id: item.id,
      title: `${item.actor?.name ?? t("dashboard.system")} ${actionLabel(t, item.action)}`,
      description: item.resourceType,
      time: formatDateTime(item.occurredAt),
      tone: activityTone(item.action)
    }))} />
  );
}

export function PendingTasksList({ tasks, onCreateTask }: { tasks: DashboardResponse["pendingTasks"]; onCreateTask?: () => void }) {
  const { t } = useTranslation();
  const { formatDate } = useLocaleFormatter();
  if (tasks.length === 0) {
    return <EmptyState icon={CheckSquare2} title={t("dashboard.noPendingTasks")} description={t("dashboard.noPendingTasksDesc")} action={onCreateTask ? <Button size="sm" onClick={onCreateTask}><Plus />{t("dashboard.createTask")}</Button> : undefined} />;
  }
  return (
    <div className="divide-y divide-border">
      {tasks.slice(0, 6).map((task) => (
        <Link key={task.id} to={`/tasks/${task.id}`} className="group flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{task.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{task.dueAt ? `${isOverdue(task.dueAt) ? t("dashboard.overduePrefix") : t("dashboard.duePrefix")}${formatDate(task.dueAt)}` : t("dashboard.noDueDate")}</p>
          </div>
          <Badge variant={priorityVariant(task.priority)}>{priorityLabel(t, task.priority)}</Badge>
        </Link>
      ))}
    </div>
  );
}

export function RecentDocuments({ documents, organizationId, onUpload }: { documents: DashboardResponse["recentDocuments"]; organizationId: string; onUpload?: () => void }) {
  const { t } = useTranslation();
  const { formatRelative: relDate } = useLocaleFormatter();
  const details = useQueries({ queries: documents.map((document) => ({ queryKey: ["document", organizationId, document.id], queryFn: () => documentsApi.get(organizationId, document.id), staleTime: 60_000 })) });
  const ownerStates = new Map(documents.map((document, index) => [document.id, { owner: details[index]?.data?.document.owner, pending: details[index]?.isPending }]));

  if (documents.length === 0) {
    return <EmptyState icon={FileText} title={t("dashboard.noDocuments")} description={t("dashboard.noDocumentsDesc")} action={onUpload ? <Button size="sm" onClick={onUpload}><Upload />{t("dashboard.addDocument")}</Button> : undefined} />;
  }
  return (
    <TableContainer>
      <Table>
        <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("common.type")}</TableHead><TableHead className="hidden md:table-cell">{t("common.owner")}</TableHead><TableHead>{t("dashboard.modified")}</TableHead><TableHead className="hidden sm:table-cell text-right">{t("common.version")}</TableHead></TableRow></TableHeader>
        <TableBody>
          {documents.map((document) => {
            const ownerState = ownerStates.get(document.id);
            const owner = ownerState?.owner;
            const Icon = documentIcon(document.latestVersion?.mimeType);
            return (
              <TableRow key={document.id} className="group">
                <TableCell><Link to={`/documents/${document.id}`} className="nx-focus-ring flex min-w-0 items-center gap-3 rounded-sm"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary-subtle-foreground"><Icon className="size-4" /></span><span className="min-w-0"><span className="block truncate font-medium text-foreground group-hover:text-primary">{document.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{document.folderName ?? t("navigation.documents")}</span></span></Link></TableCell>
                <TableCell className="text-xs uppercase text-muted-foreground">{fileType(document.latestVersion?.mimeType, document.name)}</TableCell>
                <TableCell className="hidden md:table-cell">{owner ? <span className="flex items-center gap-2"><Avatar name={owner.name} src={owner.avatar} size="sm" /><span className="truncate">{owner.name}</span></span> : ownerState?.pending ? <Skeleton className="h-7 w-28" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{relDate(document.updatedAt)}</TableCell>
                <TableCell className="hidden sm:table-cell text-right">{document.latestVersion ? <Badge variant="outline">v{document.latestVersion.version}</Badge> : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function TaskDistribution({ groups }: { groups: DashboardResponse["taskDistribution"] }) {
  const { t } = useTranslation();
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  if (total === 0) return <EmptyState icon={Inbox} title={t("dashboard.noTasksToAnalyze")} description={t("dashboard.noTasksToAnalyzeDesc")} />;
  return <div className="space-y-4">{groups.map((group) => <div key={group.status}><div className="mb-1.5 flex justify-between gap-4 text-xs"><span className="font-medium text-secondary-foreground">{formatStatus(group.status)}</span><span className="text-muted-foreground">{group.count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-surface-secondary"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max((group.count / total) * 100, 3)}%` }} /></div></div>)}</div>;
}

export function NotificationsList({ notifications }: { notifications: DashboardResponse["notifications"] }) {
  const { t } = useTranslation();
  const { formatRelative } = useLocaleFormatter();
  if (notifications.length === 0) return <EmptyState icon={Bell} title={t("notifications.empty")} description={t("notifications.noNotificationsDesc")} />;
  return (
    <div className="divide-y divide-border">
      {notifications.map((notification) => (
        <div key={notification.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${notification.readAt ? "bg-surface-secondary text-muted-foreground" : "bg-primary-subtle text-primary"}`}><Bell className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{notification.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(notification.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

export function QuickLinksList({ links }: { links: Array<{ label?: string; href?: string }> }) {
  const { t } = useTranslation();
  const defaults = [
    { label: t("navigation.documents"), href: "/documents" },
    { label: t("navigation.tasks"), href: "/tasks" },
    { label: t("navigation.workflows"), href: "/workflows" },
    { label: t("navigation.approvals"), href: "/approvals" }
  ];
  const items = links.length ? links : defaults;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((link, index) => (
        <Link key={index} to={link.href ?? "#"} className="group flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:border-border-strong hover:bg-surface-secondary hover:text-foreground">
          <Link2 className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
          <span className="min-w-0 flex-1 truncate">{link.label ?? link.href}</span>
          <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      ))}
    </div>
  );
}

// --- Custom dashboard widget renderer ---

export function widgetTitle(t: (key: string) => string, type: string): string {
  const keys: Record<string, string> = {
    metrics: "dashboard.widgets.metrics",
    recentDocuments: "dashboard.widgets.recentDocuments",
    pendingTasks: "dashboard.widgets.pendingTasks",
    notifications: "dashboard.widgets.notifications",
    recentActivity: "dashboard.widgets.recentActivity",
    taskDistribution: "dashboard.widgets.taskDistribution",
    quickLinks: "dashboard.widgets.quickLinks"
  };
  return keys[type] ? t(keys[type]!) : type;
}

export function DashboardWidgetCard({ widget, organizationId, editing, onRemove }: { widget: DashboardWidgetDto & { data: unknown }; organizationId: string; editing?: boolean; onRemove?: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <header className="mb-4 flex items-start justify-between gap-3">
        <h3 className="nx-h3">{widgetTitle(t, widget.type)}</h3>
        {editing ? (
          <Button variant="ghost" size="icon-sm" aria-label={t("dashboard.removeWidget")} title={t("dashboard.removeWidget")} onClick={onRemove}>
            <X />
          </Button>
        ) : null}
      </header>
      <WidgetBody widget={widget} organizationId={organizationId} />
    </section>
  );
}

function WidgetBody({ widget, organizationId }: { widget: DashboardWidgetDto & { data: unknown }; organizationId: string }) {
  switch (widget.type) {
    case "metrics":
      return <MetricsGrid metrics={widget.data as DashboardResponse["metrics"]} compact />;
    case "recentDocuments":
      return <RecentDocuments documents={(widget.data ?? []) as DashboardResponse["recentDocuments"]} organizationId={organizationId} />;
    case "pendingTasks":
      return <PendingTasksList tasks={(widget.data ?? []) as DashboardResponse["pendingTasks"]} />;
    case "notifications":
      return <NotificationsList notifications={(widget.data ?? []) as DashboardResponse["notifications"]} />;
    case "recentActivity":
      return <ActivityTimeline activity={(widget.data ?? []) as DashboardResponse["recentActivity"]} />;
    case "taskDistribution":
      return <TaskDistribution groups={(widget.data ?? []) as DashboardResponse["taskDistribution"]} />;
    case "quickLinks": {
      const data = (widget.data ?? {}) as { links?: Array<{ label?: string; href?: string }> };
      return <QuickLinksList links={Array.isArray(data.links) ? data.links : []} />;
    }
    default:
      return null;
  }
}
