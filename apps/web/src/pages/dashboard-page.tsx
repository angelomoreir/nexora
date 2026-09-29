import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardWidgetType, TaskPriority } from "@nexora/contracts";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarCheck2,
  CheckCircle2,
  CheckSquare2,
  GitBranch,
  LayoutDashboard,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { useWorkspace } from "../components/layout/app-layout";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  useConfirm,
  useToast
} from "../components/ui";
import {
  ActivityTimeline,
  DashboardSection,
  DashboardWidgetCard,
  MetricsGrid,
  PendingTasksList,
  RecentDocuments,
  TaskDistribution,
  isOverdue,
  priorityLabel,
  widgetTitle
} from "../components/dashboard/widgets";
import { OnboardingChecklist } from "../components/dashboard/onboarding-checklist";
import { getDashboardRecommendation } from "../components/dashboard/intelligence";
import { announcementsApi, approvalsApi, dashboardApi, dashboardsApi, documentsApi, notificationsApi, tasksApi, workflowsApi, type TaskInput } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

const WIDGET_TYPES: DashboardWidgetType[] = ["metrics", "recentDocuments", "pendingTasks", "notifications", "recentActivity", "taskDistribution", "quickLinks"];
const DEFAULT_DASHBOARD_VALUE = "__default__";

