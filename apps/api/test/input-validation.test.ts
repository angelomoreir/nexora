import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `iv-admin-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.${140 + Math.floor(ipCounter / 200)}.${ipCounter % 200}.9`;
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: marker } } });
  await app.close();
  await prisma.$disconnect();
});

function assertCleanError(body: string, statusCode: number, context: string) {
  assert.ok(statusCode >= 400 && statusCode < 500, `${context} -> ${statusCode} (expected 4xx): ${body.slice(0, 200)}`);
  assert.ok(!body.includes("Prisma"), `${context} leaked Prisma internals`);
  assert.ok(!/SELECT|INSERT|UPDATE|DELETE FROM/i.test(body), `${context} leaked SQL`);
  assert.ok(!body.includes("node_modules") && !body.includes("at Object"), `${context} leaked stack trace`);
}

test("input validation: hostile payloads are rejected cleanly across modules", async (t) => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", remoteAddress: nextIp(), payload: { name: "IV Admin", email: adminEmail, password: "IvPassword12345", organizationName: "IV Org" } });
  assert.equal(registration.statusCode, 201);
  const org = registration.json().organizations[0].id as string;
  organizationIds.push(org);
  const admin = cookies(registration);

  await t.test("malformed JSON and wrong content types", async () => {
    const badJson = await app.inject({ method: "POST", url: `/api/v1/organizations/${org}/tasks`, headers: { cookie: admin, "content-type": "application/json" }, remoteAddress: nextIp(), payload: "{not-json" });
    assertCleanError(badJson.body, badJson.statusCode, "malformed JSON");

    const wrongType = await app.inject({ method: "POST", url: `/api/v1/organizations/${org}/tasks`, headers: { cookie: admin, "content-type": "text/plain" }, remoteAddress: nextIp(), payload: "title=x" });
    assertCleanError(wrongType.body, wrongType.statusCode, "text/plain body");
  });

  await t.test("register validation: weak passwords, bad emails, oversized fields", async () => {
    const cases: Array<[unknown, string]> = [
      [{ name: "A", email: `v-${marker}@example.com`, password: "ValidPass12345", organizationName: "Org X" }, "short name"],
      [{ name: "Valid Name", email: "not-an-email", password: "ValidPass12345", organizationName: "Org X" }, "invalid email"],
      [{ name: "Valid Name", email: `v-${marker}@example.com`, password: "short", organizationName: "Org X" }, "short password"],
      [{ name: "Valid Name", email: `v-${marker}@example.com`, password: "alllowercase12345", organizationName: "Org X" }, "no uppercase"],
      [{ name: "Valid Name", email: `v-${marker}@example.com`, password: "ALLUPPERCASE12345", organizationName: "Org X" }, "no lowercase"],
      [{ name: "Valid Name", email: `v-${marker}@example.com`, password: "NoDigitsHereXyz", organizationName: "Org X" }, "no digit"],
      [{ name: "Valid Name", email: `v-${marker}@example.com`, password: "ValidPass12345" }, "missing organizationName"],
      [{ name: "V".repeat(300), email: `v-${marker}@example.com`, password: "ValidPass12345", organizationName: "Org X" }, "oversized name"],
      [{ name: "Valid", email: `v-${marker}@example.com`, password: "ValidPass12345", organizationName: "" }, "empty org name"],
      ["not-an-object", "non-object body"],
      [[], "array body"],
      [null, "null body"],
      [42, "number body"]
    ];
    let i = 0;
    for (const [payload, label] of cases) {
      const response = await app.inject({ method: "POST", url: "/api/v1/auth/register", remoteAddress: `10.170.${i}.1`, payload: payload as Record<string, unknown> });
      i += 1;
      assertCleanError(response.body, response.statusCode, `register ${label}`);
      const parsed = response.json();
      assert.ok(["VALIDATION_ERROR", "RATE_LIMIT_EXCEEDED", "BAD_REQUEST"].includes(parsed.error?.code), `register ${label}: unexpected code ${parsed.error?.code}`);
    }
  });

  await t.test("task creation rejects invalid field types and extremes", async () => {
    const cases: Array<[unknown, string]> = [
      [{ title: "" }, "empty title"],
      [{ title: "x".repeat(10000) }, "oversized title"],
      [{ title: 123 }, "numeric title"],
      [{ title: ["a"] }, "array title"],
      [{ title: "ok", priority: "SUPER_URGENT" }, "invalid priority enum"],
      [{ title: "ok", status: "HACKED" }, "invalid status enum"],
      [{ title: "ok", dueAt: "not-a-date" }, "invalid date"],
      [{ title: "ok", dueAt: "99999-99-99" }, "impossible date"],
      [{ title: "ok", tags: "not-an-array" }, "tags as string"],
      [{ title: "ok", tags: new Array(500).fill("x") }, "excessive tags"],
      [{ title: "ok", projectId: "../../etc" }, "path traversal id"],
      [{ title: "ok", projectId: { $ne: null } }, "NoSQL-style operator"],
      [{ title: "ok", assignedMembershipId: "'; DROP TABLE users;--" }, "SQL injection string"]
    ];
    for (const [payload, label] of cases) {
      const response = await app.inject({ method: "POST", url: `/api/v1/organizations/${org}/tasks`, headers: { cookie: admin }, remoteAddress: nextIp(), payload: payload as Record<string, unknown> });
      assertCleanError(response.body, response.statusCode, `tasks ${label}`);
    }
  });

  await t.test("folder/document metadata rejects hostile input", async () => {
    const cases: Array<[unknown, string]> = [
      [{ name: "" }, "empty name"],
      [{ name: "x".repeat(5000) }, "oversized name"],
      [{ name: 42 }, "numeric name"],
      [{ name: "ok", parentId: "' OR '1'='1" }, "SQL injection parentId"],
      [{ name: "ok", parentId: ["a", "b"] }, "array parentId"],
      [{ name: null }, "null name"]
    ];
    for (const [payload, label] of cases) {
      const response = await app.inject({ method: "POST", url: `/api/v1/organizations/${org}/folders`, headers: { cookie: admin }, remoteAddress: nextIp(), payload: payload as Record<string, unknown> });
      assertCleanError(response.body, response.statusCode, `folders ${label}`);
    }
  });

  await t.test("unicode, emoji and HTML are stored safely or rejected", async () => {
    const unicode = await app.inject({ method: "POST", url: `/api/v1/organizations/${org}/tasks`, headers: { cookie: admin }, remoteAddress: nextIp(), payload: { title: "Tarefa 中文 🚀 ñáéíóú", description: "descrição com emoji 🎉 e acentos" } });
    assert.equal(unicode.statusCode, 201, unicode.body);
    assert.equal(unicode.json().title, "Tarefa 中文 🚀 ñáéíóú");

    const html = await app.inject({ method: "POST", url: `/api/v1/organizations/${org}/tasks`, headers: { cookie: admin }, remoteAddress: nextIp(), payload: { title: "<script>alert(1)</script>", description: "<img src=x onerror=alert(1)>" } });
    assert.equal(html.statusCode, 201, html.body);
    // Stored verbatim — the API must NOT mangle it; XSS defense lives in the React renderer (auto-escaped).
    assert.equal(html.json().title, "<script>alert(1)</script>");
  });

  await t.test("query parameters: injection attempts and extremes", async () => {
    const queries = [
      "search=%27%20OR%201%3D1--",
      "search=" + "x".repeat(5000),
      "folderId=" + encodeURIComponent("../../storage"),
      "sort=;DROP TABLE",
      "order=desc; DELETE FROM tasks",
      "status=TODO' OR '1'='1",
      "page=-1",
      "page=99999999999999999999",
      "limit=-5",
      "limit=1000000"
    ];
    for (const query of queries) {
      for (const base of ["documents", "tasks", "lists"]) {
        const response = await app.inject({ method: "GET", url: `/api/v1/organizations/${org}/${base}?${query}`, headers: { cookie: admin }, remoteAddress: nextIp() });
        assert.ok(response.statusCode < 500, `GET ${base}?${query} -> ${response.statusCode}`);
        assert.ok(!response.body.includes("Prisma") && !response.body.includes("syntax error"), `GET ${base}?${query} leaked internals`);
      }
    }
  });

  await t.test("unexpected HTTP methods return 404/405, not 500", async () => {
    const methods = ["PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const;
    for (const method of methods) {
      const response = await app.inject({ method, url: `/api/v1/organizations/${org}/tasks`, headers: { cookie: admin }, remoteAddress: nextIp() });
      assert.ok(response.statusCode < 500, `${method} /tasks -> ${response.statusCode}`);
    }
  });
});
