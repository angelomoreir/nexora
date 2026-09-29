import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResourceSubscriptionDto, SubscriptionTargetType } from "@nexora/contracts";
import { AtSign, Bell, BellOff, CheckCheck, CheckSquare, ChevronDown, ChevronUp, FileEdit, FileText, Folder, GitBranch, KeyRound, List, MessageSquare, Share2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useWorkspace } from "../components/layout/app-layout";
import { Badge, Button, EmptyState, Page, PageHeader, Skeleton, Tabs, useToast } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { AccessRequestRow } from "../components/documents/manage-access-dialog";
import { accessApi, documentsApi, listsApi, notificationsApi, subscriptionsApi, tasksApi, usersApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

const TARGET_ICONS: Record<SubscriptionTargetType, typeof Bell> = {
  folder: Folder,
  document: FileText,
  list: List,
  task: CheckSquare,
  project: GitBranch
};

const TYPE_ICONS: Record<string, typeof Bell> = {
  "task.assigned": CheckSquare,
  "task.commented": CheckSquare,
  "user.mentioned": AtSign,
  "document.shared": Share2,
  "document.changed": FileEdit,
  "document.commented": MessageSquare,
  "workflow.approval": GitBranch,
  "workflow.approval.decided": GitBranch,
  "workflow.completed": GitBranch,
  "workflow.notification": Bell,
  "access.requested": KeyRound,
  "access.granted": KeyRound,
  "access.rejected": KeyRound
};

export function NotificationsPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const navigate = useNavigate();
  const TYPE_LABELS: Record<string, string> = {
  "task.assigned": t("notifications.taskAssigned"),
  "task.commented": t("notifications.comment"),
  "user.mentioned": t("notifications.mention"),
  "document.shared": t("notifications.documentShared"),
  "document.changed": t("notifications.documentChanged"),
  "document.commented": t("notifications.documentCommented"),
  "workflow.approval": t("notifications.approvalPending"),
  "workflow.approval.decided": t("notifications.approvalDecision"),
  "workflow.completed": t("notifications.workflowCompleted"),
  "workflow.notification": t("notifications.notification"),
  "access.requested": t("notifications.accessRequested"),
  "access.granted": t("notifications.accessGranted"),
  "access.rejected": t("notifications.accessRejected")
};
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const queryKey = ["notifications", organization.id, filter];
  const listing = useQuery({ queryKey, queryFn: () => notificationsApi.list(organization.id, { unreadOnly: filter === "unread" }) });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["notifications", organization.id] }); queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", organization.id] }); };

  const markReadMutation = useMutation({ mutationFn: (id: string) => notificationsApi.markAsRead(organization.id, id), onSuccess: refresh });
  const markAllMutation = useMutation({ mutationFn: () => notificationsApi.markAllAsRead(organization.id), onSuccess: refresh });

  const notifications = listing.data?.notifications ?? [];
  const unreadCount = listing.data?.unreadCount ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow={organization.name}
        title={t("notifications.title")}
        description={unreadCount > 0 ? t("notifications.unreadCount", { count: unreadCount }) : t("notifications.allRead")}
        actions={<><ContextualHelpButton route="/notifications" showLabel /><Button variant="outline" onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending || unreadCount === 0}><CheckCheck className="size-4" />{t("notifications.markAllRead")}</Button></>}
      />

      <SubscriptionsSection />
      <AccessRequestsSection />

      <Tabs
        value={filter}
        onValueChange={(v) => setFilter(v as "all" | "unread")}
        items={[{ value: "all", label: t("notifications.all") }, { value: "unread", label: t("notifications.unreadTab", { count: unreadCount }) }]}
      />

      {listing.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : null}

      {listing.isError ? (
        <EmptyState icon={Bell} title={t("notifications.loadingError")} description={t("approvals.retryConnection")} action={<Button variant="outline" onClick={() => listing.refetch()}>{t("common.retry")}</Button>} />
      ) : null}

      {listing.data ? (
        notifications.length === 0 ? (
          <EmptyState icon={Bell} title={filter === "unread" ? t("notifications.noUnread") : t("notifications.empty")} description={filter === "unread" ? t("notifications.noUnreadDesc") : t("notifications.noNotificationsDesc")} />
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => {
              const Icon = TYPE_ICONS[notification.type] ?? Bell;
              const isUnread = !notification.readAt;
              const documentId = typeof notification.data?.documentId === "string" ? notification.data.documentId : null;
              return (
                <article key={notification.id} className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${isUnread ? "border-primary/40 bg-primary-subtle" : "border-border bg-surface hover:border-border-strong"} ${documentId ? "cursor-pointer" : ""}`} onClick={() => { if (documentId) { if (isUnread) markReadMutation.mutate(notification.id); navigate(`/documents/${documentId}`); } }}>
                  <span className={`grid size-10 shrink-0 place-items-center rounded-md ${isUnread ? "bg-primary-subtle text-primary" : "bg-surface-secondary text-muted-foreground"}`}><Icon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{TYPE_LABELS[notification.type] ?? notification.type}</span>
                      {isUnread ? <span className="size-2 rounded-full bg-primary" aria-label={t("notifications.unreadLabel")} /> : null}
                      <span className="ml-auto text-xs text-muted-foreground">{new Date(notification.createdAt).toLocaleString("pt-PT")}</span>
                    </div>
                    <p className="mt-1 font-medium text-foreground">{notification.title}</p>
                    <p className="mt-0.5 text-sm text-secondary-foreground">{notification.body}</p>
                  </div>
                  {isUnread ? <button className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground nx-focus-ring" onClick={() => markReadMutation.mutate(notification.id)} title={t("notifications.markRead")} aria-label={t("notifications.markRead")}><CheckCheck className="size-4" /></button> : null}
                </article>
              );
            })}
          </div>
        )
      ) : null}
    </Page>
  );
}

function SubscriptionsSection() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const listing = useQuery({ queryKey: ["subscriptions", organization.id], queryFn: () => subscriptionsApi.mine(organization.id) });
  const subscriptions = listing.data?.subscriptions ?? [];

  // Resolve display names for subscription targets when an endpoint exists.
  const nameQueries = useQueries({
    queries: subscriptions.map((subscription) => ({
      queryKey: ["subscription-target", organization.id, subscription.targetType, subscription.targetId],
      queryFn: async () => resolveTargetName(organization.id, subscription),
      staleTime: 60_000,
      retry: false
    }))
  });
  const targetNames = new Map(subscriptions.map((subscription, index) => [subscription.id, nameQueries[index]?.data]));

  const removeMutation = useMutation({
    mutationFn: (subscription: ResourceSubscriptionDto) => subscriptionsApi.unsubscribe(organization.id, { targetType: subscription.targetType, targetId: subscription.targetId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", organization.id] });
      await queryClient.invalidateQueries({ queryKey: ["subscription-check", organization.id] });
      toast({ tone: "success", title: t("subscriptions.removed") });
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("subscriptions.errorSaving"), description: apiErrorText(error, t) })
  });

  const eventLabels: Record<string, string> = {
    created: t("subscriptions.events.created"),
    updated: t("subscriptions.events.updated"),
    deleted: t("subscriptions.events.deleted"),
    "version.added": t("subscriptions.events.versionAdded"),
    "item.added": t("subscriptions.events.itemAdded"),
    commented: t("subscriptions.events.commented")
  };

  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <button type="button" className="nx-focus-ring flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary"><Bell className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{t("subscriptions.sectionTitle")}</span>
          <span className="block text-xs text-muted-foreground">{t("subscriptions.sectionDesc", { count: subscriptions.length })}</span>
        </span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open ? (
        <div className="border-t border-border p-3">
          {listing.isPending ? <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div> : null}
          {listing.isError ? <p className="px-1 py-2 text-sm text-danger">{t("subscriptions.errorLoading")}</p> : null}
          {listing.data && subscriptions.length === 0 ? <p className="px-1 py-3 text-sm text-muted-foreground">{t("subscriptions.empty")}</p> : null}
          {subscriptions.length ? (
            <ul className="divide-y divide-border">
              {subscriptions.map((subscription) => {
                const Icon = TARGET_ICONS[subscription.targetType] ?? Bell;
                const name = targetNames.get(subscription.id);
                return (
                  <li key={subscription.id} className="flex items-center gap-3 py-2.5">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{name ?? t(`subscriptions.targets.${subscription.targetType}`)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t(`subscriptions.targets.${subscription.targetType}`)} · {t("subscriptions.eventsCount", { count: subscription.events.length })}: {subscription.events.map((event) => eventLabels[event] ?? event).join(", ")}
                      </span>
                    </span>
                    <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-subtle hover:text-danger" loading={removeMutation.isPending && removeMutation.variables?.id === subscription.id} onClick={() => removeMutation.mutate(subscription)}>
                      <BellOff />{t("common.remove")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AccessRequestsSection() {
  const { t } = useTranslation();
  const { organization, session } = useWorkspace();
  const queryClient = useQueryClient();
  const { formatDateTime } = useLocaleFormatter();
  const [open, setOpen] = useState(false);

  const listing = useQuery({ queryKey: ["access-requests", organization.id], queryFn: () => accessApi.listRequests(organization.id, "PENDING") });
  const users = useQuery({ queryKey: ["organization-users", organization.id], queryFn: () => usersApi.list(organization.id), enabled: open });
  const myMembershipId = users.data?.find((user) => user.id === session.user.id)?.memberId;
  const requests = listing.data?.requests ?? [];
  const approvable = myMembershipId ? requests.filter((request) => request.requester?.membershipId !== myMembershipId) : requests;
  const mine = myMembershipId ? requests.filter((request) => request.requester?.membershipId === myMembershipId) : [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["access-requests", organization.id] });

  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <button type="button" className="nx-focus-ring flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary"><KeyRound className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{t("access.sectionTitle")}</span>
          <span className="block text-xs text-muted-foreground">{t("access.sectionDesc", { count: requests.length })}</span>
        </span>
        {requests.length > 0 ? <Badge variant="primary">{requests.length}</Badge> : null}
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open ? (
        <div className="border-t border-border p-3">
          {listing.isPending ? <div className="space-y-2">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div> : null}
          {listing.isError ? <p className="px-1 py-2 text-sm text-danger">{apiErrorText(listing.error, t)}</p> : null}
          {listing.data && requests.length === 0 ? <p className="px-1 py-3 text-sm text-muted-foreground">{t("access.requestsEmptyAll")}</p> : null}
          {approvable.length ? (
            <ul className="divide-y divide-border">
              {approvable.map((request) => (
                <AccessRequestRow key={request.id} request={request} formatDateTime={formatDateTime} onDecided={refresh} />
              ))}
            </ul>
          ) : null}
          {mine.length ? (
            <ul className="mt-3 divide-y divide-border border-t border-border pt-3">
              {mine.map((request) => (
                <li key={request.id} className="flex items-center gap-3 py-2.5">
                  <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{request.resourceName}</span>
                    <span className="block text-xs text-muted-foreground">{t("access.myRequest")} · {formatDateTime(request.createdAt)}</span>
                  </span>
                  <Badge variant="warning">{t("access.statusPending")}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

async function resolveTargetName(organizationId: string, subscription: ResourceSubscriptionDto): Promise<string | null> {
  try {
    switch (subscription.targetType) {
      case "document": {
        const detail = await documentsApi.get(organizationId, subscription.targetId);
        return detail.document.name;
      }
      case "list": {
        const list = await listsApi.get(organizationId, subscription.targetId);
        return list.name;
      }
      case "task": {
        const task = await tasksApi.get(organizationId, subscription.targetId);
        return task.title;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
