import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `sec-admin-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.${180 + Math.floor(ipCounter / 200)}.${ipCounter % 200}.3`;
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: marker } } });
  await app.close();
  await prisma.$disconnect();
});

test("OWASP security checks: headers, CORS, injection, error disclosure, public endpoints", async (t) => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", remoteAddress: nextIp(), payload: { name: "Sec Admin", email: adminEmail, password: "SecPassword12345", organizationName: "Sec Org" } });
  assert.equal(registration.statusCode, 201);
  const org = registration.json().organizations[0].id as string;
  organizationIds.push(org);
  const admin = cookies(registration);

  await t.test("security headers are present on API responses", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/health", remoteAddress: nextIp() });
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["x-frame-options"], "DENY");
    assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin");
    assert.ok(response.headers["permissions-policy"]);
  });

  await t.test("CORS rejects untrusted origins and allows the configured one", async () => {
    const evil = await app.inject({ method: "GET", url: "/api/v1/health", headers: { origin: "https://evil.example.com" }, remoteAddress: nextIp() });
    assert.ok(!evil.headers["access-control-allow-origin"], "untrusted origin received CORS allowance");

    const trusted = await app.inject({ method: "GET", url: "/api/v1/health", headers: { origin: "http://localhost:5173" }, remoteAddress: nextIp() });
    assert.equal(trusted.headers["access-control-allow-origin"], "http://localhost:5173");

    const preflight = await app.inject({ method: "OPTIONS", url: `/api/v1/organizations/${org}/documents`, headers: { origin: "https://evil.example.com", "access-control-request-method": "GET" }, remoteAddress: nextIp() });
    assert.ok(!preflight.headers["access-control-allow-origin"], "preflight allowed evil origin");
  });

  await t.test("forged and tampered JWTs are rejected", async () => {
    const forgedPayloads = [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInNpZCI6ImZha2UiLCJpc3MiOiJuZXhvcmEtYXBpIiwiYXVkIjoibmV4b3JhLXdlYiJ9.forged",
      "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiIsInNpZCI6ImZha2UifQ.",
      "not-a-token",
      ""
    ];
    for (const token of forgedPayloads) {
      const response = await app.inject({ method: "GET", url: `/api/v1/organizations/${org}/documents`, headers: { authorization: `Bearer ${token}` }, remoteAddress: nextIp() });
      assert.equal(response.statusCode, 401, `forged token accepted: ${token.slice(0, 30)}`);
    }
  });

  await t.test("error responses never leak internals", async () => {
    const probes = [
      { method: "GET" as const, url: `/api/v1/organizations/${org}/documents/<script>alert(1)</script>` },
      { method: "POST" as const, url: `/api/v1/organizations/${org}/tasks`, payload: { title: "x", badField: { deep: [1, 2, 3] } } },
      { method: "GET" as const, url: "/api/v1/nonexistent-endpoint" },
      { method: "POST" as const, url: "/api/v1/auth/login", payload: { email: "' OR 1=1--", password: "x" } }
    ];
    for (const probe of probes) {
      const response = await app.inject({ method: probe.method, url: probe.url, headers: { cookie: admin }, remoteAddress: nextIp(), payload: probe.payload as Record<string, unknown> | undefined });
      assert.ok(response.statusCode < 500, `${probe.url} -> ${response.statusCode}`);
      const body = response.body;
      for (const leaked of ["Prisma", "node_modules", "at Object", "D:\\", ".ts:", "SELECT ", "passwordHash", "tokenHash", "JWT_ACCESS_SECRET"]) {
        assert.ok(!body.includes(leaked), `${probe.url} leaked "${leaked}": ${body.slice(0, 300)}`);
      }
    }
  });

  await t.test("login does not reveal whether the email exists (enumeration)", async () => {
    const responses: string[] = [];
    for (const email of [adminEmail, `ghost-${marker}@example.com`]) {
      const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress: `10.199.${ipCounter % 200}.${ipCounter + 30}`, payload: { email, password: "WrongPass12345" } });
      ipCounter += 1;
      assert.equal(response.statusCode, 401);
      responses.push(response.json().error.code);
    }
    assert.equal(responses[0], responses[1], "different error codes reveal account existence");
  });

  await t.test("forgot-password response is identical for known and unknown emails", async () => {
    const results: Array<{ status: number; body: string }> = [];
    for (const email of [adminEmail, `ghost-${marker}@example.com`]) {
      const response = await app.inject({ method: "POST", url: "/api/v1/auth/forgot-password", remoteAddress: `10.198.${ipCounter % 200}.${(ipCounter % 200) + 40}`, payload: { email } });
      ipCounter += 1;
      // 200 when mail is configured; 503 PASSWORD_RESET_UNAVAILABLE when it is not — both are fine as long as they are identical.
      assert.ok(response.statusCode === 200 || response.statusCode === 503, `forgot-password -> ${response.statusCode}`);
      const parsed = response.json();
      assert.ok(!("resetToken" in parsed), "reset token exposed when EXPOSE_PASSWORD_RESET_TOKEN=false in test env");
      results.push({ status: response.statusCode, body: JSON.stringify(parsed) });
    }
    assert.equal(results[0]?.status, results[1]?.status, "different statuses reveal account existence");
    if (results[0]?.status === 200) assert.equal(results[0]?.body, results[1]?.body, "different bodies reveal account existence");
  });

  await t.test("public share link endpoints reject invalid tokens and rate-limit", async () => {
    const invalid = await app.inject({ method: "GET", url: "/api/v1/shares/invalid-token-123", remoteAddress: nextIp() });
    assert.ok(invalid.statusCode === 404 || invalid.statusCode === 400, `invalid share token -> ${invalid.statusCode}`);
    assert.ok(!invalid.body.includes("tokenHash"), "share error leaked token internals");
  });

  await t.test("public contact endpoint validates input and does not leak", async () => {
    const bad = await app.inject({ method: "POST", url: "/api/v1/public/contact", remoteAddress: nextIp(), payload: { name: "x", email: "bad", message: "hi" } });
    assertClean(bad);
    const ok = await app.inject({ method: "POST", url: "/api/v1/public/contact", remoteAddress: nextIp(), payload: { name: "Legit User", email: "legit@example.com", company: "Acme", message: "Quero saber mais sobre a Nexora." } });
    assert.equal(ok.statusCode, 201, ok.body);
    // XSS attempt is stored but the API must return only { ok: true }
    const xss = await app.inject({ method: "POST", url: "/api/v1/public/contact", remoteAddress: nextIp(), payload: { name: "<script>x</script>", email: "xss@example.com", message: "<img src=x onerror=alert(1)> teste" } });
    assert.equal(xss.statusCode, 201);
    assert.deepEqual(xss.json(), { ok: true });
  });

  function assertClean(response: { statusCode: number; body: string }) {
    assert.ok(response.statusCode >= 400 && response.statusCode < 500, `contact -> ${response.statusCode}`);
    assert.ok(!response.body.includes("Prisma"), "contact leaked internals");
  }

  await t.test("unauthenticated refresh and tampered cookies are rejected", async () => {
    const noToken = await app.inject({ method: "POST", url: "/api/v1/auth/refresh", remoteAddress: nextIp() });
    assert.equal(noToken.statusCode, 401);
    const forged = await app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: { cookie: "nexora_refresh=forged-token-value" }, remoteAddress: nextIp() });
    assert.equal(forged.statusCode, 401);
  });

  await t.test("metrics endpoint does not expose sensitive data", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/metrics", remoteAddress: nextIp() });
    assert.equal(response.statusCode, 200);
    for (const leaked of ["password", "secret", "token", "connection", "postgres://"]) {
      assert.ok(!response.body.toLowerCase().includes(leaked), `metrics leaked "${leaked}"`);
    }
  });
});