export function DashboardPage() {
  const { t } = useTranslation();
  const { session, organization } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [taskDialog, setTaskDialog] = useState(false);
  const [workflowDialog, setWorkflowDialog] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(() => localStorage.getItem("nexora.dashboard.id"));
  const [dashboardDialog, setDashboardDialog] = useState<{ mode: "create" } | { mode: "rename"; id: string } | null>(null);
  const [dashboardName, setDashboardName] = useState("");
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);

  const dashboard = useQuery({
    queryKey: ["dashboard", organization.id],
    queryFn: () => dashboardApi.get(organization.id)
  });
  const dashboardsQuery = useQuery({
    queryKey: ["dashboards", organization.id],
    queryFn: () => dashboardsApi.list(organization.id)
  });
  const dashboards = dashboardsQuery.data?.dashboards ?? [];
  const selectedDashboard = selectedDashboardId === DEFAULT_DASHBOARD_VALUE ? null : dashboards.find((item) => item.id === selectedDashboardId) ?? dashboards[0] ?? null;

  const rendered = useQuery({
    queryKey: ["dashboard-render", organization.id, selectedDashboard?.id],
    queryFn: () => dashboardsApi.render(organization.id, selectedDashboard!.id),
    enabled: Boolean(selectedDashboard)
  });

  const canUploadDocuments = organization.permissions.includes("documents.edit");
  const canManageTasks = organization.permissions.includes("tasks.manage");
  const canManageWorkflows = organization.permissions.includes("workflows.manage");
  const personalApprovals = useQuery({
    queryKey: ["dashboard", "personal-approvals", organization.id],
    queryFn: () => approvalsApi.list(organization.id, { status: "PENDING", scope: "mine" }),
    enabled: organization.permissions.includes("approvals.view")
  });
  const personalUnread = useQuery({
    queryKey: ["notifications-unread-count", organization.id],
    queryFn: () => notificationsApi.unreadCount(organization.id),
    enabled: organization.permissions.includes("notifications.view")
  });

  useEffect(() => {
    if (selectedDashboard) localStorage.setItem("nexora.dashboard.id", selectedDashboard.id);
    else if (selectedDashboardId === DEFAULT_DASHBOARD_VALUE) localStorage.setItem("nexora.dashboard.id", DEFAULT_DASHBOARD_VALUE);
  }, [selectedDashboard, selectedDashboardId]);

  const refreshDashboard = () => queryClient.invalidateQueries({ queryKey: ["dashboard", organization.id] });
  const refreshDashboardData = () => {
    void dashboard.refetch();
    if (organization.permissions.includes("approvals.view")) void personalApprovals.refetch();
    if (organization.permissions.includes("notifications.view")) void personalUnread.refetch();
  };
  const invalidateDashboards = async () => {
    await queryClient.invalidateQueries({ queryKey: ["dashboards", organization.id] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-render", organization.id] });
  };
  const dashboardError = (error: Error) => toast({ tone: "danger", title: t("dashboard.errorSavingDashboard"), description: apiErrorText(error, t) });

  const saveDashboard = useMutation({
    mutationFn: () => dashboardDialog?.mode === "rename"
      ? dashboardsApi.update(organization.id, dashboardDialog.id, { name: dashboardName.trim() })
      : dashboardsApi.create(organization.id, { name: dashboardName.trim() }),
    onSuccess: async (saved) => {
      setDashboardDialog(null);
      setSelectedDashboardId(saved.id);
      await invalidateDashboards();
      toast({ tone: "success", title: t("dashboard.dashboardSaved") });
    },
    onError: dashboardError
  });
  const deleteDashboardMutation = useMutation({
    mutationFn: (dashboardId: string) => dashboardsApi.remove(organization.id, dashboardId),
    onSuccess: async (_result, dashboardId) => {
      if (selectedDashboardId === dashboardId) setSelectedDashboardId(null);
      await invalidateDashboards();
      toast({ tone: "success", title: t("dashboard.dashboardDeleted") });
    },
    onError: dashboardError
  });
  const addWidgetMutation = useMutation({
    mutationFn: (type: DashboardWidgetType) => dashboardsApi.addWidget(organization.id, selectedDashboard!.id, { type }),
    onSuccess: async () => {
      setAddWidgetOpen(false);
      await invalidateDashboards();
      toast({ tone: "success", title: t("dashboard.widgetAdded") });
    },
    onError: dashboardError
  });
  const removeWidgetMutation = useMutation({
    mutationFn: (widgetId: string) => dashboardsApi.removeWidget(organization.id, selectedDashboard!.id, widgetId),
    onSuccess: async () => {
      await invalidateDashboards();
      toast({ tone: "success", title: t("dashboard.widgetRemoved") });
    },
    onError: dashboardError
  });

  const upload = useMutation({
    mutationFn: (file: File) => documentsApi.upload(organization.id, file, null),
    onSuccess: async (result) => {
      await refreshDashboard();
      toast({ tone: "success", title: t("dashboard.documentAdded"), description: result.document.name });
      navigate(`/documents/${result.document.id}`);
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("dashboard.errorAddingDocument"), description: apiErrorText(error, t) })
  });

  const createTask = useMutation({
    mutationFn: (input: TaskInput) => tasksApi.create(organization.id, input),
    onSuccess: async (task) => {
      setTaskDialog(false);
      await refreshDashboard();
      toast({ tone: "success", title: t("dashboard.taskCreatedDesc"), description: task.title });
      navigate(`/tasks/${task.id}`);
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("dashboard.errorCreatingTask"), description: apiErrorText(error, t) })
  });

  const createWorkflow = useMutation({
    mutationFn: (input: { name: string; description?: string }) => workflowsApi.create(organization.id, {
      name: input.name,
      description: input.description,
      steps: [
        { order: 0, type: "START", name: t("dashboard.startStep"), config: {} },
        { order: 1, type: "END", name: t("dashboard.endStep"), config: {} }
      ]
    }),
    onSuccess: async (workflow) => {
      setWorkflowDialog(false);
      await refreshDashboard();
      toast({ tone: "success", title: t("dashboard.workflowCreated"), description: t("dashboard.workflowCreatedDesc") });
      navigate(`/workflows/${workflow.id}/builder`);
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("dashboard.errorCreatingWorkflow"), description: apiErrorText(error, t) })
  });

  function submitDashboardName(event: FormEvent) {
    event.preventDefault();
    if (dashboardName.trim()) saveDashboard.mutate();
  }

  if (dashboard.isPending) return <DashboardSkeleton />;
  if (dashboard.isError) {
    return <Alert variant="danger" title={t("dashboard.errorLoadingDashboard")} className="mx-auto max-w-3xl"><p>{apiErrorText(dashboard.error, t)}</p><Button className="mt-4" size="sm" onClick={() => void dashboard.refetch()}><RefreshCw />{t("common.retry")}</Button></Alert>;
  }

  const data = dashboard.data;
  const firstName = session.user.name.trim().split(/\s+/)[0] ?? session.user.name;
  const unreadNotifications = data.notifications.filter((notification) => !notification.readAt).length;
  const urgentTasks = data.pendingTasks.filter((task) => task.priority === "URGENT" || task.priority === "HIGH" || isOverdue(task.dueAt));
  const personalApprovalsCount = !organization.permissions.includes("approvals.view") ? 0 : personalApprovals.isPending ? null : (personalApprovals.data?.total ?? 0);
  const personalUnreadCount = !organization.permissions.includes("notifications.view") ? 0 : personalUnread.isPending ? null : (personalUnread.data?.unreadCount ?? 0);
  const recommendation = getDashboardRecommendation({
    urgentTasks: urgentTasks.length,
    pendingApprovals: personalApprovalsCount ?? 0,
    unreadNotifications: personalUnreadCount ?? 0,
    metrics: data.metrics,
    permissions: organization.permissions
  });
  const recommendationCount = recommendation === "urgentTasks" ? urgentTasks.length : recommendation === "approvals" ? (personalApprovalsCount ?? 0) : recommendation === "notifications" ? (personalUnreadCount ?? 0) : 0;
  const smartLoading = (organization.permissions.includes("approvals.view") && personalApprovals.isPending)
    || (organization.permissions.includes("notifications.view") && personalUnread.isPending);
  const hasUnreadNotifications = personalUnreadCount === null ? unreadNotifications > 0 : personalUnreadCount > 0;
  const runRecommendationAction = () => {
    if (recommendation === "document") fileInput.current?.click();
    else if (recommendation === "workflow") setWorkflowDialog(true);
    else navigate(recommendation === "approvals" ? "/approvals" : recommendation === "notifications" ? "/notifications" : recommendation === "invite" ? "/admin/users" : "/my-day");
  };

  return (
    <div className="mx-auto max-w-[90rem] space-y-10">
      <header className="flex flex-col gap-6 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="nx-label mb-2 text-primary">{organization.name}</p>
          <h1 className="nx-h1">{greeting(t)}, {firstName}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-foreground">{t("dashboard.organizationStatus")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ContextualHelpButton route="/dashboard" showLabel />
          {!selectedDashboard ? (
            dashboards.length > 0 ? (
              <Select className="w-56" aria-label={t("dashboard.selectDashboard")} value={DEFAULT_DASHBOARD_VALUE} onChange={(event) => setSelectedDashboardId(event.target.value)}>
                <option value={DEFAULT_DASHBOARD_VALUE}>{t("dashboard.defaultDashboard")}</option>
                {dashboards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            ) : (
              <Button variant="outline" onClick={() => { setDashboardName(""); setDashboardDialog({ mode: "create" }); }}><LayoutDashboard />{t("dashboard.customize")}</Button>
            )
          ) : null}
          <Button variant="outline" onClick={() => navigate("/search")}><Search />{t("common.search")}</Button>
          <Button variant="ghost" size="icon" className="relative" aria-label={t("navigation.notifications")} title={t("navigation.notifications")} onClick={() => navigate("/notifications")}><Bell />{hasUnreadNotifications ? <span className="absolute right-1 top-1 size-2 rounded-full bg-danger" /> : null}</Button>
          <Button variant="ghost" className="pl-2" onClick={() => navigate("/profile")}><Avatar name={session.user.name} src={session.user.avatar} size="sm" /><span className="hidden sm:inline">{t("common.profile")}</span></Button>
        </div>
      </header>

      <section aria-labelledby="quick-actions-title">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div><h2 id="quick-actions-title" className="nx-h3">{t("dashboard.quickActions")}</h2><p className="mt-0.5 text-sm text-muted-foreground">{t("dashboard.quickActionsDesc")}</p></div>
          <Button variant="ghost" size="sm" loading={dashboard.isFetching || personalApprovals.isFetching || personalUnread.isFetching} onClick={refreshDashboardData}><RefreshCw />{t("dashboard.refresh")}</Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="secondary" onClick={() => navigate("/my-day")}><CalendarCheck2 />{t("dashboard.openMyDay")}</Button>
          {canUploadDocuments ? <Button onClick={() => fileInput.current?.click()} loading={upload.isPending}><Upload />{t("dashboard.addDocument")}</Button> : null}
          {canManageTasks ? <Button variant="secondary" onClick={() => setTaskDialog(true)}><CheckSquare2 />{t("dashboard.createTask")}</Button> : null}
          {canManageWorkflows ? <Button variant="secondary" onClick={() => setWorkflowDialog(true)}><GitBranch />{t("dashboard.createWorkflow")}</Button> : null}
          <input ref={fileInput} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }} />
        </div>
      </section>

      <OnboardingChecklist
        organizationId={organization.id}
        userId={session.user.id}
        roles={organization.roles}
        permissions={organization.permissions}
        metrics={data.metrics}
        onUploadDocument={() => fileInput.current?.click()}
      />

      <AnnouncementsFeed organizationId={organization.id} />

      {selectedDashboard ? (
        <section aria-labelledby="custom-dashboard-title" className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
            <h2 id="custom-dashboard-title" className="nx-h3 mr-auto">{selectedDashboard.name}</h2>
            {customizing ? (
              <>
                <Select className="w-56" aria-label={t("dashboard.selectDashboard")} value={selectedDashboard.id} onChange={(event) => setSelectedDashboardId(event.target.value)}>
                  <option value={DEFAULT_DASHBOARD_VALUE}>{t("dashboard.defaultDashboard")}</option>
                  {dashboards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                <Button variant="outline" size="sm" onClick={() => { setDashboardName(""); setDashboardDialog({ mode: "create" }); }}><Plus />{t("dashboard.newDashboard")}</Button>
                <Button variant="outline" size="sm" onClick={() => { setDashboardName(selectedDashboard.name); setDashboardDialog({ mode: "rename", id: selectedDashboard.id }); }}><Pencil />{t("common.rename")}</Button>
                <Button variant="outline" size="sm" className="text-danger hover:bg-danger-subtle hover:text-danger" onClick={async () => { if (await confirm(t("dashboard.deleteDashboardConfirm", { name: selectedDashboard.name }))) deleteDashboardMutation.mutate(selectedDashboard.id); }}><Trash2 />{t("common.delete")}</Button>
                <Button variant="secondary" size="sm" onClick={() => setAddWidgetOpen(true)}><Plus />{t("dashboard.addWidget")}</Button>
                <Button size="sm" onClick={() => setCustomizing(false)}>{t("common.done")}</Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}><LayoutDashboard />{t("dashboard.customize")}</Button>
            )}
          </div>

          {rendered.isPending ? (
            <div className="grid gap-6 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-64" />)}</div>
          ) : null}
          {rendered.isError ? (
            <Alert variant="danger" title={t("dashboard.errorLoadingDashboard")}>
              <p>{apiErrorText(rendered.error, t)}</p>
              <Button className="mt-4" size="sm" onClick={() => void rendered.refetch()}><RefreshCw />{t("common.retry")}</Button>
            </Alert>
          ) : null}
          {rendered.data ? (
            rendered.data.widgets.length === 0 ? (
              <EmptyState icon={LayoutDashboard} title={t("dashboard.widgetsEmpty")} description={t("dashboard.widgetsEmptyDesc")} action={<Button size="sm" onClick={() => { setCustomizing(true); setAddWidgetOpen(true); }}><Plus />{t("dashboard.addWidget")}</Button>} />
            ) : (
              <div className="grid items-start gap-6 md:grid-cols-2">
                {rendered.data.widgets.map((widget) => (
                  <DashboardWidgetCard key={widget.id} widget={widget} organizationId={organization.id} editing={customizing} onRemove={() => removeWidgetMutation.mutate(widget.id)} />
                ))}
              </div>
            )
          ) : null}
        </section>
      ) : (
        <>
          <section aria-labelledby="summary-title">
            <div className="mb-4"><h2 id="summary-title" className="nx-h3">{t("dashboard.summary")}</h2><p className="mt-0.5 text-sm text-muted-foreground">{t("dashboard.summaryDesc")}</p></div>
            <MetricsGrid metrics={data.metrics} />
          </section>

          <section className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.75fr)]">
            <DashboardSection title={t("dashboard.recentActivity")} description={t("dashboard.recentActivityDesc")} action={organization.permissions.includes("audit.view") ? <Link className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover" to="/admin/audit">{t("dashboard.viewAudit")}<ArrowRight className="size-3.5" /></Link> : undefined}>
              <ActivityTimeline activity={data.recentActivity} />
            </DashboardSection>

            <aside className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <div className="mb-4"><p className="nx-label text-primary">{t("common.priority")}</p><h2 className="nx-h2 mt-1">{t("dashboard.smartBriefing")}</h2><p className="mt-1 text-sm text-secondary-foreground">{t("dashboard.smartBriefingDesc")}</p></div>
              <div className="divide-y divide-border">
                <AttentionItem icon={CheckCircle2} label={t("dashboard.personalApprovals")} value={personalApprovalsCount} href="/approvals" urgent={(personalApprovalsCount ?? 0) > 0} />
                <AttentionItem icon={AlertCircle} label={t("dashboard.urgentTasks")} value={urgentTasks.length} href="/my-day" urgent={urgentTasks.length > 0} />
                <AttentionItem icon={Bell} label={t("dashboard.unreadUpdates")} value={personalUnreadCount} href="/notifications" urgent={(personalUnreadCount ?? 0) > 0} />
              </div>
              <div className="mt-5 rounded-md bg-primary-subtle p-4">
                <p className="nx-label text-primary">{t("dashboard.recommendedAction")}</p>
                {smartLoading ? (
                  <div className="mt-1.5 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-56 max-w-full" /><Skeleton className="h-8 w-32" /></div>
                ) : (
                  <>
                    <p className="mt-1.5 text-sm font-semibold text-foreground">{t(`dashboard.recommendations.${recommendation}.title`)}</p>
                    <p className="mt-1 text-sm leading-6 text-secondary-foreground">{t(`dashboard.recommendations.${recommendation}.description`, { count: recommendationCount })}</p>
                    <Button className="mt-3" size="sm" onClick={runRecommendationAction}>{t(`dashboard.recommendations.${recommendation}.action`)}</Button>
                  </>
                )}
              </div>
              {personalApprovals.isError || personalUnread.isError ? <p className="mt-4 text-xs text-muted-foreground">{t("dashboard.smartDataUnavailable")}</p> : null}
              {urgentTasks.length > 0 ? <div className="mt-5 space-y-1.5">{urgentTasks.slice(0, 3).map((task) => <Link key={task.id} to={`/tasks/${task.id}`} className="group flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-secondary"><span className="min-w-0 truncate text-secondary-foreground group-hover:text-foreground">{task.title}</span><Badge variant={task.priority === "URGENT" ? "danger" : "warning"}>{priorityLabel(t, task.priority)}</Badge></Link>)}</div> : null}
            </aside>
          </section>

          <DashboardSection title={t("dashboard.recentDocuments")} description={t("dashboard.recentDocumentsDesc")} action={<Link className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover" to="/documents">{t("dashboard.viewDocuments")}<ArrowRight className="size-3.5" /></Link>}>
            <RecentDocuments documents={data.recentDocuments} organizationId={organization.id} onUpload={canUploadDocuments ? () => fileInput.current?.click() : undefined} />
          </DashboardSection>

          <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
            <DashboardSection title={t("dashboard.relevantTasks")} description={t("dashboard.relevantTasksDesc")} action={<Link className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover" to="/tasks">{t("dashboard.viewTasks")}<ArrowRight className="size-3.5" /></Link>}>
              <PendingTasksList tasks={data.pendingTasks} onCreateTask={canManageTasks ? () => setTaskDialog(true) : undefined} />
            </DashboardSection>
            <DashboardSection title={t("dashboard.taskDistribution")} description={t("dashboard.taskDistributionDesc")}>
              <TaskDistribution groups={data.taskDistribution} />
            </DashboardSection>
          </section>
        </>
      )}

      <TaskDialog open={taskDialog} onOpenChange={setTaskDialog} loading={createTask.isPending} onSubmit={(input) => createTask.mutate(input)} />
      <WorkflowDialog open={workflowDialog} onOpenChange={setWorkflowDialog} loading={createWorkflow.isPending} onSubmit={(input) => createWorkflow.mutate(input)} />

      <Dialog
        open={Boolean(dashboardDialog)}
        onOpenChange={(next) => !next && setDashboardDialog(null)}
        title={dashboardDialog?.mode === "rename" ? t("dashboard.renameDashboard") : t("dashboard.newDashboard")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDashboardDialog(null)}>{t("common.cancel")}</Button>
            <Button type="submit" form="dashboard-name-form" loading={saveDashboard.isPending} disabled={!dashboardName.trim()}>{t("common.save")}</Button>
          </>
        }
      >
        <form id="dashboard-name-form" onSubmit={submitDashboardName}>
          <Field label={t("dashboard.dashboardName")} required error={saveDashboard.error ? apiErrorText(saveDashboard.error, t) : undefined}>
            <Input autoFocus value={dashboardName} onChange={(event) => setDashboardName(event.target.value)} maxLength={120} />
          </Field>
        </form>
      </Dialog>

      <Dialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} title={t("dashboard.addWidget")} description={t("dashboard.addWidgetDesc")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {WIDGET_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="nx-focus-ring flex items-center gap-3 rounded-md border border-border px-4 py-3 text-left text-sm font-medium text-secondary-foreground transition-colors hover:border-primary hover:bg-primary-subtle hover:text-foreground disabled:opacity-[var(--nx-disabled-opacity)]"
              disabled={addWidgetMutation.isPending}
              onClick={() => addWidgetMutation.mutate(type)}
            >
              <LayoutDashboard className="size-4 shrink-0 text-primary" />
              {widgetTitle(t, type)}
            </button>
          ))}
        </div>
      </Dialog>
      {confirmDialog}
    </div>
  );
}

