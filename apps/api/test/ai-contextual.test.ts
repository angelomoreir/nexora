import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import type { AIProvider, AIProviderResult } from "../src/modules/ai/ai-provider.js";
import { getAIProvider, setAIProvider } from "../src/modules/ai/ai.service.js";
import { LocalAIProvider } from "../src/modules/ai/local-provider.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `ctx-admin-${marker}@example.com`;
const viewerEmail = `ctx-viewer-${marker}@example.com`;
const foreignEmail = `ctx-foreign-${marker}@example.com`;
const organizationIds: string[] = [];
const userEmails = [adminEmail, viewerEmail, foreignEmail];

class CapturingProvider extends LocalAIProvider {
  captured: { text: string; question: string }[] = [];

  override async qa(text: string, question: string): Promise<AIProviderResult> {
    this.captured.push({ text, question });
    return { content: `CAPTURED-ANSWER: ${question}`, tokensInput: 10, tokensOutput: 5, costUsd: 0 };
  }
}

const capturingProvider = new CapturingProvider();
let previousProvider: AIProvider;

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => {
  await app.ready();
  previousProvider = getAIProvider();
  setAIProvider(capturingProvider);
});

after(async () => {
  setAIProvider(previousProvider);
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
  await app.close();
  await prisma.$disconnect();
});

