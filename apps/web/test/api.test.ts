import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { getHealth } from "../src/lib/api.js";

let server: Server;
let apiUrl: string;

before(async () => {
  server = createServer((request, response) => {
    if (request.url === "/api/v1/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          service: "nexora-api",
          status: "operational",
          database: "operational",
          timestamp: "2026-09-10T00:00:00.000Z",
          version: "0.1.0"
        })
      );
      return;
    }

    response.writeHead(503);
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  apiUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("returns a typed health response", async () => {
  const health = await getHealth(apiUrl);

  assert.equal(health.status, "operational");
  assert.equal(health.database, "operational");
});

test("rejects non-successful API responses", async () => {
  await assert.rejects(getHealth(`${apiUrl}/missing`), /status 503/);
});
