import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskPriority, TaskStatus } from "@nexora/contracts";
import { Bell, BellOff, ChevronLeft, MessageSquare, Send, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ContextualCopilot } from "../components/ai/contextual-copilot";
import { useRealtimeChannel } from "../components/collaboration/use-realtime-channel";
import { LivePresence } from "../components/collaboration/live-presence";
import { MentionText, MentionTextarea } from "../components/collaboration/mention-textarea";
import { useCollaborationMembers } from "../components/collaboration/use-collaboration-members";
import { useWorkspace } from "../components/layout/app-layout";
import { Badge, Breadcrumb, Button, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton, Textarea, useConfirm, useToast } from "../components/ui";
import { subscriptionsApi, tasksApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

const STATUS_VARIANT: Record<TaskStatus, "neutral" | "info" | "warning" | "success" | "danger"> = { TODO: "neutral", IN_PROGRESS: "info", IN_REVIEW: "warning", DONE: "success", CANCELLED: "danger" };
const PRIORITY_VARIANT: Record<TaskPriority, "neutral" | "info" | "warning" | "danger"> = { LOW: "neutral", NORMAL: "info", HIGH: "warning", URGENT: "danger" };
const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];
const PRIORITIES: TaskPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export function TaskDetailPage() {
  const { t } = useTranslation();
  const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: t("common.todo"),
  IN_PROGRESS: t("common.inProgress"),
  IN_REVIEW: t("tasks.inReview"),
  DONE: t("tasks.completed"),
  CANCELLED: t("common.cancelled")
};
const PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: t("common.low"), NORMAL: t("common.normal"), HIGH: t("common.high"), URGENT: t("common.urgent") };
  const { formatDateTime } = useLocaleFormatter();
  const { id: taskId = "" } = useParams();
  const { organization, session } = useWorkspace();
  const canManage = organization.permissions.includes("tasks.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [commentBody, setCommentBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("NORMAL");
  const [editStatus, setEditStatus] = useState<TaskStatus>("TODO");
  const [editDueAt, setEditDueAt] = useState("");
  const [editTags, setEditTags] = useState("");

  const taskQuery = useQuery({ queryKey: ["task", organization.id, taskId], queryFn: () => tasksApi.get(organization.id, taskId) });
  const realtime = useRealtimeChannel({
    organizationId: organization.id,
    channel: { type: "task", resourceId: taskId },
    enabled: Boolean(taskId) && taskQuery.isSuccess,
    onEvent: (event) => {
      if (event.type === "connected" || event.type === "comment.created" || event.type === "comment.deleted" || event.type === "resource.updated") {
        void queryClient.invalidateQueries({ queryKey: ["task", organization.id, taskId] });
      }
    }
  });
  const members = useCollaborationMembers(organization.id).data?.members ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["task", organization.id, taskId] });
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const alertCheck = useQuery({ queryKey: ["subscription-check", organization.id, "task", taskId], queryFn: () => subscriptionsApi.check(organization.id, "task", taskId) });
  const subscribed = alertCheck.data?.subscribed ?? false;
  const toggleAlert = useMutation({
    mutationFn: async () => {
      if (subscribed) await subscriptionsApi.unsubscribe(organization.id, { targetType: "task", targetId: taskId });
      else await subscriptionsApi.subscribe(organization.id, { targetType: "task", targetId: taskId, events: ["created", "updated", "deleted", "commented"] });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscription-check", organization.id, "task", taskId] });
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", organization.id] });
      toast({ tone: "success", title: subscribed ? t("subscriptions.removed") : t("subscriptions.activated") });
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("subscriptions.errorSaving"), description: apiErrorText(error, t) })
  });

  const updateMutation = useMutation({
    mutationFn: (input: Parameters<typeof tasksApi.update>[2]) => tasksApi.update(organization.id, taskId, input),
    onSuccess: refresh,
    onError: (error: Error) => toast({ tone: "danger", title: t("common.errorSaving"), description: apiErrorText(error, t) })
  });
  const deleteMutation = useMutation({ mutationFn: () => tasksApi.remove(organization.id, taskId), onSuccess: () => navigate("/tasks"), onError: (error: Error) => toast({ tone: "danger", title: t("common.errorSaving"), description: apiErrorText(error, t) }) });
  const addCommentMutation = useMutation({
    mutationFn: (body: string) => tasksApi.addComment(organization.id, taskId, body),
    onSuccess: async () => { setCommentBody(""); await refresh(); },
    onError: (error: Error) => toast({ tone: "danger", title: t("common.errorSaving"), description: apiErrorText(error, t) })
  });
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => tasksApi.removeComment(organization.id, taskId, commentId),
    onSuccess: refresh,
    onError: (error: Error) => toast({ tone: "danger", title: t("common.errorSaving"), description: apiErrorText(error, t) })
  });

  const task = taskQuery.data;
  if (taskQuery.isPending) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.tasks")} title={t("tasks.detailTitle")} />
        <div className="space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 lg:col-span-2" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </Page>
    );
  }
  if (taskQuery.isError || !task) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.tasks")} title={t("tasks.detailTitle")} />
        <EmptyState icon={MessageSquare} title={t("tasks.taskNotFound")} description={t("tasks.errorLoadingTask")} action={<Button variant="outline" onClick={() => navigate("/tasks")}><ChevronLeft />{t("tasks.backToTasks")}</Button>} />
      </Page>
    );
  }

  function startEdit() {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditDueAt(task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : "");
    setEditTags(task.tags.join(", "));
    setEditing(true);
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    updateMutation.mutate({
      title: editTitle,
      description: editDescription || undefined,
      status: editStatus,
      priority: editPriority,
      dueAt: editDueAt ? new Date(editDueAt).toISOString() : null,
      tags: editTags ? editTags.split(",").map((t) => t.trim()).filter(Boolean) : []
    }, { onSuccess: () => setEditing(false) });
  }

  function submitComment(event: FormEvent) {
    event.preventDefault();
    if (commentBody.trim()) addCommentMutation.mutate(commentBody.trim());
  }

  return (
    <Page>
      <Breadcrumb items={[{ label: t("tasks.breadcrumb"), href: "/tasks" }, { label: task.title }]} />
      <PageHeader
        eyebrow={t("tasks.taskEyebrow")}
        title={editing ? t("tasks.editTask") : task.title}
        description={editing ? undefined : (task.description ?? undefined)}
        actions={!editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <ContextualCopilot organizationId={organization.id} resourceType="task" resourceId={taskId} resourceName={task.title} />
            <Button variant="outline" size="sm" onClick={() => toggleAlert.mutate()} loading={toggleAlert.isPending}>{subscribed ? <BellOff /> : <Bell />}{subscribed ? t("subscriptions.removeAlert") : t("subscriptions.alertMe")}</Button>
            {canManage ? <Button variant="outline" size="sm" onClick={startEdit}>{t("common.edit")}</Button> : null}
            {canManage ? <Button variant="outline" size="sm" onClick={async () => { if (await confirm(t("tasks.deleteTaskConfirm"))) deleteMutation.mutate(); }}><Trash2 className="size-4 text-danger" /></Button> : null}
          </div>
        ) : undefined}
      />

      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[task.status]}>{STATUS_LABELS[task.status]}</Badge>
          <Badge variant={PRIORITY_VARIANT[task.priority]}>{t("common.priority")}: {PRIORITY_LABELS[task.priority]}</Badge>
        </div>
      ) : null}

      {editing ? (
        <form className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm" onSubmit={submitEdit}>
          <Field label={t("dashboard.taskTitle")} htmlFor="edit-title"><Input id="edit-title" className="text-base font-semibold" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required maxLength={200} /></Field>
          <Field label={t("common.description")} htmlFor="edit-description"><Textarea id="edit-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={5000} placeholder={t("tasks.descriptionLabel")} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("common.status")} htmlFor="edit-status">
              <Select id="edit-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value as TaskStatus)}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </Select>
            </Field>
            <Field label={t("common.priority")} htmlFor="edit-priority">
              <Select id="edit-priority" value={editPriority} onChange={(e) => setEditPriority(e.target.value as TaskPriority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </Select>
            </Field>
            <Field label={t("tasks.dueDate")} htmlFor="edit-due"><Input id="edit-due" type="date" value={editDueAt} onChange={(e) => setEditDueAt(e.target.value)} /></Field>
          </div>
          <Field label={t("tasks.tagsLabel")} htmlFor="edit-tags"><Input id="edit-tags" value={editTags} onChange={(e) => setEditTags(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={updateMutation.isPending}>{t("common.save")}</Button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="nx-h3 text-foreground"><MessageSquare className="mr-1 inline size-4" />{t("tasks.commentsCount", { count: task.comments.length })}</h3>
              <LivePresence status={realtime.status} presence={realtime.presence} />
            </div>
            <div className="space-y-3">
              {task.comments.map((comment) => (
                <div key={comment.id} className="rounded-md border border-border bg-surface-secondary p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid size-7 place-items-center rounded-full bg-surface text-xs font-medium text-muted-foreground">{comment.author.name.charAt(0).toUpperCase()}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{comment.author.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</p>
                      </div>
                    </div>
                    {comment.author.id === session.user.id || organization.roles.includes("Super Admin") ? <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={async () => { if (await confirm(t("tasks.deleteCommentConfirm"))) deleteCommentMutation.mutate(comment.id); }} aria-label={t("tasks.deleteCommentConfirm")}><Trash2 className="size-3.5" /></Button> : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-secondary-foreground"><MentionText text={comment.body} members={members} /></p>
                </div>
              ))}
              {task.comments.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t("common.noComments")}</p> : null}
            </div>
            {canManage ? (
              <form className="mt-4" onSubmit={submitComment}>
                <MentionTextarea organizationId={organization.id} members={members} className="min-h-20" placeholder={t("tasks.writeComment")} value={commentBody} onChange={(e) => setCommentBody(e.target.value)} maxLength={5000} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{t("collaboration.mentionHint")}</p>
                  <Button type="submit" disabled={addCommentMutation.isPending || !commentBody.trim()}><Send className="size-4" />{addCommentMutation.isPending ? t("common.sending") : t("tasks.comment")}</Button>
                </div>
              </form>
            ) : null}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <h3 className="nx-h3 mb-3 text-foreground">{t("documents.details")}</h3>
            <dl className="space-y-3 text-sm">
              <div><dt className="nx-label text-muted-foreground">{t("common.status")}</dt><dd className="mt-0.5">
                <Select value={task.status} disabled={!canManage} onChange={(e) => updateMutation.mutate({ status: e.target.value as TaskStatus })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </Select>
              </dd></div>
              <div><dt className="nx-label text-muted-foreground">{t("common.priority")}</dt><dd className="mt-0.5">
                <Select value={task.priority} disabled={!canManage} onChange={(e) => updateMutation.mutate({ priority: e.target.value as TaskPriority })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </Select>
              </dd></div>
              <div><dt className="nx-label text-muted-foreground">{t("common.assignee")}</dt><dd className="mt-0.5 text-secondary-foreground">{task.assignee?.name ?? t("tasks.unassigned")}</dd></div>
              {task.team ? <div><dt className="nx-label text-muted-foreground">{t("admin.teamName")}</dt><dd className="mt-0.5 text-secondary-foreground">{task.team.name}</dd></div> : null}
              {task.project ? <div><dt className="nx-label text-muted-foreground">{t("tasks.project")}</dt><dd className="mt-0.5 flex items-center gap-1.5 text-secondary-foreground"><span className="size-2.5 rounded-full" style={{ backgroundColor: task.project.color }} />{task.project.name}</dd></div> : null}
              {task.document ? <div><dt className="nx-label text-muted-foreground">{t("tasks.document")}</dt><dd className="mt-0.5 text-secondary-foreground">{task.document.name}</dd></div> : null}
              <div><dt className="nx-label text-muted-foreground">{t("tasks.dueDate")}</dt><dd className="mt-0.5 text-secondary-foreground">{task.dueAt ? formatDateTime(task.dueAt) : "—"}</dd></div>
              <div><dt className="nx-label text-muted-foreground">{t("tasks.startDate")}</dt><dd className="mt-0.5 text-secondary-foreground">{task.startAt ? formatDateTime(task.startAt) : "—"}</dd></div>
              <div><dt className="nx-label text-muted-foreground">{t("common.creator")}</dt><dd className="mt-0.5 text-secondary-foreground">{task.creator.name}</dd></div>
              <div><dt className="nx-label text-muted-foreground">{t("common.tags")}</dt><dd className="mt-0.5">{task.tags.length > 0 ? task.tags.map((t) => <Badge key={t} variant="neutral" className="mr-1">{t}</Badge>) : "—"}</dd></div>
            </dl>
          </section>
        </div>
      </div>
      {confirmDialog}
    </Page>
  );
}
