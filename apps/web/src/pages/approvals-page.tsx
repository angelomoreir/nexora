import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApprovalDetailDto, ApprovalStatus } from "@nexora/contracts";
import { CheckCircle, GitBranch, MessageSquare, Send, UserCog, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { useRealtimeChannel } from "../components/collaboration/use-realtime-channel";
import { LivePresence } from "../components/collaboration/live-presence";
import { useCollaborationMembers } from "../components/collaboration/use-collaboration-members";
import { Badge, Button, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { approvalsApi, workflowsApi } from "../lib/api";
import { useLocaleFormatter } from "../lib/format";

const STATUS_KEYS: Record<ApprovalStatus, string> = { PENDING: "approvals.statusPending", APPROVED: "approvals.statusApproved", REJECTED: "approvals.statusRejected" };
const STATUS_VARIANT: Record<ApprovalStatus, "warning" | "success" | "danger"> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger" };

export function ApprovalsPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useLocaleFormatter();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "">("");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queryKey = ["approvals", organization.id, statusFilter, scope];
  const listing = useQuery({ queryKey, queryFn: () => approvalsApi.list(organization.id, { status: statusFilter || undefined, scope }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["approvals", organization.id] });

  const approvals = listing.data?.approvals ?? [];
  const selected = approvals.find((a) => a.id === selectedId) ?? null;

  return (
    <Page>
      <PageHeader eyebrow={organization.name} title={t("approvals.title")} description={t("approvals.description")} actions={<ContextualHelpButton route="/approvals" showLabel />} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1">
          {(["", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
            <button key={s || "all"} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors nx-focus-ring ${statusFilter === s ? "bg-primary text-primary-foreground" : "text-secondary-foreground hover:bg-surface-secondary"}`} onClick={() => setStatusFilter(s)}>{s ? t(STATUS_KEYS[s]) : t("approvals.all")}</button>
          ))}
        </div>
        <div className="sm:ml-auto flex gap-1">
          <button className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors nx-focus-ring ${scope === "mine" ? "bg-surface-secondary text-foreground" : "text-secondary-foreground hover:bg-surface-secondary"}`} onClick={() => setScope("mine")}>{t("approvals.mine")}</button>
          <button className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors nx-focus-ring ${scope === "all" ? "bg-surface-secondary text-foreground" : "text-secondary-foreground hover:bg-surface-secondary"}`} onClick={() => setScope("all")}>{t("common.all")}</button>
        </div>
      </div>

      {listing.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {listing.isError ? (
        <EmptyState icon={CheckCircle} title={t("approvals.loadingError")} description={t("approvals.retryConnection")} action={<Button variant="outline" onClick={() => listing.refetch()}>{t("common.retry")}</Button>} />
      ) : null}

      {listing.data ? (
        approvals.length === 0 ? (
          <EmptyState icon={CheckCircle} title={t("approvals.empty")} description={scope === "mine" ? t("approvals.noApprovals") : t("approvals.noApprovalsFiltered")} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              {approvals.map((approval) => (
                <button key={approval.id} className={`w-full rounded-lg border bg-surface p-4 text-left transition-colors nx-focus-ring ${selectedId === approval.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-border-strong"}`} onClick={() => setSelectedId(approval.id)}>
                  <div className="flex items-center justify-between">
                    <Badge variant={STATUS_VARIANT[approval.status]}>{t(STATUS_KEYS[approval.status])}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(approval.createdAt)}</span>
                  </div>
                  <p className="mt-2 font-medium text-foreground">{approval.workflowName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-secondary-foreground">
                    <span className="flex items-center gap-1"><GitBranch className="size-3" />{t("approvals.stepOrder", { order: approval.stepOrder })}</span>
                    <span>{t("approvals.approver")}: {approval.approver.name}</span>
                    {approval.delegatedBy ? <span className="text-primary">{t("approvals.delegatedBy")} {approval.delegatedBy.name}</span> : null}
                  </div>
                  {approval.comments.length > 0 ? <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="size-3" />{t("approvals.commentsCount", { count: approval.comments.length })}</span> : null}
                </button>
              ))}
            </div>

            <div>
              {selected ? <ApprovalDetail approval={selected} onRefresh={refresh} /> : <div className="grid h-full min-h-48 place-items-center rounded-lg border border-dashed border-border-strong p-8 text-sm text-muted-foreground">{t("approvals.selectApproval")}</div>}
            </div>
          </div>
        )
      ) : null}
    </Page>
  );
}

