import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `ai-admin-${marker}@example.com`;
const viewerEmail = `ai-viewer-${marker}@example.com`;
const organizationIds: string[] = [];
const userEmails = [adminEmail, viewerEmail];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

async function multipart(filename: string, mimeType: string, content: Uint8Array) {
  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(content).buffer], { type: mimeType }), filename);
  const request = new Request("http://localhost", { method: "POST", body: form });
  return { payload: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get("content-type")! };
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
  await app.close();
  await prisma.$disconnect();
});

test("AI assistant: chat, document ops, list/workflow proposals, reports, cost tracking", async () => {
  // --- Setup ---
  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "AI Admin", email: adminEmail, password: "AiPassword123", organizationName: "AI Org" }
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const addViewer = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/users`,
    headers: { cookie: adminCookies },
    payload: { name: "AI Viewer", email: viewerEmail, password: "AiPassword123", role: "Viewer" }
  });
  assert.equal(addViewer.statusCode, 201);
  const viewerLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: viewerEmail, password: "AiPassword123" }
  });
  assert.equal(viewerLogin.statusCode, 200);
  const viewerCookies = cookies(viewerLogin);

  // --- Chat: general greeting ---
  const chat1 = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/ai/chat`,
    headers: { cookie: adminCookies },
    payload: { message: "Olá, o que podes fazer?" }
  });
  assert.equal(chat1.statusCode, 200, chat1.body);
  const chat1Data = chat1.json();
  assert.ok(chat1Data.conversationId, "Should return a conversation ID");
  assert.ok(chat1Data.message.content.length > 0, "Should return content");
  assert.equal(chat1Data.message.role, "assistant");
  assert.ok(chat1Data.usage.tokensUsed >= 0, "Should track token usage");

  // --- Chat: task query ---
  // Create a task first
  const createTask = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/tasks`,
    headers: { cookie: adminCookies },
    payload: { title: "Tarefa de teste para IA" }
  });
  assert.equal(createTask.statusCode, 201);

  const chat2 = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/ai/chat`,
    headers: { cookie: adminCookies },
    payload: { message: "Quais são as tarefas pendentes?", conversationId: chat1Data.conversationId }
  });
  assert.equal(chat2.statusCode, 200, chat2.body);
  assert.ok(chat2.json().message.content.includes("Tarefa de teste"), "Should find the pending task");

  // --- Chat: conversation history ---
  const getConversation = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/ai/conversations/${chat1Data.conversationId}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(getConversation.statusCode, 200);
  assert.ok(getConversation.json().messages.length >= 2, "Should have at least 2 messages");

  // --- List conversations ---
  const listConversations = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/ai/conversations`,
    headers: { cookie: adminCookies }
  });
  assert.equal(listConversations.statusCode, 200);
  assert.ok(listConversations.json().length >= 1, "Should have at least 1 conversation");

  // --- Propose list ---
  const proposeList = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/ai/propose-list`,
    headers: { cookie: adminCookies },
    payload: { description: "Cria uma lista de Clientes com Nome, NIF, Email, Telefone e Estado" }
  });
  assert.equal(proposeList.statusCode, 200, proposeList.body);
  const listProposal = proposeList.json();
  assert.equal(listProposal.type, "create_list");
  assert.ok(listProposal.list, "Should have a proposed list");
  assert.equal(listProposal.list.name, "Clientes");
  assert.ok(listProposal.list.fields.length >= 4, "Should have at least 4 fields");
  const fieldNames = listProposal.list.fields.map((f: { name: string }) => f.name);
  assert.ok(fieldNames.includes("Nome"), "Should include Nome field");
  assert.ok(fieldNames.includes("Nif") || fieldNames.includes("NIF"), "Should include NIF field");
  assert.ok(fieldNames.includes("Email"), "Should include Email field");
  assert.ok(fieldNames.includes("Telefone"), "Should include Telefone field");
  assert.ok(fieldNames.includes("Estado"), "Should include Estado field");

  // --- Propose workflow ---
  const proposeWorkflow = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/ai/propose-workflow`,
    headers: { cookie: adminCookies },
    payload: { description: "Cria um processo para aprovar despesas superiores a 1.000 euros" }
  });
  assert.equal(proposeWorkflow.statusCode, 200, proposeWorkflow.body);
  const wfProposal = proposeWorkflow.json();
  assert.equal(wfProposal.type, "create_workflow");
  assert.ok(wfProposal.workflow, "Should have a proposed workflow");
  assert.ok(wfProposal.workflow.steps.length >= 3, "Should have at least 3 steps");
  const stepTypes = wfProposal.workflow.steps.map((s: { type: string }) => s.type);
  assert.ok(stepTypes.includes("START"), "Should have START step");
  assert.ok(stepTypes.includes("END"), "Should have END step");
  assert.ok(stepTypes.includes("APPROVAL"), "Should have APPROVAL step");
  assert.ok(stepTypes.includes("CONDITION"), "Should have CONDITION step for value check");

  // --- Report ---
  const report = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/ai/report`,
    headers: { cookie: adminCookies },
    payload: { prompt: "Faz um resumo das tarefas concluídas este mês" }
  });
  assert.equal(report.statusCode, 200, report.body);
  const reportData = report.json();
  assert.ok(reportData.summary.length > 0, "Should have summary");
  assert.ok(reportData.sections.length > 0, "Should have sections");
  assert.ok(reportData.sections.some((s: { heading: string }) => s.heading === "Tarefas"), "Should have tasks section");

  // --- Document operations ---
  // Upload a text document
  const uploadBody = await multipart("contrato-teste.txt", "text/plain", new TextEncoder().encode("Este é um contrato de prestação de serviços entre a Empresa X e o Cliente Y. O valor do contrato é de 5000 euros. O prazo de execução é de 30 dias. A empresa X compromete-se a entregar o software acordado. O cliente Y pagará em três prestações."));
  const upload = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/documents`,
    headers: { cookie: adminCookies, "content-type": uploadBody.contentType },
    payload: uploadBody.payload
  });
  assert.equal(upload.statusCode, 201, upload.body);
  const documentId = upload.json().document.id;

  // Summarize document
  const summarize = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/ai/documents/${documentId}/summarize`,
    headers: { cookie: adminCookies }
  });
  assert.equal(summarize.statusCode, 200, summarize.body);
  const summary = summarize.json();
  assert.equal(summary.documentId, documentId);
  assert.ok(summary.summary.length > 0, "Should have a summary");
  assert.ok(summary.keywords.length > 0, "Should have keywords");
  assert.ok(summary.classification.length > 0, "Should have classification");

  // QA on document
  const qa = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/ai/documents/${documentId}/qa`,
    headers: { cookie: adminCookies },
    payload: { question: "Qual é o valor do contrato?" }
  });
  assert.equal(qa.statusCode, 200, qa.body);
  assert.ok(qa.json().answer.length > 0, "Should have an answer");

  // Classify document
  const classify = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/ai/documents/${documentId}/classify`,
    headers: { cookie: adminCookies }
  });
  assert.equal(classify.statusCode, 200, classify.body);
  assert.ok(classify.json().classification.length > 0, "Should have classification");
  assert.ok(classify.json().keywords.length > 0, "Should have keywords");

  // --- Usage stats ---
  const usage = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/ai/usage`,
    headers: { cookie: adminCookies }
  });
  assert.equal(usage.statusCode, 200);
  assert.ok(usage.json().today.requests >= 5, "Should have tracked today's requests");
  assert.ok(usage.json().total.requests >= 5, "Should have tracked total requests");

  // --- Cross-organization isolation: viewer in org1 cannot access org2's conversations ---
  const secondOrgReg = await app.inject({
    method: "POST",
    url: "/api/v1/organizations",
    headers: { cookie: adminCookies },
    payload: { name: "AI Second Org" }
  });
  assert.equal(secondOrgReg.statusCode, 201);
  const secondOrgId = secondOrgReg.json().id;
  organizationIds.push(secondOrgId);

  // Admin's conversation from org1 should not be accessible in org2
  const crossOrgConversation = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${secondOrgId}/ai/conversations/${chat1Data.conversationId}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(crossOrgConversation.statusCode, 404, "Should not find org1 conversation in org2");

  // --- Document access: viewer cannot summarize a document they don't have access to ---
  // (The viewer has no direct permission to the admin's document)
  // First, let's create a document with restricted sharing
  const restrictedUploadBody = await multipart("restrito.txt", "text/plain", new TextEncoder().encode("Documento restrito"));
  const restrictedUpload = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/documents`,
    headers: { cookie: adminCookies, "content-type": restrictedUploadBody.contentType },
    payload: restrictedUploadBody.payload
  });
  assert.equal(restrictedUpload.statusCode, 201);
  const restrictedDocId = restrictedUpload.json().document.id;

  // Share with admin only (restrict)
  const share = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/documents/${restrictedDocId}/shares`,
    headers: { cookie: adminCookies },
    payload: { targetType: "USER", targetId: addViewer.json().memberId, permission: "READ" }
  });
  assert.equal(share.statusCode, 204);

  // Remove the share so viewer has no access
  // Actually, the viewer was just given access. Let's test with a different document that has NO shares.
  // The first document (contrato-teste.txt) has no shares, so it's open access to all org members.
  // Let's create one with a share to admin only (not viewer)
  // Get admin's membership ID from the users list
  const adminUsers = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/users`,
    headers: { cookie: adminCookies }
  });
  const adminMember = adminUsers.json().find((u: { email: string }) => u.email === adminEmail);
  const adminMembershipId = adminMember.memberId;
  const privateUploadBody = await multipart("privado.txt", "text/plain", new TextEncoder().encode("Documento privado do admin"));
  const privateUpload = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/documents`,
    headers: { cookie: adminCookies, "content-type": privateUploadBody.contentType },
    payload: privateUploadBody.payload
  });
  assert.equal(privateUpload.statusCode, 201);
  const privateDocId = privateUpload.json().document.id;

  // Share with admin membership only (not viewer)
  const privateShare = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/documents/${privateDocId}/shares`,
    headers: { cookie: adminCookies },
    payload: { targetType: "USER", targetId: adminMembershipId, permission: "READ" }
  });
  assert.equal(privateShare.statusCode, 204);

  // Viewer should not be able to summarize the private document
  const viewerSummarize = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/ai/documents/${privateDocId}/summarize`,
    headers: { cookie: viewerCookies }
  });
  assert.equal(viewerSummarize.statusCode, 403, "Viewer should not access private document via AI");

  // Admin should be able to summarize it
  const adminSummarize = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/ai/documents/${privateDocId}/summarize`,
    headers: { cookie: adminCookies }
  });
  assert.equal(adminSummarize.statusCode, 200, "Admin should access own private document via AI");
});
