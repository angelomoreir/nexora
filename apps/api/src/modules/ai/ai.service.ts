import type {
  AIActionType,
  AIChatResponse,
  AIContextResourceType,
  AIContextualResponse,
  AIMessageDto,
  AIReportResponse,
  AIDocumentSummaryResponse,
  AIActionProposal,
  AIProposedList,
  AIProposedWorkflow,
  AIScaffoldApplyInput,
  AIScaffoldApplyResponse,
  AIScaffoldProposal,
  AIScaffoldSpec,
  FormFieldDefinition,
  FormFieldType,
  ListFieldType,
  SiteRole,
  WorkflowStepType
} from "@nexora/contracts";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { storage } from "../../services/storage/index.js";
import { getActor, requireDocument } from "../documents/document.service.js";
import { permissions, type PermissionKey } from "../permissions/permissions.js";
import { getSiteRole } from "../sites/site.service.js";
import type { ActorContext } from "../documents/document.service.js";
import type { AIContext, AIProvider, AIProviderResult } from "./ai-provider.js";
import { AI_COST_LIMITS } from "./ai-provider.js";
import { LocalAIProvider } from "./local-provider.js";
import { OpenAIProvider } from "./openai-provider.js";

// --- Provider registry ---
function createAIProvider(): AIProvider {
  if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    return new OpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_BASE_URL, env.OPENAI_MODEL);
  }
  return new LocalAIProvider();
}

let activeProvider: AIProvider = createAIProvider();

// Server-generated, user-facing strings (resource names, fallback messages)
// follow the organization's configured language instead of being hardcoded.
const AI_LOCALES: Record<string, { field: string; form: string; workflow: string; general: string; chatError: string }> = {
  "pt-PT": { field: "Campo", form: "Formulário", workflow: "Workflow", general: "Geral", chatError: "Ocorreu um erro ao processar o seu pedido. Por favor, tente novamente." },
  es: { field: "Campo", form: "Formulario", workflow: "Flujo de trabajo", general: "General", chatError: "Se ha producido un error al procesar la solicitud. Inténtalo de nuevo." },
  fr: { field: "Champ", form: "Formulaire", workflow: "Workflow", general: "Général", chatError: "Une erreur s'est produite lors du traitement de la demande. Veuillez réessayer." },
  de: { field: "Feld", form: "Formular", workflow: "Workflow", general: "Allgemein", chatError: "Bei der Verarbeitung der Anfrage ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut." },
  en: { field: "Field", form: "Form", workflow: "Workflow", general: "General", chatError: "An error occurred while processing your request. Please try again." }
};

async function aiStrings(organizationId: string) {
  const settings = await prisma.organizationSettings.findUnique({ where: { tenantId: organizationId }, select: { language: true } });
  const lang = AI_LOCALES[settings?.language ?? "pt-PT"] ? (settings?.language ?? "pt-PT") : "en";
  return { lang, ...AI_LOCALES[lang]! };
}

export function setAIProvider(provider: AIProvider) {
  activeProvider = provider;
}

export function getAIProvider(): AIProvider {
  return activeProvider;
}

// --- Cost tracking ---
async function checkCostLimits(tenantId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOps = await prisma.aIOperation.aggregate({
    where: { tenantId, createdAt: { gte: today }, success: true },
    _sum: { costUsd: true }
  });
  const spent = todayOps._sum.costUsd ?? 0;
  if (spent >= AI_COST_LIMITS.dailyLimitUsd) {
    throw new AppError(429, "AI_COST_LIMIT_EXCEEDED", `Daily AI cost limit ($${AI_COST_LIMITS.dailyLimitUsd}) has been reached.`);
  }
  // Check plan-level AI request limit
  const { checkLimit } = await import("../billing/plan.service.js");
  await checkLimit(tenantId, "ai");
}

async function logOperation(
  tenantId: string,
  userId: string,
  operation: string,
  result: AIProviderResult,
  durationMs: number,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await prisma.aIOperation.create({
    data: {
      tenantId,
      userId,
      operation,
      provider: activeProvider.name,
      model: activeProvider.model,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      costUsd: result.costUsd,
      durationMs,
      success,
      errorMessage
    }
  });
}

