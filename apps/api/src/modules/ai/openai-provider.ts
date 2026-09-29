import { prisma } from "../../lib/prisma.js";
import type { AIContext, AIMetadataFieldHint, AIProvider, AIProviderResult } from "./ai-provider.js";

// OpenAI-compatible provider (Chat Completions API).
// Works with OpenAI and any compatible endpoint (Azure OpenAI, Azure AI, Ollama, LiteLLM, ...)
// via OPENAI_BASE_URL. Activated when AI_PROVIDER=openai and OPENAI_API_KEY is set.

const LANGUAGE_NAMES: Record<string, string> = {
  "pt-PT": "European Portuguese",
  "pt-BR": "Brazilian Portuguese",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German"
};

// USD per 1M tokens [input, output] — approximate public OpenAI pricing.
// Non-OpenAI endpoints (Groq free tier, Ollama, self-hosted) report cost 0 so
// the daily cost limit does not trip on artificial estimates.
const MODEL_PRICING: Record<string, [number, number]> = {
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10],
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4.1-nano": [0.1, 0.4],
  "gpt-4.1": [2, 8]
};

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: ChatCompletionUsage;
  error?: { message?: string };
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    model: string
  ) {
    this.model = model;
  }

  private langName(language?: string): string {
    return LANGUAGE_NAMES[language ?? ""] ?? language ?? "the organization's language";
  }

  private estimateCost(tokensInput: number, tokensOutput: number): number {
    if (!this.baseUrl.includes("api.openai.com")) return 0;
    const [inRate, outRate] = MODEL_PRICING[this.model] ?? [1, 3];
    return (tokensInput * inRate + tokensOutput * outRate) / 1_000_000;
  }

  private async complete(system: string, user: string, options?: { json?: boolean; maxTokens?: number }): Promise<AIProviderResult> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_tokens: options?.maxTokens ?? 2048,
        ...(options?.json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      }),
      signal: AbortSignal.timeout(60_000)
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ChatCompletionResponse | null;
      throw new Error(`AI provider request failed (${response.status}): ${body?.error?.message ?? "unknown error"}`);
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";
    const tokensInput = body.usage?.prompt_tokens ?? Math.ceil((system.length + user.length) / 4);
    const tokensOutput = body.usage?.completion_tokens ?? Math.ceil(content.length / 4);
    return { content, tokensInput, tokensOutput, costUsd: this.estimateCost(tokensInput, tokensOutput) };
  }

  private parseJson<T>(content: string): T | null {
    try {
      return JSON.parse(content) as T;
    } catch {
      // Tolerate markdown-fenced JSON from non-strict providers
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          return JSON.parse(match[1]!.trim()) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private truncate(text: string, max = 24_000): string {
    return text.length > max ? `${text.slice(0, max)}\n[…]` : text;
  }

  async chat(prompt: string, context: AIContext): Promise<AIProviderResult> {
    const language = this.langName(context.language);
    const system = `You are NEXORA AI, the assistant of an enterprise workspace platform (documents, lists, forms, tasks, workflows, approvals, sites, news).
Always reply in ${language}.
Reply with a JSON object: {"reply": string, "action": null | {"type": "create_list" | "create_workflow", "data": object}}.
- "reply" is the markdown answer shown to the user.
- Only set "action" when the user explicitly asks to create a list or workflow; then "data" must contain the proposed artifact (list: {name, description, fields:[{name,slug,type,required}]}; workflow: {name,description,steps:[{order,type,name,config}]}).
Field types allowed: text, textarea, number, currency, date, datetime, boolean, choice, email, url, person.`;
    const result = await this.complete(system, prompt, { json: true });
    const parsed = this.parseJson<{ reply?: string; action?: { type?: string; data?: unknown } | null }>(result.content);
    if (!parsed?.reply) {
      return { ...result, content: result.content };
    }
    return {
      ...result,
      content: parsed.reply,
      actionType: parsed.action?.type,
      actionData: parsed.action?.data
    };
  }

  async summarize(text: string, documentName: string): Promise<AIProviderResult> {
    const system = `Summarize documents concisely. Reply with JSON: {"summary": string (markdown, max 200 words), "keywords": string[] (max 8), "classification": string (single business category, e.g. Contract, Invoice, Report, Proposal, HR, Legal, Technical, Other)}.`;
    const result = await this.complete(system, `Document: ${documentName}\n\n${this.truncate(text)}`, { json: true });
    const parsed = this.parseJson<{ summary?: string; keywords?: string[]; classification?: string }>(result.content);
    return {
      ...result,
      content: parsed?.summary ?? result.content,
      actionData: { keywords: parsed?.keywords ?? [], classification: parsed?.classification }
    };
  }

  async extract(text: string, query: string): Promise<AIProviderResult> {
    const system = "Extract the requested information from the document. Reply with only the extracted content (markdown). If not found, say so briefly.";
    return this.complete(system, `Extract: ${query}\n\nDocument:\n${this.truncate(text)}`);
  }

  async classify(text: string, documentName: string): Promise<AIProviderResult> {
    const system = `Classify the document into one business category. Reply with JSON: {"classification": string}.`;
    const result = await this.complete(system, `Document: ${documentName}\n\n${this.truncate(text, 8_000)}`, { json: true });
    const parsed = this.parseJson<{ classification?: string }>(result.content);
    return { ...result, content: parsed?.classification ?? result.content, actionData: { classification: parsed?.classification } };
  }

  async keywords(text: string): Promise<AIProviderResult> {
    const system = `Extract up to 10 keywords. Reply with JSON: {"keywords": string[]}.`;
    const result = await this.complete(system, this.truncate(text, 8_000), { json: true });
    const parsed = this.parseJson<{ keywords?: string[] }>(result.content);
    return { ...result, content: (parsed?.keywords ?? []).join(", "), actionData: { keywords: parsed?.keywords ?? [] } };
  }

  async qa(text: string, question: string): Promise<AIProviderResult> {
    const system = "Answer the question using only the document content. If the answer is not in the document, say so. Reply in the same language as the question.";
    return this.complete(system, `Question: ${question}\n\nDocument:\n${this.truncate(text)}`);
  }

  async proposeList(description: string, language?: string): Promise<AIProviderResult> {
    const system = `Design a structured list/table for an enterprise workspace. Reply in ${this.langName(language)} with JSON:
{"list": {"name": string, "description": string, "fields": [{"name": string, "slug": string (kebab-case ascii), "type": "text"|"textarea"|"number"|"currency"|"date"|"datetime"|"boolean"|"choice"|"email"|"url"|"person", "required": boolean}]}, "explanation": string}`;
    const result = await this.complete(system, `Create a list for: ${description}`, { json: true });
    const parsed = this.parseJson<{ list?: unknown; explanation?: string }>(result.content);
    return { ...result, content: parsed?.explanation ?? result.content, actionData: parsed?.list, actionType: "create_list" };
  }

  async proposeWorkflow(description: string, language?: string): Promise<AIProviderResult> {
    const system = `Design an approval/business workflow for an enterprise workspace. Reply in ${this.langName(language)} with JSON:
{"workflow": {"name": string, "description": string, "steps": [{"order": number, "type": "start"|"approval"|"task"|"notification"|"condition"|"end", "name": string, "config": object}]}, "explanation": string}`;
    const result = await this.complete(system, `Create a workflow for: ${description}`, { json: true });
    const parsed = this.parseJson<{ workflow?: unknown; explanation?: string }>(result.content);
    return { ...result, content: parsed?.explanation ?? result.content, actionData: parsed?.workflow, actionType: "create_workflow" };
  }

  async proposeApp(description: string, language?: string): Promise<AIProviderResult> {
    const system = `Design a mini business app for an enterprise workspace: a data list, an intake form, an approval workflow and an optional dashboard page. Reply in ${this.langName(language)} with JSON:
{"spec": {"name": string, "description": string,
  "list": {"name": string, "description": string, "fields": [{"name": string, "slug": string, "type": string, "required": boolean}]},
  "form": {"name": string, "fields": [{"name": string, "slug": string, "type": string, "label": string, "required": boolean}]},
  "workflow": {"name": string, "description": string, "steps": [{"order": number, "type": string, "name": string, "config": object}]},
  "page": {"title": string, "widgets": [{"type": "list"|"chart"|"stat"|"text", "title": string, "config": object}]} | null},
 "explanation": string}`;
    const result = await this.complete(system, `Create an app for: ${description}`, { json: true, maxTokens: 4096 });
    const parsed = this.parseJson<{ spec?: unknown; explanation?: string }>(result.content);
    return { ...result, content: parsed?.explanation ?? result.content, actionData: parsed?.spec, actionType: "create_app" };
  }

  async report(prompt: string, context: AIContext): Promise<AIProviderResult> {
    // Gather the same real data the local provider uses, then let the model narrate it
    const [tasks, documents, instances] = await Promise.all([
      prisma.task.findMany({
        where: { tenantId: context.organizationId },
        select: { status: true, dueAt: true, title: true },
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      prisma.document.count({ where: { tenantId: context.organizationId, status: "ACTIVE" } }),
      prisma.workflowInstance.findMany({ where: { tenantId: context.organizationId }, select: { status: true }, take: 200 })
    ]);
    const now = new Date();
    const data = {
      tasks: {
        total: tasks.length,
        completed: tasks.filter((t) => t.status === "DONE").length,
        overdue: tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED" && t.dueAt && t.dueAt < now).length,
        sample: tasks.slice(0, 10).map((t) => ({ title: t.title, status: t.status, dueAt: t.dueAt }))
      },
      documents: { active: documents },
      workflows: {
        total: instances.length,
        running: instances.filter((i) => i.status === "RUNNING" || i.status === "WAITING_APPROVAL").length,
        completed: instances.filter((i) => i.status === "COMPLETED").length,
        failed: instances.filter((i) => i.status === "FAILED").length
      }
    };
    const system = `Write a concise management report in ${this.langName(context.language)} based on the organization data provided. Reply with JSON: {"summary": string (markdown), "sections": [{"heading": string, "body": string (markdown)}]}. Only report on data present — do not invent numbers.`;
    const result = await this.complete(system, `Report request: ${prompt}\n\nOrganization data (JSON):\n${JSON.stringify(data)}`, { json: true });
    const parsed = this.parseJson<{ summary?: string; sections?: { heading: string; body: string }[] }>(result.content);
    return {
      ...result,
      content: parsed?.summary ?? result.content,
      actionType: "report",
      actionData: { sections: parsed?.sections ?? [] }
    };
  }

  async suggestMetadata(text: string, fields: AIMetadataFieldHint[]): Promise<AIProviderResult> {
    const system = `Extract metadata values from the document for the requested fields. Reply with JSON: {"suggestions": {"<slug>": value}} — include only fields you can extract with confidence; omit the rest. Match each field type (text, number, date as ISO yyyy-mm-dd, boolean, choice value).`;
    const fieldList = fields.map((f) => `- ${f.slug} (${f.type})${f.options?.length ? ` options: ${f.options.map((o) => o.value).join(", ")}` : ""}`).join("\n");
    const result = await this.complete(system, `Fields:\n${fieldList}\n\nDocument:\n${this.truncate(text, 12_000)}`, { json: true });
    const parsed = this.parseJson<{ suggestions?: Record<string, unknown> }>(result.content);
    const suggestions = parsed?.suggestions ?? {};
    return {
      ...result,
      content: Object.keys(suggestions).length ? `${Object.keys(suggestions).length} metadata suggestions` : "No metadata suggestions found.",
      actionType: "suggest_metadata",
      actionData: { suggestions }
    };
  }
}
