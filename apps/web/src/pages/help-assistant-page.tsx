import { useMutation } from "@tanstack/react-query";
import type { AIMessageDto } from "@nexora/contracts";
import { ArrowLeft, Bot, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useWorkspace } from "../components/layout/app-layout";
import { Button, Input } from "../components/ui";
import { Page } from "../components/ui/page";
import { aiApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { HELP_ARTICLES, searchArticles } from "../help/articles";

interface HelpChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: Array<{ label: string; route: string }>;
  createdAt: string;
}

// Build a knowledge base summary from the help articles for the AI context.
function buildKnowledgeContext(): string {
  const lines: string[] = ["Documentação Nexora disponível:"];
  for (const article of HELP_ARTICLES) {
    lines.push(`- ${article.slug} (${article.category}): ${article.keywords.join(", ")}`);
  }
  return lines.join("\n");
}

const KNOWLEDGE_CONTEXT = buildKnowledgeContext();

// Map article keywords to navigation actions
function findActionsForResponse(content: string): Array<{ label: string; route: string }> {
  const lower = content.toLowerCase();
  const actions: Array<{ label: string; route: string }> = [];
  const routeMap: Record<string, { labelKey: string; route: string }> = {
    documentos: { labelKey: "help.actionOpenDocuments", route: "/documents" },
    document: { labelKey: "help.actionOpenDocuments", route: "/documents" },
    listas: { labelKey: "help.actionOpenLists", route: "/lists" },
    lista: { labelKey: "help.actionOpenLists", route: "/lists" },
    formulários: { labelKey: "help.actionOpenForms", route: "/forms" },
    formulário: { labelKey: "help.actionOpenForms", route: "/forms" },
    tarefas: { labelKey: "help.actionOpenTasks", route: "/tasks" },
    tarefa: { labelKey: "help.actionOpenTasks", route: "/tasks" },
    workflow: { labelKey: "help.actionOpenWorkflows", route: "/workflows" },
    processo: { labelKey: "help.actionOpenWorkflows", route: "/workflows" },
    aprovação: { labelKey: "help.actionOpenApprovals", route: "/approvals" },
    aprovações: { labelKey: "help.actionOpenApprovals", route: "/approvals" },
    notificação: { labelKey: "help.actionOpenNotifications", route: "/notifications" },
    notificações: { labelKey: "help.actionOpenNotifications", route: "/notifications" },
    utilizadores: { labelKey: "help.actionOpenUsers", route: "/admin/users" },
    utilizador: { labelKey: "help.actionOpenUsers", route: "/admin/users" },
    equipas: { labelKey: "help.actionOpenTeams", route: "/admin/teams" },
    funções: { labelKey: "help.actionOpenRoles", route: "/admin/roles" },
    permissões: { labelKey: "help.actionOpenRoles", route: "/admin/roles" },
    auditoria: { labelKey: "help.actionOpenAudit", route: "/admin/audit" },
    configurações: { labelKey: "help.actionOpenSettings", route: "/admin/settings" },
    faturação: { labelKey: "help.actionOpenBilling", route: "/billing" },
    perfil: { labelKey: "help.actionOpenProfile", route: "/profile" },
    pesquisa: { labelKey: "help.actionOpenSearch", route: "/search" }
  };

  const added = new Set<string>();
  for (const [keyword, action] of Object.entries(routeMap)) {
    if (lower.includes(keyword) && !added.has(action.route)) {
      actions.push({ label: action.labelKey, route: action.route });
      added.add(action.route);
    }
  }
  return actions.slice(0, 3);
}

