import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `tasks-admin-${marker}@example.com`;
const memberEmail = `tasks-member-${marker}@example.com`;
const viewerEmail = `tasks-viewer-${marker}@example.com`;
const joseEmail = `tasks-jose-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail, viewerEmail, joseEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("tasks support creation, assignment, comments, status changes, notifications, projects and permissions", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Task Admin", email: adminEmail, password: "TasksPassword123", organizationName: "Tasks Organization" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  // Add a member (Member role can manage tasks)
  const addMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Task Member", email: memberEmail, password: "TasksPassword123", role: "Member" } });
  assert.equal(addMember.statusCode, 201, addMember.body);
  const memberMembershipId = addMember.json().memberId as string;

  // Add a viewer
  const addViewer = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Task Viewer", email: viewerEmail, password: "TasksPassword123", role: "Viewer" } });
  assert.equal(addViewer.statusCode, 201);

  // --- Create a project ---
  const createProject = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/projects`, headers: { cookie: adminCookies }, payload: { name: "Website Redesign", description: "Projeto de redesign", color: "#6366f1" } });
  assert.equal(createProject.statusCode, 201, createProject.body);
  const project = createProject.json();
  assert.equal(project.name, "Website Redesign");
  assert.equal(project.taskCount, 0);

  // --- List projects ---
  const listProjects = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/projects`, headers: { cookie: adminCookies } });
  assert.equal(listProjects.statusCode, 200);
  assert.ok(listProjects.json().projects.length >= 1);

  // --- Create a task ---
  const createTask = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/tasks`,
    headers: { cookie: adminCookies },
    payload: {
      title: "Implementar homepage",
      description: "Criar a nova homepage",
      status: "TODO",
      priority: "HIGH",
      startAt: new Date("2026-01-01").toISOString(),
      dueAt: new Date("2026-01-31").toISOString(),
      tags: ["frontend", "urgente"],
      projectId: project.id,
      assignedMembershipId: memberMembershipId
    }
  });
  assert.equal(createTask.statusCode, 201, createTask.body);
  const task = createTask.json();
  assert.equal(task.title, "Implementar homepage");
  assert.equal(task.status, "TODO");
  assert.equal(task.priority, "HIGH");
  assert.deepEqual(task.tags, ["frontend", "urgente"]);
  assert.equal(task.project.id, project.id);
  assert.equal(task.assignee.name, "Task Member");

  // --- Notification was created for the assignee ---
  const notifications = await prisma.notification.findMany({ where: { tenantId: organizationId, recipientId: memberMembershipId, type: "task.assigned" } });
  assert.ok(notifications.length >= 1);
  assert.ok(notifications[0]!.title.includes("tarefa"));

  // --- Get the task ---
  const getTask = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}`, headers: { cookie: adminCookies } });
  assert.equal(getTask.statusCode, 200);
  assert.equal(getTask.json().id, task.id);

  // --- List tasks ---
  const listTasks = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks`, headers: { cookie: adminCookies } });
  assert.equal(listTasks.statusCode, 200);
  assert.ok(listTasks.json().tasks.length >= 1);

  // --- Filter by status ---
  const filteredStatus = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks?status=TODO`, headers: { cookie: adminCookies } });
  assert.equal(filteredStatus.statusCode, 200);
  assert.ok(filteredStatus.json().tasks.every((t: { status: string }) => t.status === "TODO"));

  // --- Filter by priority ---
  const filteredPriority = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks?priority=HIGH`, headers: { cookie: adminCookies } });
  assert.equal(filteredPriority.statusCode, 200);
  assert.ok(filteredPriority.json().tasks.every((t: { priority: string }) => t.priority === "HIGH"));

  // --- Filter by tag ---
  const filteredTag = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks?tag=frontend`, headers: { cookie: adminCookies } });
  assert.equal(filteredTag.statusCode, 200);
  assert.ok(filteredTag.json().tasks.every((t: { tags: string[] }) => t.tags.includes("frontend")));

  // --- Search by title ---
  const search = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks?search=homepage`, headers: { cookie: adminCookies } });
  assert.equal(search.statusCode, 200);
  assert.ok(search.json().tasks.length >= 1);

  // --- Update task status ---
  const updateStatus = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}`, headers: { cookie: adminCookies }, payload: { status: "IN_PROGRESS" } });
  assert.equal(updateStatus.statusCode, 200);
  assert.equal(updateStatus.json().status, "IN_PROGRESS");

  // --- Update task priority ---
  const updatePriority = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}`, headers: { cookie: adminCookies }, payload: { priority: "URGENT" } });
  assert.equal(updatePriority.statusCode, 200);
  assert.equal(updatePriority.json().priority, "URGENT");

  // --- Add a comment ---
  const addComment = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}/comments`, headers: { cookie: adminCookies }, payload: { body: "Este é o primeiro comentário." } });
  assert.equal(addComment.statusCode, 201, addComment.body);
  const comment = addComment.json();
  assert.equal(comment.body, "Este é o primeiro comentário.");
  assert.equal(comment.author.name, "Task Admin");

  const addJose = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "José Álvarez", email: joseEmail, password: "TasksPassword123", role: "Member" } });
  assert.equal(addJose.statusCode, 201, addJose.body);
  const joseMembershipId = addJose.json().memberId as string;
  const mentionComment = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}/comments`, headers: { cookie: adminCookies }, payload: { body: "@Task Member e @José Álvarez vejam isto por favor." } });
  assert.equal(mentionComment.statusCode, 201, mentionComment.body);
  const mentionCommentId = mentionComment.json().id as string;
  const memberMentions = await prisma.notification.findMany({ where: { tenantId: organizationId, recipientId: memberMembershipId, type: "user.mentioned" } });
  assert.equal(memberMentions.length, 1);
  const memberCommentNotifications = await prisma.notification.findMany({ where: { tenantId: organizationId, recipientId: memberMembershipId, type: "task.commented" } });
  assert.equal(memberCommentNotifications.filter((entry) => (entry.dataJson ?? "").includes(mentionCommentId)).length, 0);
  const joseMentions = await prisma.notification.findMany({ where: { tenantId: organizationId, recipientId: joseMembershipId, type: "user.mentioned" } });
  assert.equal(joseMentions.length, 1);

  // --- List comments ---
  const listComments = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}/comments`, headers: { cookie: adminCookies } });
  assert.equal(listComments.statusCode, 200);
  assert.ok(listComments.json().length >= 1);

  // --- Task detail includes comments ---
  const taskWithComments = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}`, headers: { cookie: adminCookies } });
  assert.ok(taskWithComments.json().comments.length >= 1);

  // --- Update task with new fields ---
  const updateTask = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/tasks/${task.id}`,
    headers: { cookie: adminCookies },
    payload: { title: "Implementar homepage v2", description: "Versão atualizada", tags: ["frontend", "design", "review"] }
  });
  assert.equal(updateTask.statusCode, 200);
  assert.equal(updateTask.json().title, "Implementar homepage v2");
  assert.deepEqual(updateTask.json().tags, ["frontend", "design", "review"]);

  // --- Reject invalid assignee (not a member) ---
  const invalidAssignee = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}`, headers: { cookie: adminCookies }, payload: { assignedMembershipId: "invalid-id" } });
  assert.equal(invalidAssignee.statusCode, 400);

  // --- Reject invalid project ---
  const invalidProject = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}`, headers: { cookie: adminCookies }, payload: { projectId: "invalid-id" } });
  assert.equal(invalidProject.statusCode, 400);

  // --- Reject start date after due date ---
  const invalidDates = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/tasks`,
    headers: { cookie: adminCookies },
    payload: { title: "Bad dates", startAt: new Date("2026-12-01").toISOString(), dueAt: new Date("2026-01-01").toISOString() }
  });
  assert.equal(invalidDates.statusCode, 400);

  // --- Viewer can view but not manage ---
  const viewerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: viewerEmail, password: "TasksPassword123" } });
  assert.equal(viewerLogin.statusCode, 200);
  const viewerCookies = cookies(viewerLogin);
  const viewerList = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks`, headers: { cookie: viewerCookies } });
  assert.equal(viewerList.statusCode, 200);
  const viewerCreate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/tasks`, headers: { cookie: viewerCookies }, payload: { title: "Forbidden" } });
  assert.equal(viewerCreate.statusCode, 403);

  // --- Member can manage ---
  const memberLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: memberEmail, password: "TasksPassword123" } });
  assert.equal(memberLogin.statusCode, 200);
  const memberCookies = cookies(memberLogin);
  const memberComment = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}/comments`, headers: { cookie: memberCookies }, payload: { body: "Comentário do membro." } });
  assert.equal(memberComment.statusCode, 201);

  // --- Member can delete own comment ---
  const deleteOwnComment = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}/comments/${memberComment.json().id}`, headers: { cookie: memberCookies } });
  assert.equal(deleteOwnComment.statusCode, 204);

  // --- Member cannot delete other's comment ---
  const deleteOtherComment = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}/comments/${comment.id}`, headers: { cookie: memberCookies } });
  assert.equal(deleteOtherComment.statusCode, 403);

  // --- scope=mine filters to tasks assigned to the caller ---
  const createOtherTask = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/tasks`, headers: { cookie: adminCookies }, payload: { title: "Unassigned backlog" } });
  assert.equal(createOtherTask.statusCode, 201, createOtherTask.body);
  const otherTask = createOtherTask.json();
  const mineTasks = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks?scope=mine`, headers: { cookie: memberCookies } });
  assert.equal(mineTasks.statusCode, 200);
  const mineTaskIds = mineTasks.json().tasks.map((entry: { id: string }) => entry.id);
  assert.ok(mineTaskIds.includes(task.id));
  assert.ok(!mineTaskIds.includes(otherTask.id));

  // --- Update project ---
  const updateProject = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/projects/${project.id}`, headers: { cookie: adminCookies }, payload: { name: "Website Redesign v2", color: "#ec4899" } });
  assert.equal(updateProject.statusCode, 200);
  assert.equal(updateProject.json().name, "Website Redesign v2");
  assert.equal(updateProject.json().color, "#ec4899");

  // --- Project task count reflects tasks ---
  const projectWithTasks = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/projects`, headers: { cookie: adminCookies } });
  assert.ok(projectWithTasks.json().projects.find((p: { id: string }) => p.id === project.id).taskCount >= 1);

  // --- Delete the task ---
  const deleteTask = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}`, headers: { cookie: adminCookies } });
  assert.equal(deleteTask.statusCode, 204);
  const deletedGet = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/tasks/${task.id}`, headers: { cookie: adminCookies } });
  assert.equal(deletedGet.statusCode, 404);

  // --- Delete the project ---
  const deleteProject = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/projects/${project.id}`, headers: { cookie: adminCookies } });
  assert.equal(deleteProject.statusCode, 204);

  // --- Audit log was created ---
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: organizationId, resourceId: task.id, action: "task.created" } });
  assert.ok(audit);
});