async function buildAIContext(actor: ActorContext): Promise<AIContext> {
  const [user, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } }),
    prisma.organizationSettings.findUnique({ where: { tenantId: actor.organizationId }, select: { language: true } })
  ]);
  return {
    organizationId: actor.organizationId,
    userId: actor.userId,
    userName: user.name,
    capabilities: actor.capabilities,
    language: settings?.language ?? "pt-PT"
  };
}

function toMessageDto(msg: {
  id: string;
  role: string;
  content: string;
  actionType: string | null;
  actionData: string | null;
  createdAt: Date;
}): AIMessageDto {
  let actionData: unknown = null;
  if (msg.actionData) {
    try { actionData = JSON.parse(msg.actionData); } catch { /* ignore */ }
  }
  return {
    id: msg.id,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    actionType: (msg.actionType ?? null) as AIActionType | null,
    actionData,
    createdAt: msg.createdAt.toISOString()
  };
}

// --- Chat ---
export async function chat(
  organizationId: string,
  userId: string,
  isSuperAdmin: boolean,
  message: string,
  conversationId?: string
): Promise<AIChatResponse> {
  await checkCostLimits(organizationId);
  const actor = await getActor(organizationId, userId, isSuperAdmin);
  const context = await buildAIContext(actor);
  const start = Date.now();

  let conversation = conversationId
    ? await prisma.aIConversation.findFirst({ where: { id: conversationId, tenantId: organizationId, userId } })
    : null;

  if (!conversation) {
    const title = message.slice(0, 60) + (message.length > 60 ? "..." : "");
    conversation = await prisma.aIConversation.create({
      data: { tenantId: organizationId, userId, title }
    });
  }

  // Save user message
  await prisma.aIMessage.create({
    data: { conversationId: conversation.id, role: "user", content: message }
  });

  let result: AIProviderResult;
  let success = true;
  let errorMessage: string | undefined;

  try {
    result = await activeProvider.chat(message, context);
  } catch (error) {
    success = false;
    errorMessage = error instanceof Error ? error.message : "Unknown error";
    result = {
      content: (await aiStrings(organizationId)).chatError,
      tokensInput: 0,
      tokensOutput: 0,
      costUsd: 0
    };
  }

  const durationMs = Date.now() - start;
  await logOperation(organizationId, userId, "chat", result, durationMs, success, errorMessage);

  // Save assistant message
  const assistantMessage = await prisma.aIMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: result.content,
      actionType: result.actionType ?? null,
      actionData: result.actionData ? JSON.stringify(result.actionData) : null,
      tokensUsed: result.tokensInput + result.tokensOutput,
      costUsd: result.costUsd
    }
  });

  await prisma.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  return {
    conversationId: conversation.id,
    message: toMessageDto(assistantMessage),
    usage: { tokensUsed: result.tokensInput + result.tokensOutput, costUsd: result.costUsd }
  };
}