function ApprovalDetail({
  approval, onRefresh
}: { approval: ApprovalDetailDto; onRefresh: () => void }) {
  const { t } = useTranslation();
  const { formatDateTime } = useLocaleFormatter();
  const { organization, session } = useWorkspace();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [delegateDialog, setDelegateDialog] = useState(false);
  const [delegateTo, setDelegateTo] = useState("");
  const realtime = useRealtimeChannel({
    organizationId: organization.id,
    channel: { type: "approval", resourceId: approval.id },
    enabled: Boolean(approval.id),
    onEvent: (event) => {
      if (event.type === "connected" || event.type === "comment.created" || event.type === "comment.deleted" || event.type === "resource.updated") {
        void queryClient.invalidateQueries({ queryKey: ["approvals", organization.id] });
      }
    }
  });
  const canDecide = organization.permissions.includes("approvals.manage") && (approval.approver.id === session.user.id || organization.roles.includes("Super Admin"));
  const delegateMembers = (useCollaborationMembers(organization.id).data?.members ?? []).filter((member) => member.userId !== session.user.id && member.userId !== approval.approver.id);

  const decideMutation = useMutation({
    mutationFn: (decision: "APPROVED" | "REJECTED") => workflowsApi.decideApproval(organization.id, approval.id, decision),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["approvals", organization.id] }); onRefresh(); }
  });
  const commentMutation = useMutation({
    mutationFn: (body: string) => approvalsApi.addComment(organization.id, approval.id, body),
    onSuccess: async () => { setCommentText(""); await queryClient.invalidateQueries({ queryKey: ["approvals", organization.id] }); onRefresh(); }
  });
  const delegateMutation = useMutation({
    mutationFn: () => approvalsApi.delegate(organization.id, approval.id, delegateTo),
    onSuccess: async () => { setDelegateDialog(false); setDelegateTo(""); await queryClient.invalidateQueries({ queryKey: ["approvals", organization.id] }); onRefresh(); }
  });

  function submitComment(event: FormEvent) { event.preventDefault(); if (commentText.trim()) commentMutation.mutate(commentText.trim()); }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <Badge variant={STATUS_VARIANT[approval.status]}>{t(STATUS_KEYS[approval.status])}</Badge>
        <span className="text-xs text-muted-foreground">{formatDateTime(approval.createdAt)}</span>
      </div>
      <div>
        <h3 className="nx-h3 text-foreground">{approval.workflowName}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-secondary-foreground">
          <span className="flex items-center gap-1"><GitBranch className="size-3" />{t("approvals.stepOrder", { order: approval.stepOrder })}</span>
          <span>{t("approvals.approver")}: {approval.approver.name}</span>
          {approval.delegatedBy ? <span className="text-primary">{t("approvals.delegatedBy")} {approval.delegatedBy.name}</span> : null}
          <LivePresence status={realtime.status} presence={realtime.presence} />
        </div>
      </div>

      {approval.decisionNote ? <div className="rounded-md bg-surface-secondary p-3 text-sm text-secondary-foreground"><span className="font-medium text-foreground">{t("approvals.decisionNote")} </span>{approval.decisionNote}</div> : null}
      {approval.decidedAt ? <p className="text-xs text-muted-foreground">{t("approvals.decidedAt")} {formatDateTime(approval.decidedAt)}</p> : null}

      {approval.status === "PENDING" && canDecide ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button size="sm" onClick={() => decideMutation.mutate("APPROVED")} disabled={decideMutation.isPending}><CheckCircle className="size-3.5" />{t("approvals.approve")}</Button>
          <Button variant="outline" size="sm" onClick={() => decideMutation.mutate("REJECTED")} disabled={decideMutation.isPending}><XCircle className="size-3.5" />{t("approvals.reject")}</Button>
          <Button variant="outline" size="sm" onClick={() => setDelegateDialog(!delegateDialog)}><UserCog className="size-3.5" />{t("approvals.delegate")}</Button>
        </div>
      ) : null}

      {delegateDialog ? (
        <div className="rounded-md border border-border p-3">
          <Field label={t("approvals.delegateTo")} htmlFor="delegate-to">
            <Select id="delegate-to" value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)}>
              <option value="">{t("approvals.delegateTo")}</option>
              {delegateMembers.map((member) => <option key={member.membershipId} value={member.membershipId}>{member.name}</option>)}
            </Select>
          </Field>
          <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => delegateMutation.mutate()} disabled={delegateMutation.isPending || !delegateTo.trim()}><Send className="size-3.5" />{t("approvals.delegate")}</Button><Button variant="outline" size="sm" onClick={() => setDelegateDialog(false)}>{t("common.cancel")}</Button></div>
        </div>
      ) : null}

      {approval.delegations.length > 0 ? (
        <div className="border-t border-border pt-3">
          <h4 className="nx-label text-muted-foreground">{t("approvals.delegations")}</h4>
          <div className="mt-1 space-y-1">
            {approval.delegations.map((d) => (
              <p key={d.id} className="text-xs text-secondary-foreground">{d.fromMember.name} → {d.toMember.name} {d.reason ? `(${d.reason})` : ""} · {formatDateTime(d.createdAt)}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-t border-border pt-3">
        <h4 className="nx-label text-muted-foreground">{t("approvals.commentsCount", { count: approval.comments.length })}</h4>
        <div className="mt-2 space-y-2">
          {approval.comments.map((c) => (
            <div key={c.id} className="rounded-md bg-surface-secondary p-2.5"><div className="flex items-center justify-between"><span className="text-xs font-medium text-foreground">{c.author.name}</span><span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span></div><p className="mt-1 text-sm text-secondary-foreground">{c.body}</p></div>
          ))}
          {approval.comments.length === 0 ? <p className="text-xs text-muted-foreground">{t("common.noComments")}</p> : null}
        </div>
        {approval.status === "PENDING" ? (
          <form className="mt-3 flex gap-2" onSubmit={submitComment}>
            <Input className="flex-1" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder={t("approvals.addCommentPlaceholder")} maxLength={2000} />
            <Button type="submit" size="sm" disabled={commentMutation.isPending || !commentText.trim()} aria-label={t("approvals.sendComment")}><MessageSquare className="size-3.5" /></Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
