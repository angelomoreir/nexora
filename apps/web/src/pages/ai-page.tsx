import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AIChatResponse, AIMessageDto, AIActionProposal, AIReportResponse, AIProposedList, AIProposedWorkflow, AIScaffoldProposal, AIScaffoldSpec } from "@nexora/contracts";
import { Bot, Check, FileBarChart, FileText, GitBranch, List as ListIcon, MessageSquare, Plus, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Badge, Button, Input, Select } from "../components/ui";
import { aiApi, listsApi, sitesApi, workflowsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { ContextualHelpButton } from "../components/help/contextual-help-button";

interface ChatMessage extends AIMessageDto {
  pending?: boolean;
}

export function AIPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const SUGGESTIONS = [
  { icon: FileText, text: t("ai.suggestionDocs") },
  { icon: FileText, text: t("ai.suggestion1") },
  { icon: ListIcon, text: t("ai.suggestionList") },
  { icon: GitBranch, text: t("ai.suggestionWorkflow") },
  { icon: FileBarChart, text: t("ai.suggestion2") },
  { icon: FileText, text: t("ai.suggestionPending") }
];
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [pendingProposal, setPendingProposal] = useState<AIActionProposal | null>(null);
  const [pendingApp, setPendingApp] = useState<AIScaffoldProposal | null>(null);
  const [appSiteId, setAppSiteId] = useState("");
  const [report, setReport] = useState<AIReportResponse | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({
    queryKey: ["ai-conversations", organization.id],
    queryFn: () => aiApi.listConversations(organization.id)
  });

  const { data: usage } = useQuery({
    queryKey: ["ai-usage", organization.id],
    queryFn: () => aiApi.usage(organization.id),
    refetchInterval: 30000
  });

  const chatMutation = useMutation({
    mutationFn: ({ message, convId }: { message: string; convId?: string }) =>
      aiApi.chat(organization.id, message, convId),
    onSuccess: (data: AIChatResponse) => {
      setConversationId(data.conversationId);
      setMessages((prev) => {
        const withoutPending = prev.filter((m) => !m.pending);
        return [...withoutPending, data.message];
      });
      if (data.message.actionType === "create_app") {
        setPendingApp({
          type: "create_app",
          spec: data.message.actionData as AIScaffoldSpec,
          explanation: data.message.content
        });
      } else if (data.message.actionType === "create_list" || data.message.actionType === "create_workflow") {
        const proposal: AIActionProposal = {
          type: data.message.actionType,
          list: (data.message.actionData as { list?: AIProposedList })?.list,
          workflow: (data.message.actionData as { workflow?: AIProposedWorkflow })?.workflow,
          explanation: data.message.content
        };
        setPendingProposal(proposal);
      }
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev.filter((m) => !m.pending),
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: t("ai.errorPrefix", { message: apiErrorText(error, t) }),
          actionType: null,
          actionData: null,
          createdAt: new Date().toISOString()
        }
      ]);
    }
  });

  const createListMutation = useMutation({
    mutationFn: (list: AIProposedList) =>
      listsApi.create(organization.id, {
        name: list.name,
        description: list.description,
        fields: list.fields.map((f, i) => ({
          name: f.name,
          slug: f.slug,
          type: f.type as "text" | "longtext" | "number" | "currency" | "date" | "datetime" | "boolean" | "choice" | "email" | "url" | "user" | "relation" | "file",
          required: f.required,
          options: f.type === "choice" ? [{ value: "ativo", label: t("common.active") }, { value: "inativo", label: t("admin.inactive") }] : null,
          relationListId: null,
          order: i
        }))
      }),
    onSuccess: () => {
      setPendingProposal(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `confirm-${Date.now()}`,
          role: "assistant",
          content: t("ai.listCreated"),
          actionType: null,
          actionData: null,
          createdAt: new Date().toISOString()
        }
      ]);
    }
  });

  const createWorkflowMutation = useMutation({
    mutationFn: (workflow: AIProposedWorkflow) =>
      workflowsApi.create(organization.id, {
        name: workflow.name,
        description: workflow.description,
        steps: workflow.steps.map((s) => ({
          order: s.order,
          type: s.type as "START" | "CREATE_TASK" | "SEND_NOTIFICATION" | "SEND_EMAIL" | "APPROVAL" | "CHANGE_STATUS" | "ASSIGN_USER" | "CHANGE_FIELD" | "MOVE_DOCUMENT" | "CONDITION" | "END",
          name: s.name,
          config: s.config
        }))
      }),
    onSuccess: () => {
      setPendingProposal(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `confirm-${Date.now()}`,
          role: "assistant",
          content: t("ai.workflowCreated"),
          actionType: null,
          actionData: null,
          createdAt: new Date().toISOString()
        }
      ]);
    }
  });

  const applyScaffoldMutation = useMutation({
    mutationFn: (proposal: AIScaffoldProposal) =>
      aiApi.applyScaffold(organization.id, { siteId: appSiteId || null, spec: proposal.spec }),
    onSuccess: (created) => {
      setPendingApp(null);
      setAppSiteId("");
      setMessages((prev) => [
        ...prev,
        {
          id: `confirm-${Date.now()}`,
          role: "assistant",
          content: t("ai.appCreated", { name: created.list.name }),
          actionType: null,
          actionData: null,
          createdAt: new Date().toISOString()
        }
      ]);
      queryClient.invalidateQueries({ queryKey: ["lists", organization.id] });
      queryClient.invalidateQueries({ queryKey: ["forms", organization.id] });
      queryClient.invalidateQueries({ queryKey: ["workflows", organization.id] });
      queryClient.invalidateQueries({ queryKey: ["sites", organization.id] });
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: t("ai.errorPrefix", { message: apiErrorText(error, t) }),
          actionType: null,
          actionData: null,
          createdAt: new Date().toISOString()
        }
      ]);
    }
  });

  const { data: sitesData } = useQuery({
    queryKey: ["sites", organization.id],
    queryFn: () => sitesApi.list(organization.id)
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(text?: string) {
    const message = (text ?? input).trim();
    if (!message || chatMutation.isPending) return;
    setInput("");
    setReport(null);
    setPendingProposal(null);
    setPendingApp(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
        actionType: null,
        actionData: null,
        createdAt: new Date().toISOString()
      },
      {
        id: `pending-${Date.now()}`,
        role: "assistant",
        content: t("ai.processing"),
        actionType: null,
        actionData: null,
        createdAt: new Date().toISOString(),
        pending: true
      }
    ]);
    chatMutation.mutate({ message, convId: conversationId });
  }

  function loadConversation(convId: string) {
    setMessages([]);
    setReport(null);
    setPendingProposal(null);
    setPendingApp(null);
    aiApi.getConversation(organization.id, convId).then((conv) => {
      setConversationId(conv.id);
      setMessages(conv.messages);
    });
  }

  function newConversation() {
    setMessages([]);
    setConversationId(undefined);
    setReport(null);
    setPendingProposal(null);
    setPendingApp(null);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      <ContextualHelpButton route="/ai" showLabel className="absolute right-4 top-2 z-10" />
      {/* Sidebar: Conversations */}
      <aside className="hidden w-64 shrink-0 flex-col rounded-lg border border-border bg-surface shadow-sm md:flex">
        <div className="border-b border-border p-3">
          <Button onClick={newConversation} className="w-full"><Plus className="size-4" />{t("ai.newConversation")}</Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 nx-scrollbar">
          {conversations && conversations.length > 0 ? (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className={`mb-1 flex w-full items-start gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-surface-secondary nx-focus-ring ${conversationId === c.id ? "bg-surface-secondary font-medium text-foreground" : "text-secondary-foreground"}`}
              >
                <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{c.title}</span>
              </button>
            ))
          ) : (
            <p className="p-2 text-xs text-muted-foreground">{t("ai.noConversations")}</p>
          )}
        </div>
        {usage && (
          <div className="border-t border-border p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
              <Sparkles className="size-3" />{t("ai.usageToday")}
            </div>
            <div>{t("ai.requests")} {usage.today.requests}</div>
            <div>{t("ai.tokens")}: {usage.today.tokensInput + usage.today.tokensOutput}</div>
            <div>{t("ai.cost")}: ${usage.today.costUsd.toFixed(4)}</div>
          </div>
        )}
      </aside>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col rounded-lg border border-border bg-surface shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="grid size-9 place-items-center rounded-md bg-primary-subtle text-primary"><Bot className="size-5" /></span>
          <div>
            <h1 className="font-semibold text-foreground">{t("ai.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("ai.respectsPermissions")}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 nx-scrollbar">
          {messages.length === 0 && !report ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <span className="grid size-16 place-items-center rounded-md bg-primary-subtle text-primary"><Sparkles className="size-8" /></span>
              <div className="text-center">
                <h2 className="nx-h3 text-foreground">{t("ai.howCanIHelp")}</h2>
                <p className="mt-1 text-sm text-secondary-foreground">{t("ai.askAbout")}</p>
              </div>
              <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.text}
                      onClick={() => handleSend(s.text)}
                      className="flex items-start gap-3 rounded-md border border-border bg-surface-secondary p-3 text-left text-sm transition-colors hover:border-border-strong nx-focus-ring"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{s.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary"><Bot className="size-4" /></span>
                  )}
                  <div
                    className={`max-w-[80%] rounded-md px-4 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : msg.pending
                          ? "bg-surface-secondary text-muted-foreground italic"
                          : "bg-surface-secondary text-foreground"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}

              {/* Pending proposal confirmation */}
              {pendingProposal && (
                <div className="mx-auto max-w-3xl rounded-md border border-primary/40 bg-primary-subtle p-4">
                  <h3 className="nx-h3 text-foreground">{t("ai.confirmCreation")}</h3>
                  <p className="mb-3 mt-1 text-sm text-secondary-foreground">{t("ai.confirmCreationDesc")} {pendingProposal.type === "create_list" ? t("ai.confirmCreationList") : t("ai.confirmCreationWorkflow")} proposto?</p>

                  {pendingProposal.list && (
                    <div className="mb-3 rounded-md border border-border bg-surface p-3 text-sm">
                      <div className="font-medium text-foreground">{pendingProposal.list.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{t("ai.listFields", { count: pendingProposal.list.fields.length })}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {pendingProposal.list.fields.map((f) => (
                          <Badge key={f.slug} variant="neutral">{f.name} <span className="text-muted-foreground">({f.type})</span></Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {pendingProposal.workflow && (
                    <div className="mb-3 rounded-md border border-border bg-surface p-3 text-sm">
                      <div className="font-medium text-foreground">{pendingProposal.workflow.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{t("ai.workflowSteps", { count: pendingProposal.workflow.steps.length })}</div>
                      <ol className="mt-2 space-y-1">
                        {pendingProposal.workflow.steps.map((s) => (
                          <li key={s.order} className="text-xs text-secondary-foreground">
                            {s.order}. {s.name} <span className="text-muted-foreground">({s.type})</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { if (pendingProposal.list) createListMutation.mutate(pendingProposal.list); if (pendingProposal.workflow) createWorkflowMutation.mutate(pendingProposal.workflow); }} disabled={createListMutation.isPending || createWorkflowMutation.isPending}><Check className="size-4" />{t("common.confirm")}</Button>
                    <Button size="sm" variant="outline" onClick={() => setPendingProposal(null)}><X className="size-4" />{t("common.cancel")}</Button>
                  </div>
                </div>
              )}

              {/* Pending app scaffold confirmation */}
              {pendingApp && (
                <div className="mx-auto max-w-3xl rounded-md border border-primary/40 bg-primary-subtle p-4">
                  <h3 className="nx-h3 text-foreground">{t("ai.confirmApp")}</h3>
                  <p className="mb-3 mt-1 text-sm text-secondary-foreground">{t("ai.confirmAppDesc")}</p>

                  <div className="mb-3 rounded-md border border-border bg-surface p-3 text-sm">
                    <div className="font-medium text-foreground">{pendingApp.spec.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{pendingApp.spec.description}</div>
                  </div>

                  <div className="mb-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-border bg-surface p-3 text-sm">
                      <div className="flex items-center gap-1.5 font-medium text-foreground"><ListIcon className="size-3.5 text-primary" />{pendingApp.spec.list.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{t("ai.listFields", { count: pendingApp.spec.list.fields.length })}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {pendingApp.spec.list.fields.slice(0, 8).map((f) => (
                          <Badge key={f.slug || f.name} variant="neutral">{f.name}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-surface p-3 text-sm">
                      <div className="flex items-center gap-1.5 font-medium text-foreground"><FileText className="size-3.5 text-primary" />{pendingApp.spec.form.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{t("ai.formFields", { count: pendingApp.spec.form.fields.length })}</div>
                    </div>
                    <div className="rounded-md border border-border bg-surface p-3 text-sm sm:col-span-2">
                      <div className="flex items-center gap-1.5 font-medium text-foreground"><GitBranch className="size-3.5 text-primary" />{pendingApp.spec.workflow.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{t("ai.workflowSteps", { count: pendingApp.spec.workflow.steps.length })}</div>
                      <div className="mt-1 text-xs text-secondary-foreground">{pendingApp.spec.workflow.steps.map((s) => s.name).join(" → ")}</div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <Select className="w-full" value={appSiteId} onChange={(e) => setAppSiteId(e.target.value)} aria-label={t("ai.appSite")}>
                      <option value="">{t("ai.appSiteNone")}</option>
                      {(sitesData?.sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">{t("ai.appSiteHint")}</p>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => applyScaffoldMutation.mutate(pendingApp)} loading={applyScaffoldMutation.isPending}><Check className="size-4" />{t("ai.createAll")}</Button>
                    <Button size="sm" variant="outline" onClick={() => setPendingApp(null)}><X className="size-4" />{t("common.cancel")}</Button>
                  </div>
                </div>
              )}

              {/* Report display */}
              {report && (
                <div className="rounded-md border border-border bg-surface-secondary p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <FileBarChart className="size-5 text-primary" />
                    <h3 className="nx-h3 text-foreground">{report.title}</h3>
                  </div>
                  <div className="mb-3 whitespace-pre-wrap text-sm text-secondary-foreground">{report.summary}</div>
                  {report.sections.map((s, i) => (
                    <div key={i} className="mb-2 rounded-md border border-border bg-surface p-3">
                      <h4 className="mb-1 font-medium text-foreground">{s.heading}</h4>
                      <p className="whitespace-pre-wrap text-sm text-secondary-foreground">{s.body}</p>
                    </div>
                  ))}
                  <div className="text-xs text-muted-foreground">
                    {t("ai.tokens")}: {report.usage.tokensUsed} · {t("ai.cost")}: ${report.usage.costUsd.toFixed(4)}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="mx-auto flex max-w-3xl gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={t("ai.inputPlaceholder")}
              disabled={chatMutation.isPending}
              className="flex-1"
            />
            <Button onClick={() => handleSend()} disabled={chatMutation.isPending || !input.trim()} size="icon" aria-label={t("ai.send")}><Send className="size-5" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