function AnnouncementsFeed({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const announcements = useQuery({ queryKey: ["announcements-feed", organizationId], queryFn: () => announcementsApi.list(organizationId) });
  const items = announcements.data?.announcements ?? [];
  if (!announcements.data || items.length === 0) return null;
  return (
    <section aria-labelledby="announcements-title" className="space-y-3">
      <h2 id="announcements-title" className="nx-h3">{t("announcements.feedTitle")}</h2>
      <div className="space-y-2">
        {items.map((announcement) => (
          <article key={announcement.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">{announcement.title}</h3>
              {announcement.audience !== "ALL" ? <Badge variant="outline">{t("announcements.teamOnly")}</Badge> : null}
            </div>
            <p className="mt-1 whitespace-pre-line text-sm text-secondary-foreground">{announcement.body}</p>
            <p className="mt-2 text-xs text-muted-foreground">{announcement.author}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AttentionItem({ icon: Icon, label, value, href, urgent }: { icon: typeof Bell; label: string; value: number | null; href: string; urgent?: boolean }) {
  return <Link to={href} className="group flex items-center gap-3 py-3.5"><span className={`grid size-8 shrink-0 place-items-center rounded-md ${urgent ? "bg-warning-subtle text-warning" : "bg-surface-secondary text-muted-foreground"}`}><Icon className="size-4" /></span><span className="min-w-0 flex-1 text-sm font-medium text-secondary-foreground group-hover:text-foreground">{label}</span>{value === null ? <Skeleton className="h-5 w-6" /> : <span className={`text-sm font-semibold ${urgent ? "text-warning" : "text-foreground"}`}>{value}</span>}<ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" /></Link>;
}

function TaskDialog({ open, onOpenChange, loading, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; loading: boolean; onSubmit: (input: TaskInput) => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [dueAt, setDueAt] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); onSubmit({ title: title.trim(), description: description.trim() || undefined, priority, dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : undefined }); }
  return <Dialog open={open} onOpenChange={onOpenChange} title={t("dashboard.taskDialogTitle")} description={t("dashboard.taskDialogDesc")} footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button type="submit" form="dashboard-task-form" loading={loading} disabled={!title.trim()}>{t("dashboard.createTask")}</Button></>}><form id="dashboard-task-form" className="space-y-4" onSubmit={submit}><Field label={t("dashboard.taskTitle")} required><Input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Field label={t("common.description")} helper={t("dashboard.descriptionOptional")}><Textarea maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label={t("dashboard.taskPriority")}><Select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="LOW">{t("common.low")}</option><option value="NORMAL">{t("common.normal")}</option><option value="HIGH">{t("common.high")}</option><option value="URGENT">{t("common.urgent")}</option></Select></Field><Field label={t("dashboard.taskDueDate")}><Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></Field></div></form></Dialog>;
}

function WorkflowDialog({ open, onOpenChange, loading, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; loading: boolean; onSubmit: (input: { name: string; description?: string }) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); onSubmit({ name: name.trim(), description: description.trim() || undefined }); }
  return <Dialog open={open} onOpenChange={onOpenChange} title={t("dashboard.workflowDialogTitle")} description={t("dashboard.workflowDialogDesc")} footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button type="submit" form="dashboard-workflow-form" loading={loading} disabled={!name.trim()}>{t("dashboard.createWorkflow")}</Button></>}><form id="dashboard-workflow-form" className="space-y-4" onSubmit={submit}><Field label={t("common.name")} required><Input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={t("common.description")} helper={t("dashboard.descriptionOptional")}><Textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} /></Field></form></Dialog>;
}

function DashboardSkeleton() {
  const { t } = useTranslation();
  return <div className="mx-auto max-w-[90rem] space-y-10" aria-label={t("dashboard.loadingDashboard")}><div className="flex items-end justify-between border-b border-border pb-7"><div className="space-y-3"><Skeleton className="h-4 w-36" /><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-96 max-w-full" /></div><Skeleton className="hidden h-10 w-72 sm:block" /></div><div className="space-y-3"><Skeleton className="h-5 w-28" /><Skeleton className="h-10 w-96 max-w-full" /></div><div className="grid grid-cols-2 gap-6 border-y border-border py-6 md:grid-cols-4 xl:grid-cols-7">{Array.from({ length: 7 }, (_, index) => <div className="space-y-2" key={index}><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-16" /></div>)}</div><div className="grid gap-8 xl:grid-cols-[1.65fr_0.75fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div><Skeleton className="h-72" /></div>;
}

function greeting(t: (key: string) => string) { const hour = new Date().getHours(); return hour < 12 ? t("dashboard.goodMorning") : hour < 20 ? t("dashboard.goodAfternoon") : t("dashboard.goodEvening"); }
