import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `pipeline-${marker}@example.com`;
const leadEmail = `lead-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => app.ready());
after(async () => {
  await prisma.contactRequest.deleteMany({ where: { email: leadEmail } });
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
  await app.close();
  await prisma.$disconnect();
});

test("sales pipeline: public demo request is qualified and tracked by the platform owner", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/public/contact",
    remoteAddress: "10.88.1.1",
    payload: { name: "Lead Prospect", email: leadEmail, company: "Prospect Lda", message: "Queremos uma demo para a equipa.", intent: "demo", teamSize: "11-50" }
  });
  assert.equal(created.statusCode, 201, created.body);

  const invalid = await app.inject({
    method: "POST",
    url: "/api/v1/public/contact",
    remoteAddress: "10.88.1.2",
    payload: { name: "Lead Prospect", email: leadEmail, message: "Mensagem válida", teamSize: "huge" }
  });
  assert.equal(invalid.statusCode, 400, "unknown team size must be rejected");

  const lead = await prisma.contactRequest.findFirstOrThrow({ where: { email: leadEmail } });
  assert.equal(lead.intent, "demo");
  assert.equal(lead.teamSize, "11-50");
  assert.equal(lead.status, "NEW");

  const reg = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Pipeline Owner", email: adminEmail, password: "PipelinePass123", organizationName: "Pipeline Org" } });
  assert.equal(reg.statusCode, 201, reg.body);
  organizationIds.push(reg.json().organizations[0].id);
  const cookie = cookies(reg);

  const forbidden = await app.inject({ method: "PATCH", url: `/api/v1/platform/contact-requests/${lead.id}`, headers: { cookie }, payload: { status: "WON" } });
  assert.equal(forbidden.statusCode, 403, "organization admins must not manage platform leads");

  await prisma.user.update({ where: { email: adminEmail }, data: { isSuperAdmin: true } });

  const updated = await app.inject({ method: "PATCH", url: `/api/v1/platform/contact-requests/${lead.id}`, headers: { cookie }, payload: { status: "DEMO", notes: "Demo marcada para 5.ª feira" } });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().status, "DEMO");
  assert.equal(updated.json().notes, "Demo marcada para 5.ª feira");

  const badStatus = await app.inject({ method: "PATCH", url: `/api/v1/platform/contact-requests/${lead.id}`, headers: { cookie }, payload: { status: "MAYBE" } });
  assert.equal(badStatus.statusCode, 400);
  const empty = await app.inject({ method: "PATCH", url: `/api/v1/platform/contact-requests/${lead.id}`, headers: { cookie }, payload: {} });
  assert.equal(empty.statusCode, 400);
  const missing = await app.inject({ method: "PATCH", url: "/api/v1/platform/contact-requests/does-not-exist", headers: { cookie }, payload: { status: "LOST" } });
  assert.equal(missing.statusCode, 404);

  const filtered = await app.inject({ method: "GET", url: `/api/v1/platform/contact-requests?status=DEMO&search=${encodeURIComponent(leadEmail)}`, headers: { cookie } });
  assert.equal(filtered.statusCode, 200, filtered.body);
  const body = filtered.json();
  assert.equal(body.total, 1);
  assert.equal(body.requests[0].id, lead.id);
  assert.equal(body.statusCounts.DEMO, 1);
  assert.equal(body.statusCounts.NEW, 0);
  assert.deepEqual(Object.keys(body.statusCounts).sort(), ["CONTACTED", "DEMO", "LOST", "NEW", "PROPOSAL", "WON"]);

  const notesSearch = await app.inject({ method: "GET", url: `/api/v1/platform/contact-requests?search=${encodeURIComponent("5.ª feira")}`, headers: { cookie } });
  assert.ok(notesSearch.json().requests.some((row: { id: string }) => row.id === lead.id), "search must include notes");
});