test("contextual copilot answers task/list/workflow questions with server-built context", async () => {
  // --- Setup: organization with admin and viewer ---
  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Ctx Admin", email: adminEmail, password: "CtxPassword123", organizationName: "Ctx Org" }
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const addViewer = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/users`,
    headers: { cookie: adminCookies },
    payload: { name: "Ctx Viewer", email: viewerEmail, password: "CtxPassword123", role: "Viewer" }
  });
  assert.equal(addViewer.statusCode, 201, addViewer.body);
  const viewerLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: viewerEmail, password: "CtxPassword123" }
  });
  assert.equal(viewerLogin.statusCode, 200);
  const viewerCookies = cookies(viewerLogin);

  // --- Create a task with distinctive data ---
  const taskTitle = `Probe task ${marker}`;
  const createTask = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/tasks`,
    headers: { cookie: adminCookies },
    payload: { title: taskTitle, description: `Distinctive description ${marker}`, priority: "HIGH" }
  });
  assert.equal(createTask.statusCode, 201, createTask.body);
  const taskId = createTask.json().id as string;

  // --- Create a list with one item ---
  const listName = `Probe list ${marker}`;
  const itemValue = `Item-${marker}`;
  const createList = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/lists`,
    headers: { cookie: adminCookies },
    payload: {
      name: listName,
      description: "List for contextual test",
      fields: [{ name: "Nome", slug: "nome", type: "text", required: true, order: 0 }]
    }
  });
  assert.equal(createList.statusCode, 201, createList.body);
  const listId = createList.json().id as string;
  const createItem = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/lists/${listId}/items`,
    headers: { cookie: adminCookies },
    payload: { values: { nome: itemValue } }
  });
  assert.equal(createItem.statusCode, 201, createItem.body);

  // --- Create a workflow with steps and a started instance ---
  const workflowName = `Probe workflow ${marker}`;
  const createWorkflow = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/workflows`,
    headers: { cookie: adminCookies },
    payload: {
      name: workflowName,
      description: "Workflow for contextual test",
      steps: [
        { order: 0, type: "START", name: "Iniciar", config: {} },
        { order: 1, type: "END", name: "Terminar", config: {} }
      ]
    }
  });
  assert.equal(createWorkflow.statusCode, 201, createWorkflow.body);
  const workflowId = createWorkflow.json().id as string;
  const publish = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflowId}/publish`, headers: { cookie: adminCookies } });
  assert.equal(publish.statusCode, 200, publish.body);
  const start = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflowId}/start`, headers: { cookie: adminCookies }, payload: { input: { origem: marker } } });
  assert.equal(start.statusCode, 201, start.body);

  const contextual = (cookie: string, payload: Record<string, unknown>, org = organizationId) =>
    app.inject({ method: "POST", url: `/api/v1/organizations/${org}/ai/contextual`, headers: { cookie }, payload });

  // --- Admin: task ---
  const taskAnswer = await contextual(adminCookies, { resourceType: "task", resourceId: taskId, prompt: "Resume esta tarefa" });
  assert.equal(taskAnswer.statusCode, 200, taskAnswer.body);
  const taskData = taskAnswer.json();
  assert.equal(taskData.resourceType, "task");
  assert.equal(taskData.resourceId, taskId);
  assert.equal(taskData.resourceName, taskTitle);
  assert.equal(taskData.answer, "CAPTURED-ANSWER: Resume esta tarefa");
  assert.equal(taskData.usage.tokensUsed, 15);
  const taskCapture = capturingProvider.captured.at(-1)!;
  assert.equal(taskCapture.question, "Resume esta tarefa");
  assert.ok(taskCapture.text.includes(taskTitle), "task context should include the title");
  assert.ok(taskCapture.text.includes(`Distinctive description ${marker}`), "task context should include the description");
  assert.ok(taskCapture.text.includes("HIGH"), "task context should include the priority");

  // --- Admin: list ---
  const listAnswer = await contextual(adminCookies, { resourceType: "list", resourceId: listId, prompt: "Que registos existem?" });
  assert.equal(listAnswer.statusCode, 200, listAnswer.body);
  const listData = listAnswer.json();
  assert.equal(listData.resourceType, "list");
  assert.equal(listData.resourceId, listId);
  assert.equal(listData.resourceName, listName);
  assert.ok(listData.answer.length > 0);
  assert.ok(listData.usage.tokensUsed > 0);
  const listCapture = capturingProvider.captured.at(-1)!;
  assert.ok(listCapture.text.includes(listName), "list context should include the name");
  assert.ok(listCapture.text.includes(itemValue), "list context should include the item values");
  assert.ok(listCapture.text.includes("nome"), "list context should include the field slug");

  // --- Admin: workflow ---
  const workflowAnswer = await contextual(adminCookies, { resourceType: "workflow", resourceId: workflowId, prompt: "Como está este processo?" });
  assert.equal(workflowAnswer.statusCode, 200, workflowAnswer.body);
  const workflowData = workflowAnswer.json();
  assert.equal(workflowData.resourceType, "workflow");
  assert.equal(workflowData.resourceId, workflowId);
  assert.equal(workflowData.resourceName, workflowName);
  assert.ok(workflowData.answer.length > 0);
  const workflowCapture = capturingProvider.captured.at(-1)!;
  assert.ok(workflowCapture.text.includes(workflowName), "workflow context should include the name");
  assert.ok(workflowCapture.text.includes("Iniciar"), "workflow context should include step names");
  assert.ok(workflowCapture.text.includes("Recent instances"), "workflow context should include instance data");

  // --- Viewer: can ask about resources covered by view capabilities ---
  const viewerTaskAnswer = await contextual(viewerCookies, { resourceType: "task", resourceId: taskId, prompt: "Estado atual?" });
  assert.equal(viewerTaskAnswer.statusCode, 200, viewerTaskAnswer.body);
  assert.equal(viewerTaskAnswer.json().resourceName, taskTitle);
  const viewerListAnswer = await contextual(viewerCookies, { resourceType: "list", resourceId: listId, prompt: "Quantos registos?" });
  assert.equal(viewerListAnswer.statusCode, 200, viewerListAnswer.body);
  const viewerWorkflowAnswer = await contextual(viewerCookies, { resourceType: "workflow", resourceId: workflowId, prompt: "Que passos tem?" });
  assert.equal(viewerWorkflowAnswer.statusCode, 200, viewerWorkflowAnswer.body);

  // --- Cross-tenant isolation ---
  const foreignRegistration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Foreign Admin", email: foreignEmail, password: "CtxPassword123", organizationName: "Foreign Org" }
  });
  assert.equal(foreignRegistration.statusCode, 201, foreignRegistration.body);
  const foreignOrgId = foreignRegistration.json().organizations[0].id as string;
  organizationIds.push(foreignOrgId);
  const foreignCookies = cookies(foreignRegistration);
  const foreignTaskTitle = `Foreign secret task ${marker}`;
  const createForeignTask = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${foreignOrgId}/tasks`,
    headers: { cookie: foreignCookies },
    payload: { title: foreignTaskTitle }
  });
  assert.equal(createForeignTask.statusCode, 201, createForeignTask.body);
  const foreignTaskId = createForeignTask.json().id as string;

  const captureCountBefore = capturingProvider.captured.length;
  const crossTenant = await contextual(adminCookies, { resourceType: "task", resourceId: foreignTaskId, prompt: "Resume esta tarefa" });
  assert.equal(crossTenant.statusCode, 404, "foreign resource must return 404");
  assert.equal(capturingProvider.captured.length, captureCountBefore, "provider must not be called for foreign resources");
  assert.ok(!capturingProvider.captured.some((entry) => entry.text.includes(foreignTaskTitle)), "foreign content must never reach the provider");

  // --- Validation ---
  const missingPrompt = await contextual(adminCookies, { resourceType: "task", resourceId: taskId });
  assert.equal(missingPrompt.statusCode, 400);
  const shortPrompt = await contextual(adminCookies, { resourceType: "task", resourceId: taskId, prompt: "hi" });
  assert.equal(shortPrompt.statusCode, 400);
  const badType = await contextual(adminCookies, { resourceType: "project", resourceId: taskId, prompt: "Resume isto" });
  assert.equal(badType.statusCode, 400);

  // --- Operation logging ---
  const operations = await prisma.aIOperation.findMany({ where: { tenantId: organizationId, operation: { startsWith: "contextual_" } }, select: { operation: true } });
  const operationNames = new Set(operations.map((entry) => entry.operation));
  assert.ok(operationNames.has("contextual_task"), "should log contextual_task");
  assert.ok(operationNames.has("contextual_list"), "should log contextual_list");
  assert.ok(operationNames.has("contextual_workflow"), "should log contextual_workflow");
});

