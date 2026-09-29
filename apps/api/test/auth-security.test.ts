import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `authsec-admin-${marker}@example.com`;
const memberEmail = `authsec-member-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

function rawCookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return Array.isArray(values) ? values.map(String) : values ? [String(values)] : [];
}

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.${200 + Math.floor(ipCounter / 200)}.${ipCounter % 200}.11`;
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: marker } } });
  await app.close();
  await prisma.$disconnect();
});

test("authentication security: cookies, session lifecycle, suspension, brute force", async (t) => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", remoteAddress: nextIp(), payload: { name: "AuthSec Admin", email: adminEmail, password: "AuthSecPass123", organizationName: "AuthSec Org" } });
  assert.equal(registration.statusCode, 201);
  const org = registration.json().organizations[0].id as string;
  organizationIds.push(org);
  let admin = cookies(registration);

  async function reloginAdmin() {
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress: nextIp(), payload: { email: adminEmail, password: "AuthSecPass123" } });
    assert.equal(login.statusCode, 200);
    admin = cookies(login);
  }

  await t.test("auth cookies are httpOnly with SameSite=Lax and scoped paths", async () => {
    const raw = rawCookies(registration);
    const access = raw.find((c) => c.startsWith("nexora_access="));
    const refresh = raw.find((c) => c.startsWith("nexora_refresh="));
    assert.ok(access, "access cookie missing");
    assert.ok(refresh, "refresh cookie missing");
    assert.match(access, /httponly/i);
    assert.match(access, /samesite=lax/i);
    assert.match(refresh, /httponly/i);
    assert.match(refresh, /path=\/api\/v1\/auth/i);
  });

  await t.test("wrong password returns generic 401 and does not create a session", async () => {
    const before = await prisma.refreshSession.count();
    const bad = await app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress: nextIp(), payload: { email: adminEmail, password: "WrongPassword999" } });
    assert.equal(bad.statusCode, 401);
    assert.equal(bad.json().error.code, "INVALID_CREDENTIALS");
    assert.equal(await prisma.refreshSession.count(), before, "failed login created a session");
  });

  await t.test("refresh token rotation invalidates the old token (reuse detection)", async () => {
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress: nextIp(), payload: { email: adminEmail, password: "AuthSecPass123" } });
    assert.equal(login.statusCode, 200);
    const firstCookies = cookies(login);
    const firstRefresh = firstCookies.split("; ").find((c) => c.startsWith("nexora_refresh="))!;

    const rotated = await app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: { cookie: firstRefresh }, remoteAddress: nextIp() });
    assert.equal(rotated.statusCode, 200);

    // Reusing the OLD refresh token must be detected and rejected
    const reuse = await app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: { cookie: firstRefresh }, remoteAddress: nextIp() });
    assert.equal(reuse.statusCode, 401);
    assert.match(reuse.json().error.code, /REFRESH_TOKEN/);
    // Reuse detection revokes ALL of the user's sessions — re-authenticate for subsequent probes.
    await reloginAdmin();
  });

  await t.test("logout revokes the session server-side", async () => {
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress: nextIp(), payload: { email: adminEmail, password: "AuthSecPass123" } });
    const sessionCookies = cookies(login);
    const logout = await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie: sessionCookies }, remoteAddress: nextIp() });
    assert.equal(logout.statusCode, 204);
    // Access token is JWT — must be rejected because its session is revoked
    const after = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie: sessionCookies }, remoteAddress: nextIp() });
    assert.equal(after.statusCode, 401, "access token still valid after logout");
    await reloginAdmin();
  });

  await t.test("suspended member loses API access immediately", async () => {
    const created = await app.inject({ method: "POST", url: `/api/v1/organizations/${org}/users`, headers: { cookie: admin }, remoteAddress: nextIp(), payload: { name: "To Suspend", email: memberEmail, password: "AuthSecPass123", role: "Member" } });
    assert.equal(created.statusCode, 201);
    const memberUserId = created.json().id as string;
    const memberCookies = await loginMember();

    const beforeSuspend = await app.inject({ method: "GET", url: `/api/v1/organizations/${org}/tasks`, headers: { cookie: memberCookies }, remoteAddress: nextIp() });
    assert.equal(beforeSuspend.statusCode, 200);

    const suspend = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${org}/users/${memberUserId}`, headers: { cookie: admin }, remoteAddress: nextIp(), payload: { memberStatus: "SUSPENDED" } });
    assert.equal(suspend.statusCode, 200);

    const afterSuspend = await app.inject({ method: "GET", url: `/api/v1/organizations/${org}/tasks`, headers: { cookie: memberCookies }, remoteAddress: nextIp() });
    assert.ok(afterSuspend.statusCode === 401 || afterSuspend.statusCode === 403, `suspended member still has access: ${afterSuspend.statusCode}`);
  });

  async function loginMember() {
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress: nextIp(), payload: { email: memberEmail, password: "AuthSecPass123" } });
    assert.equal(login.statusCode, 200);
    return cookies(login);
  }

  await t.test("auth endpoints enforce per-IP rate limiting (brute force)", async () => {
    const ip = nextIp();
    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress: ip, payload: { email: adminEmail, password: "WrongPass12345" } });
      lastStatus = response.statusCode;
    }
    assert.equal(lastStatus, 429, "brute force not rate-limited");
    const parsed = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress: ip, payload: { email: adminEmail, password: "x" } })).body);
    assert.equal(parsed.error.code, "RATE_LIMIT_EXCEEDED");
  });

  await t.test("deactivated user (status != ACTIVE) cannot use a previously issued session", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } });
    await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    const memberCookies = await loginMember().catch(() => null);
    assert.equal(memberCookies, null, "suspended user could still log in");
    await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
  });

  await t.test("reset tokens are single-use and expire", async () => {
    const { hashToken } = await import("../src/lib/security.js");
    const member = await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } });
    const token = `reset-${marker}-${"y".repeat(40)}`;
    await prisma.passwordResetToken.create({ data: { userId: member.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });

    const first = await app.inject({ method: "POST", url: "/api/v1/auth/reset-password", remoteAddress: nextIp(), payload: { token, password: "ResetPassword999" } });
    assert.equal(first.statusCode, 200);
    const second = await app.inject({ method: "POST", url: "/api/v1/auth/reset-password", remoteAddress: nextIp(), payload: { token, password: "AnotherPass9999" } });
    assert.equal(second.statusCode, 400, "reset token reusable");

    const expiredToken = `expired-${marker}-${"z".repeat(40)}`;
    await prisma.passwordResetToken.create({ data: { userId: member.id, tokenHash: hashToken(expiredToken), expiresAt: new Date(Date.now() - 60_000) } });
    const expired = await app.inject({ method: "POST", url: "/api/v1/auth/reset-password", remoteAddress: nextIp(), payload: { token: expiredToken, password: "WhateverPass123" } });
    assert.equal(expired.statusCode, 400);
  });
});
