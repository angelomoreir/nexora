import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationDto, TaskPriority, TaskStatus, TaskSummaryDto } from "@nexora/contracts";
import { AlarmClock, Bell, CalendarDays, CheckCircle2, CheckSquare, FileText, GitBranch, Play, RefreshCw, Search } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Card, EmptyState, Page, PageHeader, PageSection, Skeleton, useToast } from "../components/ui";
import { approvalsApi, notificationsApi, tasksApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";
import { cn } from "../lib/utils";

const PRIORITY_RANK: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const PRIORITY_VARIANT: Record<TaskPriority, "neutral" | "info" | "warning" | "danger"> = { LOW: "neutral", NORMAL: "info", HIGH: "warning", URGENT: "danger" };
const STATUS_LABEL_KEYS: Record<TaskStatus, string> = { TODO: "common.todo", IN_PROGRESS: "common.inProgress", IN_REVIEW: "tasks.inReview", DONE: "tasks.completed", CANCELLED: "common.cancelled" };
const PRIORITY_LABEL_KEYS: Record<TaskPriority, string> = { LOW: "common.low", NORMAL: "common.normal", HIGH: "common.high", URGENT: "common.urgent" };

export function categorizeMyDayTasks(tasks: TaskSummaryDto[], now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const active = tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELLED");
  return {
    overdue: active.filter((task) => task.dueAt && new Date(task.dueAt) < start),
    today: active.filter((task) => task.dueAt && new Date(task.dueAt) >= start && new Date(task.dueAt) < end),
    upcoming: active.filter((task) => task.dueAt && new Date(task.dueAt) >= end),
    unscheduled: active.filter((task) => !task.dueAt)
  };
}

function sortTasks(tasks: TaskSummaryDto[]): TaskSummaryDto[] {
  return [...tasks].sort((a, b) => {
    const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rank !== 0) return rank;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });
}

function notificationIcon(type: string) {
  if (type.startsWith("task.")) return CheckSquare;
  if (type.startsWith("document.")) return FileText;
  if (type.startsWith("workflow.")) return GitBranch;
  return Bell;
}

function notificationTarget(notification: NotificationDto): string {
  const data = notification.data ?? {};
  if (typeof data.documentId === "string" && data.documentId) return `/documents/${data.documentId}`;
  if (typeof data.taskId === "string" && data.taskId) return `/tasks/${data.taskId}`;
  if ((typeof data.approvalId === "string" && data.approvalId) || notification.type.startsWith("workflow.approval")) return "/approvals";
  return "/notifications";
}

