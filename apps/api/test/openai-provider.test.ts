import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { OpenAIProvider } from "../src/modules/ai/openai-provider.js";
import { prisma } from "../src/lib/prisma.js";

// Exercises the OpenAI-compatible provider against a mock Chat Completions endpoint.
let server: http.Server;
let baseUrl = "";
let lastRequest: { body?: any; headers?: http.IncomingHttpHeaders } = {};
let handler: (body: any) => { status: number; payload: unknown } = () => ({
  status: 200,
  payload: { choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }
});

before(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      lastRequest = { body: raw ? JSON.parse(raw) : undefined, headers: req.headers };
      const { status, payload } = handler(lastRequest.body);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("OpenAI provider: chat parses reply + action, sends auth and JSON mode", async () => {
  handler = (body) => {
    assert.equal(body.model, "test-model");
    assert.equal(body.response_format?.type, "json_object");
    return {
      status: 200,
      payload: {
        choices: [
          { message: { content: JSON.stringify({ reply: "Aqui está a lista.", action: { type: "create_list", data: { name: "Clientes" } } }) } }
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 }
      }
    };
  };

  const provider = new OpenAIProvider("sk-test", baseUrl, "test-model");
  const result = await provider.chat("cria uma lista de clientes", {
    organizationId: "org-1",
    userId: "u-1",
    userName: "Test",
    capabilities: new Set<string>(),
    language: "pt-PT"
  });

  assert.equal(result.content, "Aqui está a lista.");
  assert.equal(result.actionType, "create_list");
  assert.deepEqual(result.actionData, { name: "Clientes" });
  assert.equal(result.tokensInput, 100);
  assert.equal(result.tokensOutput, 50);
  // Non-OpenAI endpoints (Groq/Ollama/self-hosted) report zero cost
  assert.equal(result.costUsd, 0);
  assert.equal(lastRequest.headers?.["authorization"], "Bearer sk-test");
  assert.match(lastRequest.body.messages[0].content, /European Portuguese/);
});

test("OpenAI provider: summarize returns keywords + classification", async () => {
  handler = () => ({
    status: 200,
    payload: {
      choices: [{ message: { content: JSON.stringify({ summary: "Resumo.", keywords: ["a", "b"], classification: "Contract" }) } }],
      usage: { prompt_tokens: 20, completion_tokens: 10 }
    }
  });
  const provider = new OpenAIProvider("sk-test", baseUrl, "test-model");
  const result = await provider.summarize("conteúdo", "doc.pdf");
  assert.equal(result.content, "Resumo.");
  assert.deepEqual((result.actionData as any).keywords, ["a", "b"]);
  assert.equal((result.actionData as any).classification, "Contract");
});

test("OpenAI provider: tolerates markdown-fenced JSON and provider errors", async () => {
  handler = () => ({
    status: 200,
    payload: { choices: [{ message: { content: "```json\n{\"keywords\": [\"x\"]}\n```" } }], usage: {} }
  });
  const provider = new OpenAIProvider("sk-test", baseUrl, "test-model");
  const fenced = await provider.keywords("texto");
  assert.deepEqual((fenced.actionData as any).keywords, ["x"]);

  handler = () => ({ status: 429, payload: { error: { message: "rate limited" } } });
  await assert.rejects(() => provider.keywords("texto"), /429.*rate limited/);
});
