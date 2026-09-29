import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskPriority, TaskStatus, TaskSummaryDto } from "@nexora/contracts";
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, KanbanSquare, List as ListIcon, Plus, Search, Tag, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Textarea, Toolbar, useConfirm } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { tasksApi, type TaskInput } from "../lib/api";
import { useLocaleFormatter } from "../lib/format";
import { SavedViewsDropdown } from "../components/views/saved-views-dropdown";

const STATUS_VARIANT: Record<TaskStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  TODO: "neutral",
  IN_PROGRESS: "info",
  IN_REVIEW: "warning",
  DONE: "success",
  CANCELLED: "danger"
};
const PRIORITY_VARIANT: Record<TaskPriority, "neutral" | "info" | "warning" | "danger"> = { LOW: "neutral", NORMAL: "info", HIGH: "warning", URGENT: "danger" };
const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];

type ViewMode = "list" | "kanban" | "calendar";

export function TasksPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const canManage = organization.permissions.includes("tasks.manage");
  const queryClient = useQueryClient();
  const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: t("common.todo"),
  IN_PROGRESS: t("common.inProgress"),
  IN_REVIEW: t("tasks.inReview"),
  DONE: t("tasks.completed"),
  CANCELLED: t("common.cancelled")
};
const PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: t("common.low"), NORMAL: t("common.normal"), HIGH: t("common.high"), URGENT: t("common.urgent") };
  const navigate = useNavigate();
  const { confirm, confirmDialog } = useConfirm();
  const { formatDate } = useLocaleFormatter();
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [createDialog, setCreateDialog] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const queryKey = ["tasks", organization.id, search, statusFilter, priorityFilter];
  const listing = useQuery({ queryKey, queryFn: () => tasksApi.list(organization.id, { search: search || undefined, status: statusFilter as TaskStatus || undefined, priority: priorityFilter as TaskPriority || undefined }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks", organization.id] });

  const createMutation = useMutation({
    mutationFn: (input: TaskInput) => tasksApi.create(organization.id, input),
    onSuccess: async (task) => { setCreateDialog(false); await refresh(); navigate(`/tasks/${task.id}`); }
  });
  const deleteMutation = useMutation({ mutationFn: (task: TaskSummaryDto) => tasksApi.remove(organization.id, task.id), onSuccess: refresh });
  const updateStatusMutation = useMutation({ mutationFn: ({ task, status }: { task: TaskSummaryDto; status: TaskStatus }) => tasksApi.update(organization.id, task.id, { status }), onSuccess: refresh });

  const tasks = listing.data?.tasks ?? [];

  return (
    <Page>
      <PageHeader eyebrow={organization.name} title={t("tasks.title")} description={t("tasks.description")} actions={<><ContextualHelpButton route="/tasks" showLabel /><Button onClick={() => setCreateDialog(true)} disabled={!canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined}><Plus />{t("tasks.create")}</Button></>} />

      {!canManage ? <Alert variant="info">{t("tasks.readOnlyNotice")}</Alert> : null}

      <Toolbar>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="sm:max-w-48" aria-label={t("common.status")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t("common.allStatuses")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </Select>
        <Select className="sm:max-w-48" aria-label={t("common.priority")} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">{t("common.allPriorities")}</option>
          {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </Select>
        <div className="flex h-10 items-center gap-1 rounded-md border border-border-strong p-1">
          <ViewButton active={view === "list"} onClick={() => setView("list")} icon={ListIcon} label={t("tasks.listView")} />
          <ViewButton active={view === "kanban"} onClick={() => setView("kanban")} icon={KanbanSquare} label={t("tasks.kanbanView")} />
          <ViewButton active={view === "calendar"} onClick={() => setView("calendar")} icon={CalendarDays} label={t("tasks.calendar")} />
        </div>
        <SavedViewsDropdown
          resourceType="tasks"
          getConfig={() => ({ search, statusFilter, priorityFilter, view })}
          applyConfig={(config) => {
            setSearch(typeof config.search === "string" ? config.search : "");
            setStatusFilter(typeof config.statusFilter === "string" ? config.statusFilter : "");
            setPriorityFilter(typeof config.priorityFilter === "string" ? config.priorityFilter : "");
            if (config.view === "list" || config.view === "kanban" || config.view === "calendar") setView(config.view);
          }}
        />
      </Toolbar>

      {listing.isPending ? (
        <TableContainer>
          <Table>
            <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("common.status")}</TableHead><TableHead>{t("common.priority")}</TableHead><TableHead>{t("common.assignee")}</TableHead><TableHead>{t("tasks.dueDate")}</TableHead><TableHead>{t("common.tags")}</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {listing.isError ? (
        <EmptyState icon={CheckSquare} title={t("tasks.loadingError")} description={t("approvals.retryConnection")} action={<Button variant="outline" onClick={() => listing.refetch()}>{t("common.retry")}</Button>} />
      ) : null}

      {listing.data && view === "list" ? (
        tasks.length === 0 ? (
          <EmptyState icon={CheckSquare} title={t("tasks.empty")} description={canManage ? t("tasks.emptyDesc") : t("tasks.readOnlyNotice")} action={canManage ? <Button onClick={() => setCreateDialog(true)}><Plus />{t("tasks.create")}</Button> : undefined} />
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("common.priority")}</TableHead>
                  <TableHead>{t("common.assignee")}</TableHead>
                  <TableHead>{t("tasks.dueDate")}</TableHead>
                  <TableHead>{t("common.tags")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} className="cursor-pointer" onClick={() => navigate(`/tasks/${task.id}`)}>
                    <TableCell className="font-medium text-foreground">{task.title}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[task.status]}>{STATUS_LABELS[task.status]}</Badge></TableCell>
                    <TableCell><Badge variant={PRIORITY_VARIANT[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge></TableCell>
                    <TableCell>{task.assignee?.name ?? "—"}</TableCell>
                    <TableCell>{task.dueAt ? formatDate(task.dueAt) : "—"}</TableCell>
                    <TableCell>{task.tags.length > 0 ? task.tags.map((t) => <span key={t} className="mr-1 inline-flex items-center gap-0.5 rounded-sm bg-surface-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"><Tag className="size-2.5" />{t}</span>) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-danger-subtle hover:text-danger" disabled={!canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined} onClick={async (e) => { e.stopPropagation(); if (await confirm(t("common.deleteConfirm", { name: task.title }))) deleteMutation.mutate(task); }} aria-label={t("common.delete")}><Trash2 className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      ) : null}

      {listing.data && view === "kanban" ? (
        <div className="grid gap-4 lg:grid-cols-5">
          {STATUSES.map((status) => (
            <div key={status} className="rounded-lg border border-border bg-surface-secondary p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{STATUS_LABELS[status]}</h3>
                <Badge variant="neutral">{tasks.filter((t) => t.status === status).length}</Badge>
              </div>
              <div className="space-y-2">
                {tasks.filter((t) => t.status === status).map((task) => (
                  <div key={task.id} className="cursor-pointer rounded-md border border-border bg-surface p-3 transition-colors hover:border-border-strong nx-focus-ring" onClick={() => navigate(`/tasks/${task.id}`)}>
                    <p className="text-sm font-medium text-foreground">{task.title}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant={PRIORITY_VARIANT[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
                      {task.assignee ? <span className="text-xs text-secondary-foreground">{task.assignee.name}</span> : null}
                      {task.dueAt ? <span className="text-xs text-muted-foreground">{new Date(task.dueAt).toLocaleDateString("pt-PT")}</span> : null}
                    </div>
                    {task.tags.length > 0 ? <div className="mt-2 flex flex-wrap gap-1">{task.tags.map((t) => <span key={t} className="rounded-sm bg-surface px-1.5 py-0.5 text-xs text-secondary-foreground">{t}</span>)}</div> : null}
                  </div>
                ))}
                {tasks.filter((t) => t.status === status).length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">{t("tasks.empty")}</p> : null}
              </div>
              <Select className="mt-2 h-8 w-full text-xs" defaultValue="" disabled={!canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined} onChange={(e) => { if (e.target.value) { const task = tasks.find((t) => t.id === e.target.value); if (task) updateStatusMutation.mutate({ task, status }); e.target.value = ""; } }}>
                <option value="" disabled>{t("tasks.moveTaskHere")}</option>
                {tasks.filter((t) => t.status !== status).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </Select>
            </div>
          ))}
        </div>
      ) : null}

      {listing.data && view === "calendar" ? (
        <CalendarView tasks={tasks} month={calendarMonth} onPrev={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} onNext={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} onTaskClick={(id) => navigate(`/tasks/${id}`)} />
      ) : null}

      {createDialog ? <CreateTaskDialog onClose={() => setCreateDialog(false)} onSubmit={(input) => createMutation.mutate(input)} isPending={createMutation.isPending} /> : null}
      {confirmDialog}
    </Page>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof ListIcon; label: string }) {
  return <button className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors nx-focus-ring ${active ? "bg-primary text-primary-foreground" : "text-secondary-foreground hover:bg-surface-secondary"}`} onClick={onClick}><Icon className="size-4" />{label}</button>;
}

function CalendarView({ tasks, month, onPrev, onNext, onTaskClick }: { tasks: TaskSummaryDto[]; month: Date; onPrev: () => void; onNext: () => void; onTaskClick: (id: string) => void }) {
  const { t } = useTranslation();
  const { locale } = useLocaleFormatter();
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const firstDay = new Date(year, monthIdx, 1);
  const lastDay = new Date(year, monthIdx + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = lastDay.getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const tasksByDay = new Map<number, TaskSummaryDto[]>();
  for (const task of tasks) {
    if (!task.dueAt) continue;
    const due = new Date(task.dueAt);
    if (due.getFullYear() === year && due.getMonth() === monthIdx) {
      const day = due.getDate();
      const arr = tasksByDay.get(day) ?? [];
      arr.push(task);
      tasksByDay.set(day, arr);
    }
  }

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(firstDay);
  // Reference week starting on a Monday to derive localized weekday names.
  const dayNames = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2025, 7, 4 + index)));

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="nx-h3 text-foreground capitalize">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-secondary nx-focus-ring" onClick={onPrev} aria-label={t("tasks.prevMonth")}><ChevronLeft className="size-4" /></button>
          <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-secondary nx-focus-ring" onClick={onNext} aria-label={t("tasks.nextMonth")}><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dayNames.map((d) => <div key={d} className="pb-2 text-center text-xs font-medium uppercase text-muted-foreground">{d}</div>)}
        {cells.map((day, i) => (
          <div key={i} className={`min-h-24 rounded-md border p-1.5 ${day ? "border-border bg-surface" : "border-transparent"}`}>
            {day ? <span className="text-xs font-medium text-muted-foreground">{day}</span> : null}
            <div className="mt-1 space-y-1">
              {(tasksByDay.get(day ?? 0) ?? []).map((task) => (
                <button key={task.id} className="block w-full truncate rounded-sm bg-primary-subtle px-1.5 py-1 text-left text-xs text-primary transition-colors hover:bg-primary-subtle/70 nx-focus-ring" onClick={() => onTaskClick(task.id)} title={task.title}>{task.title}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateTaskDialog({onClose, onSubmit, isPending }: { onClose: () => void; onSubmit: (input: TaskInput) => void; isPending: boolean }) {
  const { t } = useTranslation();
  const PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: t("common.low"), NORMAL: t("common.normal"), HIGH: t("common.high"), URGENT: t("common.urgent") };
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [dueAt, setDueAt] = useState("");
  const [tags, setTags] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      title,
      description: description || undefined,
      priority,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : []
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t("tasks.newTask")} footer={<><Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="new-task-form" disabled={isPending || !title.trim()}><CheckSquare className="size-4" />{isPending ? t("common.creating") : t("common.create")}</Button></>}>
      <form id="new-task-form" className="space-y-4" onSubmit={submit}>
        <Field label={t("dashboard.taskTitle")} htmlFor="task-title"><Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus /></Field>
        <Field label={t("common.description")} htmlFor="task-description"><Textarea id="task-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("common.priority")} htmlFor="task-priority">
            <Select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </Select>
          </Field>
          <Field label={t("tasks.dueDate")} htmlFor="task-due"><Input id="task-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
        </div>
        <Field label={t("tasks.tagsPlaceholder")} htmlFor="task-tags" helper={t("tasks.tagsExample")}><Input id="task-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("tasks.taskTagsPlaceholder")} /></Field>
      </form>
    </Dialog>
  );
}