test("local provider produces grounded answers for structured task context", async () => {
  const provider = new LocalAIProvider();
  const structuredTask = [
    `Task: Release checklist ${marker}`,
    "Description: Fechar a release trimestral",
    "Status: TODO",
    "Priority: HIGH",
    "Start date: none",
    "Due date: none",
    "Overdue: no",
    "Tags: release",
    "Assignee: unassigned",
    "Assigned team: none",
    "Project: none",
    "Linked document: none",
    "Created by: Ctx Admin",
    "Comments: none"
  ].join("\n");

  const prompts = [
    "Resuma a informação mais importante deste recurso.",
    "Identifique riscos, bloqueios e pontos que precisam de atenção.",
    "Sugira os próximos passos mais úteis.",
    "Que informação importante parece estar em falta?"
  ];

  const results = await Promise.all(prompts.map((prompt) => provider.qa(structuredTask, prompt)));
  for (const result of results) {
    assert.ok(result.content.trim().length > 0, "structured answers must be non-empty");
    assert.ok(!result.content.includes("Não foi possível encontrar uma resposta direta"), `should not return the generic fallback: ${result.content}`);
    assert.ok(result.tokensInput > 0 && result.tokensOutput > 0, "should report token usage");
  }
  assert.ok(results[0]!.content.includes(`Release checklist ${marker}`), "summary must include the resource name");
  assert.ok(results[1]!.content.includes("HIGH"), "risks should surface the HIGH priority evidence");
  assert.ok(results[3]!.content.toLowerCase().includes("unassigned") || results[3]!.content.includes("none"), "missing info should surface unassigned/none lines");
});
