import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();

before(async () => {
  await app.ready();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test("health reports the real database state and allows the configured origin", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/health",
    headers: {
      origin: "http://localhost:5173"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:5173");
  const body = response.json();
  assert.equal(body.service, "nexora-api");
  assert.equal(body.status, "operational");
  assert.equal(body.version, "0.1.0");
  assert.ok(body.uptime >= 0, "Should have uptime");
  assert.ok(Array.isArray(body.checks), "Should have checks array");
  assert.ok(body.checks.length >= 3, "Should have at least 3 checks");
  const dbCheck = body.checks.find((c: { name: string }) => c.name === "database");
  assert.ok(dbCheck, "Should have database check");
  assert.equal(dbCheck.status, "operational");
  assert.equal(Number.isNaN(Date.parse(body.timestamp)), false);
});

test("health allows the Vite loopback origin during development", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/health",
    headers: {
      origin: "http://127.0.0.1:5173"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], "http://127.0.0.1:5173");
});

test("health rejects an origin that is not configured", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/health",
    headers: {
      origin: "https://untrusted.example"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});