export function MyDayPage() {
  const { t } = useTranslation();
  const { session, organization } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatDate, formatDateTime, formatRelative } = useLocaleFormatter();

  const taskQuery = useQuery({
    queryKey: ["my-day", "tasks", organization.id],
    queryFn: () => tasksApi.list(organization.id, { scope: "mine", sort: "dueAt", order: "asc" })
  });
  const approvalsQuery = useQuery({
    queryKey: ["my-day", "approvals", organization.id],
    queryFn: () => approvalsApi.list(organization.id, { status: "PENDING", scope: "mine" })
  });
  const notificationsQuery = useQuery({
    queryKey: ["my-day", "notifications", organization.id],
    queryFn: () => notificationsApi.list(organization.id, { unreadOnly: true })
  });

  const updateStatus = useMutation({
    mutationFn: ({ task, status }: { task: TaskSummaryDto; status: TaskStatus }) => tasksApi.update(organization.id, task.id, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-day", "tasks", organization.id] });
      await queryClient.invalidateQueries({ queryKey: ["tasks", organization.id] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", organization.id] });
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("common.errorSaving"), description: apiErrorText(error, t) })
  });

  const markRead = useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markAsRead(organization.id, notificationId),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-day", "notifications", organization.id] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", organization.id] });
    }
  });

  const tasks = taskQuery.data?.tasks;
  const buckets = useMemo(() => categorizeMyDayTasks(tasks ?? []), [tasks]);
  const focusTasks = useMemo(() => [...sortTasks(buckets.overdue), ...sortTasks(buckets.today)], [buckets]);
  const upcomingTasks = useMemo(() => {
    const dated = sortTasks(buckets.upcoming).slice(0, 6);
    if (dated.length < 6) dated.push(...sortTasks(buckets.unscheduled).slice(0, 6 - dated.length));
    return dated;
  }, [buckets]);
  const pendingApprovals = approvalsQuery.data?.approvals.slice(0, 4) ?? [];
  const unreadNotifications = notificationsQuery.data?.notifications.slice(0, 5) ?? [];

  const loading = taskQuery.isPending || approvalsQuery.isPending || notificationsQuery.isPending;
  const failed = taskQuery.isError || approvalsQuery.isError || notificationsQuery.isError;
  const refreshing = taskQuery.isFetching || approvalsQuery.isFetching || notificationsQuery.isFetching;
  const canManageTasks = organization.permissions.includes("tasks.manage");

  const refreshAll = () => {
    void taskQuery.refetch();
    void approvalsQuery.refetch();
    void notificationsQuery.refetch();
  };

  const openNotification = (notification: NotificationDto) => {
    if (!notification.readAt) markRead.mutate(notification.id);
    void navigate(notificationTarget(notification));
  };

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? "myDay.greetingMorning" : hour < 20 ? "myDay.greetingAfternoon" : "myDay.greetingEvening";
  const firstName = session.user.name.trim().split(/\s+/)[0] ?? session.user.name;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const summaryCards = [
    { label: t("myDay.dueToday"), value: buckets.today.length, icon: CalendarDays, danger: false },
    { label: t("myDay.overdue"), value: buckets.overdue.length, icon: AlarmClock, danger: buckets.overdue.length > 0 },
    { label: t("myDay.pendingApprovals"), value: approvalsQuery.data?.total ?? 0, icon: CheckCircle2, danger: false },
    { label: t("myDay.unreadNotifications"), value: notificationsQuery.data?.unreadCount ?? 0, icon: Bell, danger: false }
  ];

  const renderTaskRow = (task: TaskSummaryDto) => {
    const overdue = Boolean(task.dueAt && new Date(task.dueAt) < todayStart);
    const nextStatus: TaskStatus = task.status === "TODO" ? "IN_PROGRESS" : "DONE";
    return (
      <div key={task.id} className="flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-surface-secondary">
        <button type="button" className="nx-focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left" onClick={() => void navigate(`/tasks/${task.id}`)}>
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", overdue ? "bg-danger-subtle text-danger" : "bg-surface-secondary text-muted-foreground")}><CheckSquare className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{task.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className={overdue ? "font-medium text-danger" : undefined}>{task.dueAt ? (buckets.today.includes(task) ? t("myDay.dueTodayLabel") : formatDate(task.dueAt)) : t("myDay.noDueDate")}</span>
              <span>{t(STATUS_LABEL_KEYS[task.status])}</span>
              {task.project ? <span className="truncate">{task.project.name}</span> : null}
            </span>
          </span>
          <Badge variant={PRIORITY_VARIANT[task.priority]}>{t(PRIORITY_LABEL_KEYS[task.priority])}</Badge>
        </button>
        {canManageTasks ? (
          <Button variant="outline" size="sm" loading={updateStatus.isPending && updateStatus.variables?.task.id === task.id} onClick={() => updateStatus.mutate({ task, status: nextStatus })}>
            {nextStatus === "IN_PROGRESS" ? <Play /> : <CheckCircle2 />}
            {nextStatus === "IN_PROGRESS" ? t("myDay.startTask") : t("myDay.completeTask")}
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <Page>
      <PageHeader
        eyebrow={organization.name}
        title={t(greetingKey, { name: firstName })}
        description={t("myDay.dateIntro", { date: formatDate(new Date(), { dateStyle: "full" }) })}
        actions={
          <>
            <Button variant="ghost" size="sm" loading={refreshing && !loading} onClick={refreshAll}><RefreshCw />{t("myDay.refresh")}</Button>
            <Button variant="outline" onClick={() => void navigate("/search")}><Search />{t("navigation.search")}</Button>
            <Button onClick={() => void navigate("/tasks")}><CheckSquare />{t("navigation.tasks")}</Button>
          </>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
            <div className="space-y-6"><Skeleton className="h-72 w-full" /><Skeleton className="h-56 w-full" /></div>
            <div className="space-y-6"><Skeleton className="h-56 w-full" /><Skeleton className="h-56 w-full" /></div>
          </div>
        </div>
      ) : (
        <>
          {failed ? (
            <Alert variant="danger" title={t("myDay.loadingError")}>
              <p>{t("myDay.loadingErrorDesc")}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={refreshAll}>{t("common.retry")}</Button>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <Card key={card.label} className={cn("flex items-center gap-3 px-4 py-3.5", card.danger && "border-danger/30")}>
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", card.danger ? "bg-danger-subtle text-danger" : "bg-surface-secondary text-muted-foreground")}><card.icon className="size-4" /></span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</span>
                  <span className={cn("block text-xl font-semibold tracking-tight", card.danger ? "text-danger" : "text-foreground")}>{card.value}</span>
                </span>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
            <div className="min-w-0 space-y-6">
              <PageSection title={t("myDay.focusTitle")} description={t("myDay.focusDescription")} contentClassName="p-2">
                {focusTasks.length ? (
                  <div className="space-y-1">{focusTasks.map(renderTaskRow)}</div>
                ) : (
                  <EmptyState icon={CheckCircle2} title={t("myDay.noFocusTitle")} description={t("myDay.noFocusDescription")} className="min-h-32 py-8" />
                )}
              </PageSection>

              <PageSection title={t("myDay.upcomingTitle")} description={t("myDay.upcomingDescription")} contentClassName="p-2" actions={<Button variant="ghost" size="sm" onClick={() => void navigate("/tasks")}>{t("myDay.viewAll")}</Button>}>
                {upcomingTasks.length ? (
                  <div className="space-y-1">{upcomingTasks.map(renderTaskRow)}</div>
                ) : (
                  <EmptyState icon={CalendarDays} title={t("myDay.noUpcoming")} className="min-h-32 py-8" />
                )}
              </PageSection>
            </div>

            <div className="min-w-0 space-y-6">
              <PageSection title={t("myDay.approvalsTitle")} description={t("myDay.approvalsDescription")} contentClassName="p-2" actions={<Button variant="ghost" size="sm" onClick={() => void navigate("/approvals")}>{t("myDay.viewAll")}</Button>}>
                {pendingApprovals.length ? (
                  <div className="space-y-1">
                    {pendingApprovals.map((approval) => (
                      <button key={approval.id} type="button" className="nx-focus-ring flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-surface-secondary" onClick={() => void navigate("/approvals")}>
                        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-warning-subtle text-warning"><GitBranch className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{approval.workflowName}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{t("approvals.stepOrder", { order: approval.stepOrder })} · {formatDateTime(approval.createdAt)}</span>
                        </span>
                        <Badge variant="warning">{t("approvals.statusPending")}</Badge>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={CheckCircle2} title={t("myDay.noApprovals")} className="min-h-32 py-8" />
                )}
              </PageSection>

              <PageSection title={t("myDay.notificationsTitle")} description={t("myDay.notificationsDescription")} contentClassName="p-2" actions={<Button variant="ghost" size="sm" onClick={() => void navigate("/notifications")}>{t("myDay.viewAll")}</Button>}>
                {unreadNotifications.length ? (
                  <div className="space-y-1">
                    {unreadNotifications.map((notification) => {
                      const Icon = notificationIcon(notification.type);
                      return (
                        <button key={notification.id} type="button" className="nx-focus-ring flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-surface-secondary" onClick={() => openNotification(notification)}>
                          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary"><Icon className="size-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{notification.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{formatRelative(notification.createdAt)}</span>
                          </span>
                          <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={Bell} title={t("myDay.noNotifications")} className="min-h-32 py-8" />
                )}
              </PageSection>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