export function HelpAssistantPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organization } = useWorkspace();
  const [messages, setMessages] = useState<HelpChatMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    t("help.assistantSuggestion1"),
    t("help.assistantSuggestion2"),
    t("help.assistantSuggestion3"),
    t("help.assistantSuggestion4"),
    t("help.assistantSuggestion5"),
    t("help.assistantSuggestion6")
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: (message: string) => aiApi.chat(organization.id, message),
    onSuccess: (data: { message: AIMessageDto }) => {
      let content = data.message.content;
      // Check if the AI response is relevant to Nexora functionality.
      // If the response seems generic or doesn't reference Nexora features, augment with help context.
      const helpResults = searchArticles(input);
      if (helpResults.length > 0 && helpResults[0]) {
        const topArticle = helpResults[0].article;
        const articleLink = `\n\n📚 ${t("help.relatedArticle")}: ${t(topArticle.titleKey)}`;
        if (!content.includes(articleLink)) {
          content += articleLink;
        }
      }
      const actions = findActionsForResponse(content);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== "pending"),
        {
          id: data.message.id,
          role: "assistant",
          content,
          actions,
          createdAt: data.message.createdAt
        }
      ]);
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== "pending"),
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `${t("help.assistantError")}: ${apiErrorText(error, t)}`,
          createdAt: new Date().toISOString()
        }
      ]);
    }
  });

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMsg: HelpChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString()
    };
    const pendingMsg: HelpChatMessage = {
      id: "pending",
      role: "assistant",
      content: "...",
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setInput("");

    // Augment the message with help context so the AI knows about Nexora documentation
    const contextualMessage = `${trimmed}\n\n[Contexto: O utilizador está na Central de Ajuda do Nexora. ${KNOWLEDGE_CONTEXT}]`;
    chatMutation.mutate(contextualMessage);
  }

  return (
    <Page>
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => navigate("/help")}>
          {t("help.title")}
        </button>
        <span>/</span>
        <span className="text-foreground">{t("help.assistantTitle")}</span>
      </nav>

      <header className="flex items-center gap-4 border-b border-border pb-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary text-white">
          <Sparkles className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="nx-h1">{t("help.assistantTitle")}</h1>
          <p className="mt-2 text-sm text-secondary-foreground">{t("help.assistantDesc")}</p>
        </div>
      </header>

      {/* Chat container */}
      <div className="flex flex-col rounded-lg border border-border bg-surface shadow-sm" style={{ minHeight: "60vh" }}>
        {/* Messages */}
        <div className="nx-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="grid size-14 place-items-center rounded-full bg-primary-subtle text-primary">
                <Bot className="size-7" />
              </div>
              <h2 className="nx-h3 mt-4">{t("help.assistantWelcome")}</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("help.assistantWelcomeDesc")}</p>
              <div className="mt-6 grid w-full max-w-lg gap-2 sm:grid-cols-2">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    className="rounded-lg border border-border bg-surface-secondary/40 p-3 text-left text-sm text-foreground transition-colors hover:border-border-strong hover:bg-surface-secondary"
                    onClick={() => sendMessage(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${message.role === "user" ? "bg-primary text-white" : "bg-primary-subtle text-primary"}`}>
                  {message.role === "user" ? <span className="text-xs font-medium">{t("help.you")}</span> : <Bot className="size-4" />}
                </span>
                <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${message.role === "user" ? "bg-primary text-white" : "bg-surface-secondary text-foreground"}`}>
                  <p className="whitespace-pre-line leading-6">{message.content}</p>
                  {message.actions && message.actions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
                      {message.actions.map((action, index) => (
                        <button
                          key={index}
                          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                          onClick={() => navigate(action.route)}
                        >
                          {t(action.label)} →
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <Input
              className="flex-1"
              placeholder={t("help.assistantInputPlaceholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={chatMutation.isPending}
            />
            <Button type="submit" disabled={!input.trim() || chatMutation.isPending} loading={chatMutation.isPending}>
              <Send className="size-4" />
              {t("common.send")}
            </Button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">{t("help.assistantDisclaimer")}</p>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <Button variant="ghost" onClick={() => navigate("/help")}>
          <ArrowLeft className="size-4" />
          {t("help.backToHelp")}
        </Button>
      </div>
    </Page>
  );
}