// --- Document operations ---
async function getDocumentText(actor: ActorContext, documentId: string): Promise<{ name: string; text: string }> {
  // Enforce the same ACL as document downloads (folder inheritance, member/team/org grants).
  const document = await requireDocument(actor, documentId, "view");

  // Try to read text content from storage
  let text = "";
  try {
    if (document.storageKey && (await storage.exists(document.storageKey))) {
      const stream = await storage.get(document.storageKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      text = Buffer.concat(chunks).toString("utf-8").slice(0, 50000);
    }
  } catch { /* binary content */ }

  if (!text) text = `Document: ${document.name}. Type: ${document.mimeType ?? "unknown"}. Size: ${document.sizeBytes ?? 0} bytes.`;

  return { name: document.name, text };
}

export async function summarizeDocument(
  organizationId: string,
  userId: string,
  isSuperAdmin: boolean,
  documentId: string
): Promise<AIDocumentSummaryResponse> {
  await checkCostLimits(organizationId);
  const actor = await getActor(organizationId, userId, isSuperAdmin);
  const { name, text } = await getDocumentText(actor, documentId);
  const strings = await aiStrings(organizationId);
  const start = Date.now();

  const result = await activeProvider.summarize(text, name);
  await logOperation(organizationId, userId, "summarize", result, Date.now() - start, true);

  const actionData = result.actionData as { keywords?: string[]; classification?: string } | undefined;
  return {
    documentId,
    documentName: name,
    summary: result.content,
    keywords: actionData?.keywords ?? [],
    classification: actionData?.classification ?? strings.general,
    usage: { tokensUsed: result.tokensInput + result.tokensOutput, costUsd: result.costUsd }
  };
}

export async function qaDocument(
  organizationId: string,
  userId: string,
  isSuperAdmin: boolean,
  documentId: string,
  question: string
): Promise<{ answer: string; usage: { tokensUsed: number; costUsd: number } }> {
  await checkCostLimits(organizationId);
  const actor = await getActor(organizationId, userId, isSuperAdmin);
  const { text } = await getDocumentText(actor, documentId);
  const start = Date.now();

  const result = await activeProvider.qa(text, question);
  await logOperation(organizationId, userId, "qa", result, Date.now() - start, true);

  return { answer: result.content, usage: { tokensUsed: result.tokensInput + result.tokensOutput, costUsd: result.costUsd } };
}

export async function classifyDocument(
  organizationId: string,
  userId: string,
  isSuperAdmin: boolean,
  documentId: string
): Promise<{ classification: string; keywords: string[]; usage: { tokensUsed: number; costUsd: number } }> {
  await checkCostLimits(organizationId);
  const actor = await getActor(organizationId, userId, isSuperAdmin);
  const { name, text } = await getDocumentText(actor, documentId);
  const start = Date.now();

  const result = await activeProvider.classify(text, name);
  const keywordsResult = await activeProvider.keywords(text);
  await logOperation(organizationId, userId, "classify", result, Date.now() - start, true);

  const strings = await aiStrings(organizationId);
  const actionData = result.actionData as { classification?: string } | undefined;
  const keywordsData = keywordsResult.actionData as { keywords?: string[] } | undefined;
  return {
    classification: actionData?.classification ?? strings.general,
    keywords: keywordsData?.keywords ?? [],
    usage: { tokensUsed: result.tokensInput + result.tokensOutput + keywordsResult.tokensInput + keywordsResult.tokensOutput, costUsd: result.costUsd + keywordsResult.costUsd }
  };
}

// --- Contextual answers (read-only resource copilot) ---
const CONTEXTUAL_CAPABILITIES: Record<AIContextResourceType, PermissionKey> = {
  document: permissions.documentsView,
  task: permissions.tasksView,
  list: permissions.listsView,
  workflow: permissions.workflowsView
};

const CONTEXTUAL_NOT_FOUND: Record<AIContextResourceType, [string, string]> = {
  document: ["DOCUMENT_NOT_FOUND", "The document was not found."],
  task: ["TASK_NOT_FOUND", "The task was not found."],
  list: ["LIST_NOT_FOUND", "The list was not found."],
  workflow: ["WORKFLOW_NOT_FOUND", "The workflow was not found."]
};

const CONTEXTUAL_TEXT_LIMIT = 30000;

function safeJsonArray(raw: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function safeJsonObject(raw: string | null | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function contextValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function buildTaskContext(actor: ActorContext, resourceId: string): Promise<{ name: string; text: string }> {
  const task = await prisma.task.findFirst({
    where: { id: resourceId, tenantId: actor.organizationId },
    include: {
      assignedMembership: { include: { user: { select: { name: true } } } },
      assignedTeam: { select: { name: true } },
      project: { select: { name: true } },
      document: { select: { name: true } },
      creator: { select: { name: true } },
      comments: { take: 20, orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } }
    }
  });
  if (!task) throw new AppError(404, ...CONTEXTUAL_NOT_FOUND.task);
  const tags = safeJsonArray(task.tagsJson);
  const overdue = Boolean(task.dueAt && task.dueAt.getTime() < Date.now() && task.status !== "DONE" && task.status !== "CANCELLED");
  const lines = [
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : null,
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
    `Start date: ${task.startAt ? task.startAt.toISOString() : "none"}`,
    `Due date: ${task.dueAt ? task.dueAt.toISOString() : "none"}`,
    `Overdue: ${overdue ? "yes" : "no"}`,
    `Tags: ${tags.length ? tags.join(", ") : "none"}`,
    `Assignee: ${task.assignedMembership?.user.name ?? "unassigned"}`,
    `Assigned team: ${task.assignedTeam?.name ?? "none"}`,
    `Project: ${task.project?.name ?? "none"}`,
    `Linked document: ${task.document?.name ?? "none"}`,
    `Created by: ${task.creator.name}`,
    `Created at: ${task.createdAt.toISOString()}`,
    `Updated at: ${task.updatedAt.toISOString()}`
  ].filter((line): line is string => line !== null);
  if (task.comments.length === 0) {
    lines.push("Comments: none");
  } else {
    lines.push(`Comments (${task.comments.length} shown, newest first):`);
    for (const comment of task.comments) lines.push(`- ${comment.author.name} at ${comment.createdAt.toISOString()}: ${comment.body}`);
  }
  return { name: task.title, text: lines.join("\n") };
}

async function buildListContext(actor: ActorContext, resourceId: string): Promise<{ name: string; text: string }> {
  const list = await prisma.listDefinition.findFirst({
    where: { id: resourceId, tenantId: actor.organizationId },
    include: {
      fields: { orderBy: { order: "asc" } },
      items: { take: 25, orderBy: { createdAt: "desc" }, include: { creator: { select: { name: true } } } }
    }
  });
  if (!list) throw new AppError(404, ...CONTEXTUAL_NOT_FOUND.list);
  const totalItems = await prisma.listItem.count({ where: { tenantId: actor.organizationId, listDefinitionId: list.id } });
  const lines = [
    `List: ${list.name}`,
    list.description ? `Description: ${list.description}` : null,
    `Total records: ${totalItems}`,
    "Fields:"
  ].filter((line): line is string => line !== null);
  for (const field of list.fields) lines.push(`- ${field.name} (slug: ${field.slug}, type: ${field.type}${field.required ? ", required" : ""})`);
  if (list.items.length === 0) {
    lines.push("Records: none");
  } else {
    lines.push(`Latest records (${list.items.length} shown, newest first):`);
    for (const item of list.items) {
      const values = safeJsonObject(item.valuesJson);
      const rendered = list.fields.map((field) => `${field.name}: ${contextValue(values[field.slug])}`).join("; ");
      lines.push(`- ${rendered} — created by ${item.creator.name} at ${item.createdAt.toISOString()}`);
    }
  }
  return { name: list.name, text: lines.join("\n") };
}

async function buildWorkflowContext(actor: ActorContext, resourceId: string): Promise<{ name: string; text: string }> {
  const workflow = await prisma.workflowDefinition.findFirst({
    where: { id: resourceId, tenantId: actor.organizationId },
    include: {
      steps: { orderBy: { order: "asc" } },
      instances: {
        take: 20,
        orderBy: { startedAt: "desc" },
        include: {
          approvals: { select: { status: true } },
          stepExecutions: { orderBy: { stepOrder: "asc" } }
        }
      }
    }
  });
  if (!workflow) throw new AppError(404, ...CONTEXTUAL_NOT_FOUND.workflow);
  const totalInstances = await prisma.workflowInstance.count({ where: { tenantId: actor.organizationId, workflowDefinitionId: workflow.id } });
  const lines = [
    `Workflow: ${workflow.name}`,
    workflow.description ? `Description: ${workflow.description}` : null,
    `Status: ${workflow.status}`,
    `Version: ${workflow.version}`,
    "Steps:"
  ].filter((line): line is string => line !== null);
  for (const step of workflow.steps) lines.push(`- Step ${step.order}: ${step.name} (type: ${step.type}, config: ${JSON.stringify(safeJsonObject(step.configJson))})`);
  lines.push(`Total instances: ${totalInstances}`);
  if (workflow.instances.length === 0) {
    lines.push("Recent instances: none");
  } else {
    lines.push(`Recent instances (${workflow.instances.length} shown, newest first):`);
    for (const instance of workflow.instances) {
      const approvalCounts = new Map<string, number>();
      for (const approval of instance.approvals) approvalCounts.set(approval.status, (approvalCounts.get(approval.status) ?? 0) + 1);
      lines.push(`- Instance ${instance.id}: status ${instance.status}, current step ${instance.currentStepOrder}, started ${instance.startedAt.toISOString()}${instance.completedAt ? `, completed ${instance.completedAt.toISOString()}` : ", not completed"}${instance.errorMessage ? `, error: ${instance.errorMessage}` : ""}`);
      lines.push(`  Approvals: ${[...approvalCounts.entries()].map(([status, count]) => `${status}: ${count}`).join(", ") || "none"}`);
      for (const execution of instance.stepExecutions.filter((entry) => entry.status === "FAILED")) {
        lines.push(`  Failed step ${execution.stepOrder} "${execution.stepName}": ${execution.errorMessage ?? "unknown error"}`);
      }
    }
  }
  return { name: workflow.name, text: lines.join("\n") };
}

async function buildContextualResource(actor: ActorContext, resourceType: AIContextResourceType, resourceId: string): Promise<{ name: string; text: string }> {
  const required = CONTEXTUAL_CAPABILITIES[resourceType];
  if (!actor.isSuperAdmin && !actor.capabilities.has(required)) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to view this resource.");
  }
  const resource = resourceType === "document"
    ? await getDocumentText(actor, resourceId)
    : resourceType === "task"
      ? await buildTaskContext(actor, resourceId)
      : resourceType === "list"
        ? await buildListContext(actor, resourceId)
        : await buildWorkflowContext(actor, resourceId);
  return { name: resource.name, text: resource.text.slice(0, CONTEXTUAL_TEXT_LIMIT) };
}

export async function contextualAnswer(
  organizationId: string,
  userId: string,
  isSuperAdmin: boolean,
  input: { resourceType: AIContextResourceType; resourceId: string; prompt: string }
): Promise<AIContextualResponse> {
  await checkCostLimits(organizationId);
  const actor = await getActor(organizationId, userId, isSuperAdmin);
  const resource = await buildContextualResource(actor, input.resourceType, input.resourceId);
  const start = Date.now();
  const result = await activeProvider.qa(resource.text, input.prompt);
  await logOperation(organizationId, userId, `contextual_${input.resourceType}`, result, Date.now() - start, true);
  return { resourceType: input.resourceType, resourceId: input.resourceId, resourceName: resource.name, answer: result.content, usage: { tokensUsed: result.tokensInput + result.tokensOutput, costUsd: result.costUsd } };
}

// --- List & Workflow proposals ---
export async function proposeList(
  organizationId: string,
  userId: string,
  isSuperAdmin: boolean,
  description: string
): Promise<AIActionProposal> {
  await checkCostLimits(organizationId);
  const actor = await getActor(organizationId, userId, isSuperAdmin);
  const context = await buildAIContext(actor);
  const start = Date.now();

  const result = await activeProvider.proposeList(description, context.language);
  await logOperation(organizationId, userId, "create_list", result, Date.now() - start, true);

  return {
    type: "create_list",
    list: result.actionData as AIProposedList,
    explanation: result.content
  };
}

export async function proposeWorkflow(
  organizationId: string,
  userId: string,
  isSuperAdmin: boolean,
  description: string
): Promise<AIActionProposal> {
  await checkCostLimits(organizationId);
  const actor = await getActor(organizationId, userId, isSuperAdmin);
  const context = await buildAIContext(actor);
  const start = Date.now();

  const result = await activeProvider.proposeWorkflow(description, context.language);
  await logOperation(organizationId, userId, "create_workflow", result, Date.now() - start, true);

  return {
    type: "create_workflow",
    workflow: result.actionData as AIProposedWorkflow,
    explanation: result.content
  };
}

// --- No-code app scaffold (list + form + workflow + page) ---
export async function proposeApp(
  organizationId: string,
  userId: string,
  isSuperAdmin: boolean,
  description: string
): Promise<AIScaffoldProposal> {
  await checkCostLimits(organizationId);
  await getActor(organizationId, userId, isSuperAdmin);
  const start = Date.now();

  if (!activeProvider.proposeApp) {
    throw new AppError(400, "AI_UNSUPPORTED", "The active AI provider does not support app scaffolding.");
  }
  const result = await activeProvider.proposeApp(description, (await aiStrings(organizationId)).lang);
  await logOperation(organizationId, userId, "create_app", result, Date.now() - start, true);

  return {
    type: "create_app",
    spec: result.actionData as AIScaffoldSpec,
    explanation: result.content
  };
}

const ALLOWED_LIST_TYPES = new Set<string>(["text", "longtext", "number", "currency", "date", "datetime", "boolean", "choice", "email", "url", "user", "relation", "file"]);
const ALLOWED_FORM_TYPES = new Set<string>(["text", "longtext", "number", "currency", "email", "phone", "date", "select", "radio", "checkbox", "upload", "heading", "separator"]);
const ALLOWED_STEP_TYPES = new Set<string>(["START", "CREATE_TASK", "SEND_NOTIFICATION", "SEND_EMAIL", "APPROVAL", "CHANGE_STATUS", "ASSIGN_USER", "CHANGE_FIELD", "MOVE_DOCUMENT", "CONDITION", "END"]);

function safeSlug(value: string, fallback: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

async function uniqueName(kind: "list" | "form" | "workflow", tenantId: string, base: string): Promise<string> {
  const table = kind === "list" ? prisma.listDefinition : kind === "form" ? prisma.formDefinition : prisma.workflowDefinition;
  for (let attempt = 0; attempt < 10; attempt++) {
    const name = attempt === 0 ? base : `${base} (${attempt + 1})`;
    const existing = await (table as typeof prisma.listDefinition).findFirst({ where: { tenantId, name } });
    if (!existing) return name;
  }
  return `${base} (${Date.now().toString(36)})`;
}

export async function applyScaffold(
  organizationId: string,
  userId: string,
  isSuperAdmin: boolean,
  input: AIScaffoldApplyInput
): Promise<AIScaffoldApplyResponse> {
  const actor = await getActor(organizationId, userId, isSuperAdmin);
  const spec = input.spec;
  const siteId = input.siteId ?? null;

  // Applying a scaffold publishes a list, a form and a workflow (and optionally a
  // site page) — the actor needs the matching manage capabilities, not just membership.
  const requiredCapabilities: PermissionKey[] = [permissions.listsManage, permissions.formsManage, permissions.workflowsManage];
  if (siteId && spec.page) requiredCapabilities.push(permissions.pagesManage);
  if (!actor.isSuperAdmin && requiredCapabilities.some((key) => !actor.capabilities.has(key))) {
    throw new AppError(403, "FORBIDDEN", "You need permission to manage lists, forms and workflows to apply a generated scaffold.");
  }

  if (siteId) {
    const site = await prisma.site.findFirst({ where: { id: siteId, tenantId: organizationId } });
    if (!site) throw new AppError(404, "SITE_NOT_FOUND", "The site was not found.");
    const role = await getSiteRole(actor as never, site);
    const rank: Record<SiteRole, number> = { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, MANAGER: 4, ADMIN: 5 };
    if (!role || rank[role] < rank.EDITOR) {
      throw new AppError(403, "FORBIDDEN", "You need at least the Editor role on the site to publish generated content.");
    }
  }

  const strings = await aiStrings(organizationId);
  const listFields = (spec.list?.fields ?? []).slice(0, 100).map((field, index) => ({
    tenantId: organizationId,
    name: String(field.name ?? `${strings.field} ${index + 1}`).slice(0, 120),
    slug: safeSlug(String(field.slug ?? field.name ?? ""), `field-${index + 1}`),
    type: (ALLOWED_LIST_TYPES.has(field.type) ? field.type : "text") as ListFieldType,
    required: Boolean(field.required),
    order: index
  }));
  // Ensure unique slugs
  const seenSlugs = new Set<string>();
  for (const field of listFields) {
    let slug = field.slug;
    let counter = 2;
    while (seenSlugs.has(slug)) slug = `${field.slug}-${counter++}`;
    field.slug = slug;
    seenSlugs.add(slug);
  }

  const listName = await uniqueName("list", organizationId, spec.list?.name || spec.name);
  const formName = await uniqueName("form", organizationId, spec.form?.name || `${strings.form} — ${spec.name}`);
  const workflowName = await uniqueName("workflow", organizationId, spec.workflow?.name || `${strings.workflow} — ${spec.name}`);

  const list = await prisma.listDefinition.create({
    data: {
      tenantId: organizationId,
      siteId,
      name: listName,
      description: spec.list?.description ?? spec.description ?? null,
      icon: "sparkles",
      createdById: userId,
      fields: { create: listFields }
    }
  });

  const formFields: FormFieldDefinition[] = (spec.form?.fields ?? []).slice(0, 100).map((field, index) => ({
    id: safeSlug(field.label, `field-${index + 1}`),
    type: (ALLOWED_FORM_TYPES.has(field.type) ? field.type : "text") as FormFieldType,
    label: String(field.label ?? `${strings.field} ${index + 1}`).slice(0, 120),
    required: Boolean(field.required),
    options: field.options ?? null,
    order: index
  }));

  const form = await prisma.formDefinition.create({
    data: {
      tenantId: organizationId,
      siteId,
      name: formName,
      description: spec.description ?? null,
      schemaJson: JSON.stringify(formFields),
      status: "PUBLISHED",
      createdById: userId
    }
  });

  const workflowSteps = (spec.workflow?.steps ?? []).slice(0, 50).map((step, index) => ({
    tenantId: organizationId,
    order: typeof step.order === "number" ? step.order : index,
    type: (ALLOWED_STEP_TYPES.has(step.type) ? step.type : "SEND_NOTIFICATION") as WorkflowStepType,
    name: String(step.name ?? `Passo ${index + 1}`).slice(0, 120),
    configJson: JSON.stringify(step.config ?? {})
  }));

  const workflow = await prisma.workflowDefinition.create({
    data: {
      tenantId: organizationId,
      siteId,
      name: workflowName,
      description: spec.workflow?.description ?? spec.description ?? null,
      definitionJson: JSON.stringify({ steps: workflowSteps.map((s) => ({ order: s.order, type: s.type, name: s.name, config: JSON.parse(s.configJson) as Record<string, unknown> })) }),
      status: "PUBLISHED",
      createdById: userId,
      steps: { create: workflowSteps }
    }
  });

  let page: { id: string; title: string; siteId: string } | null = null;
  if (siteId && spec.page) {
    const widgets = (spec.page.widgets ?? []).slice(0, 50).map((widget, index) => ({
      id: String(widget.id ?? `w${index}`),
      type: String(widget.type ?? "text"),
      props: { ...(widget.props ?? {}), ...(widget.type === "list" ? { listId: list.id } : {}) }
    }));
    const created = await prisma.sitePage.create({
      data: {
        tenantId: organizationId,
        siteId,
        title: String(spec.page.title ?? spec.name).slice(0, 200),
        slug: `ai-${Date.now().toString(36)}`,
        widgetsJson: JSON.stringify(widgets),
        status: "PUBLISHED",
        createdById: userId
      }
    });
    page = { id: created.id, title: created.title, siteId };
  }

  await prisma.auditLog.create({
    data: {
      tenantId: organizationId,
      actorId: actor.membershipId,
      action: "ai.scaffold_applied",
      resourceType: "ListDefinition",
      resourceId: list.id,
      contextJson: JSON.stringify({ name: spec.name, form: form.id, workflow: workflow.id, page: page?.id ?? null, siteId })
    }
  });

  return {
    list: { id: list.id, name: list.name },
    form: { id: form.id, name: form.name },
    workflow: { id: workflow.id, name: workflow.name },
    page
  };
}

// --- Reports ---
export async function generateReport(
  organizationId: string,
  userId: string,
  isSuperAdmin: boolean,
  prompt: string
): Promise<AIReportResponse> {
  await checkCostLimits(organizationId);
  const actor = await getActor(organizationId, userId, isSuperAdmin);
  const context = await buildAIContext(actor);
  const start = Date.now();

  const result = await activeProvider.report(prompt, context);
  await logOperation(organizationId, userId, "report", result, Date.now() - start, true);

  const actionData = result.actionData as { sections?: { heading: string; body: string; data?: unknown }[] } | undefined;
  return {
    title: prompt.slice(0, 100),
    summary: result.content,
    sections: actionData?.sections ?? [],
    usage: { tokensUsed: result.tokensInput + result.tokensOutput, costUsd: result.costUsd }
  };
}

// --- Conversation management ---
export async function listConversations(organizationId: string, userId: string): Promise<{ id: string; title: string; createdAt: string; updatedAt: string }[]> {
  const conversations = await prisma.aIConversation.findMany({
    where: { tenantId: organizationId, userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, createdAt: true, updatedAt: true }
  });
  return conversations.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString()
  }));
}

export async function getConversation(organizationId: string, userId: string, conversationId: string): Promise<{ id: string; title: string; messages: AIMessageDto[]; createdAt: string; updatedAt: string } | null> {
  const conversation = await prisma.aIConversation.findFirst({
    where: { id: conversationId, tenantId: organizationId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } }
  });
  if (!conversation) return null;
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map(toMessageDto),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString()
  };
}
