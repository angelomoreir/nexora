import type { AIContextResourceType } from "@nexora/contracts";
import { Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { aiApi } from "../../lib/api";
import { apiErrorText } from "../../lib/api-error";
import { Alert, Badge, Button, Dialog, Textarea } from "../ui";

type QuickPromptKind = "summary" | "risks" | "nextSteps" | "missingInfo";

interface CopilotTurn {
  id: number;
  role: "user" | "assistant";
  content: string;
  tokensUsed?: number;
}

interface CopilotFailure {
  message: string;
  prompt: string;
  kind: QuickPromptKind | null;
}

const QUICK_PROMPTS: QuickPromptKind[] = ["summary", "risks", "nextSteps", "missingInfo"];

export function ContextualCopilot({ organizationId, resourceType, resourceId, resourceName }: {
  organizationId: string;
  resourceType: AIContextResourceType;
  resourceId: string;
  resourceName: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<CopilotTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<CopilotFailure | null>(null);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns, pending]);

  async function ask(prompt: string, kind: QuickPromptKind | null = null, appendUser = true) {
    const trimmed = prompt.trim();
    if (!trimmed || pending) return;
    setInput("");
    setFailure(null);
    setPending(true);
    if (appendUser) setTurns((previous) => [...previous, { id: ++nextId.current, role: "user", content: trimmed }]);
    try {
      if (kind === "summary" && resourceType === "document") {
        const result = await aiApi.summarizeDocument(organizationId, resourceId);
        setTurns((previous) => [...previous, { id: ++nextId.current, role: "assistant", content: result.summary, tokensUsed: result.usage.tokensUsed }]);
      } else {
        const result = await aiApi.contextual(organizationId, { resourceType, resourceId, prompt: trimmed });
        setTurns((previous) => [...previous, { id: ++nextId.current, role: "assistant", content: result.answer, tokensUsed: result.usage.tokensUsed }]);
      }
    } catch (error) {
      setFailure({ message: apiErrorText(error, t), prompt: trimmed, kind });
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Sparkles />{t("copilot.button")}</Button>
      <Dialog open={open} onOpenChange={setOpen} size="lg" title={t("copilot.title")} description={t("copilot.context", { name: resourceName })}>
        <div className="flex flex-col gap-4">
          <div className="max-h-96 space-y-3 overflow-y-auto pr-1" aria-live="polite">
            {turns.length === 0 && !pending ? (
              <div className="rounded-md border border-dashed border-border p-5 text-center">
                <Sparkles className="mx-auto size-6 text-primary" />
                <p className="mt-2 text-sm font-medium text-foreground">{t("copilot.emptyTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("copilot.emptyDescription")}</p>
                <p className="nx-label mt-4 text-muted-foreground">{t("copilot.suggestions")}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {QUICK_PROMPTS.map((kind) => (
                    <button key={kind} type="button" disabled={pending} onClick={() => void ask(t(`copilot.prompts.${kind}`), kind)} className="nx-focus-ring rounded-md border border-border bg-surface px-3 py-2 text-left text-sm font-medium text-secondary-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-[var(--nx-disabled-opacity)]">
                      {t(`copilot.promptLabels.${kind}`)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {turns.map((turn) => (
              <div key={turn.id} className={turn.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-primary-subtle px-3 py-2" : "mr-auto max-w-[85%] rounded-lg bg-surface-secondary px-3 py-2"}>
                <p className="whitespace-pre-wrap text-sm text-foreground">{turn.content}</p>
                {turn.role === "assistant" && turn.tokensUsed !== undefined ? (
                  <div className="mt-1.5"><Badge variant="outline">{t("copilot.tokens", { count: turn.tokensUsed })}</Badge></div>
                ) : null}
              </div>
            ))}
            {pending ? (
              <div className="mr-auto flex max-w-[85%] items-center gap-2 rounded-lg bg-surface-secondary px-3 py-2 text-sm text-muted-foreground">
                <Sparkles className="size-4 animate-pulse" />{t("copilot.thinking")}
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
          {failure ? (
            <Alert variant="danger" title={t("copilot.errorTitle")}>
              <p>{failure.message}</p>
              <Button className="mt-3" size="sm" variant="outline" disabled={pending} onClick={() => void ask(failure.prompt, failure.kind, false)}>{t("copilot.retry")}</Button>
            </Alert>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("copilot.verifyNotice")}</p>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={submit}>
            <Textarea className="min-h-16 flex-1" placeholder={t("copilot.inputPlaceholder")} value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} />
            <Button className="w-full sm:w-auto" type="submit" disabled={pending || !input.trim()}><Send />{t("copilot.send")}</Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
