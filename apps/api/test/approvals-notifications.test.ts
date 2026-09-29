import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `an-admin-${marker}@example.com`;
const memberEmail = `an-member-${marker}@example.com`;
const approverEmail = `an-approver-${marker}@example.com`;
const viewerEmail = `an-viewer-${marker}@example.com`;
const organizationIds: string[] = [];
const userEmails = [adminEmail, memberEmail, approverEmail, viewerEmail];

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

test("notifications and approvals: all events fire, approvals support comments and delegation", async () => {
  // --- Setup: register organization with admin ---
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Admin User", email: adminEmail, password: "AnPassword123", organizationName: "AN Organization" } });
  assert.equal(registration.statusCode, 201, registration.body);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  // --- Add members ---
  const addMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Member User", email: memberEmail, password: "AnPassword123", role: "Member" } });
  assert.equal(addMember.statusCode, 201, addMember.body);
  const memberMembershipId = addMember.json().memberId as string;

  const addApprover = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Approver User", email: approverEmail, password: "AnPassword123", role: "Member" } });
  assert.equal(addApprover.statusCode, 201, addApprover.body);
  const approverMembershipId = addApprover.json().memberId as string;

  const addViewer = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Viewer User", email: viewerEmail, password: "AnPassword123", role: "Viewer" } });
  assert.equal(addViewer.statusCode, 201, addViewer.body);

  const memberLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: memberEmail, password: "AnPassword123" } });
  const memberCookies = cookies(memberLogin);
  const approverLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: approverEmail, password: "AnPassword123" } });
  const approverCookies = cookies(approverLogin);

  // --- Event 1: task.assigned ---
  const createTask = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/tasks`, headers: { cookie: adminCookies }, payload: { title: "Teste de notificação", assignedMembershipId: memberMembershipId } });
  assert.equal(createTask.statusCode, 201, createTask.body);
  const taskId = createTask.json().id as string;

  // Verify notification was created for member
  const memberNotifications = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications`, headers: { cookie: memberCookies } });
  assert.equal(memberNotifications.statusCode, 200);
  const memberNotifs = memberNotifications.json().notifications;
  assert.ok(memberNotifs.some((n: { type: string }) => n.type === "task.assigned"), "Expected task.assigned notification");

  // --- Event 2: task.commented + user.mentioned ---
  const comment = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/tasks/${taskId}/comments`, headers: { cookie: adminCookies }, payload: { body: `Olá @Member User, podes ver isto?` } });
  assert.equal(comment.statusCode, 201, comment.body);

  // Member should have a mention notification (name "Member User" matches @Member User)
  const memberNotifs2 = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications`, headers: { cookie: memberCookies } });
  const memberNotifsList = memberNotifs2.json().notifications;
  assert.ok(memberNotifsList.some((n: { type: string }) => n.type === "user.mentioned"), "Expected user.mentioned notification");

  // --- Event 3: document.shared ---
  // First create a folder and document
  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: "Test Folder" } });
  assert.equal(createFolder.statusCode, 201);
  const folderId = createFolder.json().id;

  // Upload a simple text document
  const uploadBody = await multipart("test.txt", "text/plain", new TextEncoder().encode("hello world"));
  const upload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents?folderId=${folderId}`, headers: { cookie: adminCookies, "content-type": uploadBody.contentType }, payload: uploadBody.payload });
  assert.equal(upload.statusCode, 201, upload.body);
  const documentId = upload.json().document.id;

  // Share with member
  const share = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/shares`, headers: { cookie: adminCookies }, payload: { targetType: "USER", targetId: memberMembershipId, permission: "READ" } });
  assert.equal(share.statusCode, 204, share.body);

  // Verify document.shared notification
  const memberNotifs3 = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications`, headers: { cookie: memberCookies } });
  assert.ok(memberNotifs3.json().notifications.some((n: { type: string }) => n.type === "document.shared"), "Expected document.shared notification");

  // --- Event 4: document.changed (new version upload) ---
  const versionBody = await multipart("test.txt", "text/plain", new TextEncoder().encode("updated content"));
  const uploadVersion = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/versions`, headers: { cookie: adminCookies, "content-type": versionBody.contentType }, payload: versionBody.payload });
  assert.equal(uploadVersion.statusCode, 201, uploadVersion.body);

  // Member should have document.changed notification
  const memberNotifs4 = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications`, headers: { cookie: memberCookies } });
  assert.ok(memberNotifs4.json().notifications.some((n: { type: string }) => n.type === "document.changed"), "Expected document.changed notification");

  // --- Event 5: workflow.approval + workflow.approval.decided + workflow.completed ---
  const createWorkflow = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/workflows`,
    headers: { cookie: adminCookies },
    payload: {
      name: "Approval flow test",
      steps: [
        { order: 0, type: "START", name: "Iniciar", config: {} },
        { order: 1, type: "APPROVAL", name: "Aprovação", config: { approverId: approverMembershipId } },
        { order: 2, type: "END", name: "Terminar", config: {} }
      ]
    }
  });
  assert.equal(createWorkflow.statusCode, 201, createWorkflow.body);
  const workflowId = createWorkflow.json().id;

  await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflowId}/publish`, headers: { cookie: adminCookies } });

  const startWorkflow = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflowId}/start`, headers: { cookie: adminCookies }, payload: { input: {} } });
  assert.equal(startWorkflow.statusCode, 201, startWorkflow.body);
  const instance = startWorkflow.json();
  const approvalId = instance.approvals[0].id;

  // Approver should have workflow.approval notification
  const approverNotifs = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications`, headers: { cookie: approverCookies } });
  assert.ok(approverNotifs.json().notifications.some((n: { type: string }) => n.type === "workflow.approval"), "Expected workflow.approval notification");

  // --- Approval comments ---
  const approvalComment = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/approvals/${approvalId}/comments`, headers: { cookie: adminCookies }, payload: { body: "Por favor verifique." } });
  assert.equal(approvalComment.statusCode, 201, approvalComment.body);

  // Approver should get a notification about the comment
  const approverNotifs2 = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications`, headers: { cookie: approverCookies } });
  assert.ok(approverNotifs2.json().notifications.filter((n: { type: string }) => n.type === "workflow.approval").length >= 2, "Expected comment notification");

  // --- Approval delegation ---
  // Approver delegates to member
  const delegate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/approvals/${approvalId}/delegate`, headers: { cookie: approverCookies }, payload: { toMemberId: memberMembershipId, reason: "Estou indisponível" } });
  assert.equal(delegate.statusCode, 200, delegate.body);
  assert.equal(delegate.json().approver.name, "Member User");
  assert.equal(delegate.json().delegatedBy.name, "Approver User");
  assert.equal(delegate.json().delegations.length, 1);

  await prisma.user.update({ where: { email: adminEmail }, data: { isSuperAdmin: true } });
  const delegateToApprover = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/approvals/${approvalId}/delegate`, headers: { cookie: adminCookies }, payload: { toMemberId: memberMembershipId, reason: "No-op" } });
  assert.equal(delegateToApprover.statusCode, 400, delegateToApprover.body);
  await prisma.user.update({ where: { email: adminEmail }, data: { isSuperAdmin: false } });

  // Member should be notified about delegation
  const memberNotifs5 = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications`, headers: { cookie: memberCookies } });
  assert.ok(memberNotifs5.json().notifications.some((n: { type: string; title: string }) => n.type === "workflow.approval" && n.title === "Aprovação delegada"), "Expected delegation notification");

  // --- List approvals ---
  const listApprovals = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/approvals?scope=all`, headers: { cookie: adminCookies } });
  assert.equal(listApprovals.statusCode, 200);
  assert.ok(listApprovals.json().approvals.length >= 1);

  // List with status filter
  const pendingApprovals = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/approvals?status=PENDING&scope=all`, headers: { cookie: adminCookies } });
  assert.equal(pendingApprovals.statusCode, 200);
  assert.ok(pendingApprovals.json().approvals.every((a: { status: string }) => a.status === "PENDING"));

  // Get approval detail
  const approvalDetail = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/approvals/${approvalId}`, headers: { cookie: adminCookies } });
  assert.equal(approvalDetail.statusCode, 200);
  assert.equal(approvalDetail.json().comments.length, 1);
  assert.equal(approvalDetail.json().delegations.length, 1);

  // --- Member decides the approval (now delegated to member) ---
  const decide = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/approvals/${approvalId}/decide`, headers: { cookie: memberCookies }, payload: { decision: "APPROVED", note: "Tudo OK" } });
  assert.equal(decide.statusCode, 200, decide.body);
  assert.equal(decide.json().status, "COMPLETED");

  // Admin (starter) should have workflow.approval.decided notification
  const adminNotifs = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications`, headers: { cookie: adminCookies } });
  assert.ok(adminNotifs.json().notifications.some((n: { type: string }) => n.type === "workflow.approval.decided"), "Expected workflow.approval.decided notification");

  // Admin should have workflow.completed notification
  assert.ok(adminNotifs.json().notifications.some((n: { type: string }) => n.type === "workflow.completed"), "Expected workflow.completed notification");

  // --- Notification management: unread count, mark read, mark all ---
  const unreadCount = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications/unread-count`, headers: { cookie: adminCookies } });
  assert.equal(unreadCount.statusCode, 200);
  const initialUnread = unreadCount.json().unreadCount as number;
  assert.ok(initialUnread > 0, "Admin should have unread notifications");

  // Mark first as read
  const firstNotifId = adminNotifs.json().notifications[0].id;
  const markRead = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/notifications/${firstNotifId}/read`, headers: { cookie: adminCookies } });
  assert.equal(markRead.statusCode, 204);

  const unreadCount2 = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications/unread-count`, headers: { cookie: adminCookies } });
  assert.equal(unreadCount2.json().unreadCount, initialUnread - 1);

  // Mark all as read
  const markAll = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/notifications/read-all`, headers: { cookie: adminCookies } });
  assert.equal(markAll.statusCode, 204);

  const unreadCount3 = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications/unread-count`, headers: { cookie: adminCookies } });
  assert.equal(unreadCount3.json().unreadCount, 0);

  // Filter unread only returns empty now
  const unreadOnly = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/notifications?unreadOnly=true`, headers: { cookie: adminCookies } });
  assert.equal(unreadOnly.json().notifications.length, 0);

  // --- Cannot delegate a decided approval ---
  const delegateDecided = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/approvals/${approvalId}/delegate`, headers: { cookie: memberCookies }, payload: { toMemberId: approverMembershipId } });
  assert.equal(delegateDecided.statusCode, 409);

  // --- Cannot comment on a decided approval ---
  const commentDecided = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/approvals/${approvalId}/comments`, headers: { cookie: adminCookies }, payload: { body: "Depois de decidir" } });
  assert.equal(commentDecided.statusCode, 409);

  // --- Viewer can view approvals but not delegate ---
  const viewerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: viewerEmail, password: "AnPassword123" } });
  const viewerCookies = cookies(viewerLogin);
  const viewerList = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/approvals`, headers: { cookie: viewerCookies } });
  assert.equal(viewerList.statusCode, 200);

  const viewerDelegate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/approvals/${approvalId}/delegate`, headers: { cookie: viewerCookies }, payload: { toMemberId: memberMembershipId } });
  assert.equal(viewerDelegate.statusCode, 403);
});
