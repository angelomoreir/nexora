import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `upl-admin-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.${220 + Math.floor(ipCounter / 200)}.${ipCounter % 200}.5`;
}

async function multipart(filename: string, mimeType: string, content: Uint8Array | string, extraFields: Record<string, string> = {}) {
  const form = new FormData();
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  form.append("file", new Blob([Uint8Array.from(bytes).buffer], { type: mimeType }), filename);
  for (const [key, value] of Object.entries(extraFields)) form.append(key, value);
  const request = new Request("http://localhost", { method: "POST", body: form });
  return { payload: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get("content-type")! };
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: marker } } });
  await app.close();
  await prisma.$disconnect();
});

test("document uploads and share links resist hostile input", async (t) => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", remoteAddress: nextIp(), payload: { name: "Upl Admin", email: adminEmail, password: "UplPassword1234", organizationName: "Upl Org" } });
  assert.equal(registration.statusCode, 201);
  const org = registration.json().organizations[0].id as string;
  organizationIds.push(org);
  const admin = cookies(registration);

  async function tryUpload(filename: string, mimeType: string, content: string | Uint8Array, fields?: Record<string, string>) {
    const body = await multipart(filename, mimeType, typeof content === "string" ? new TextEncoder().encode(content) : content, fields);
    return app.inject({ method: "POST", url: `/api/v1/organizations/${org}/documents`, headers: { cookie: admin, "content-type": body.contentType }, remoteAddress: nextIp(), payload: body.payload });
  }

  await t.test("dangerous extensions and MIME spoofing are rejected", async () => {
    const cases: Array<[string, string, string, string]> = [
      ["evil.exe", "application/octet-stream", "MZ", "executable"],
      ["evil.sh", "application/x-sh", "#!/bin/sh\necho hi", "shell script"],
      ["evil.html", "text/html", "<script>alert(1)</script>", "HTML"],
      ["evil.svg", "image/svg+xml", "<svg onload=alert(1)></svg>", "SVG (XSS vector)"],
      ["evil.js", "application/javascript", "alert(1)", "JavaScript"],
      ["evil.php", "application/x-php", "<?php echo 1; ?>", "PHP"],
      ["evil.pdf.exe", "application/octet-stream", "MZ", "double extension"],
      ["report.pdf", "application/pdf", "MZ fake pdf content", "spoofed PDF content"],
      ["report.pdf", "text/plain", "%PDF-1.4 ok", "MIME mismatch pdf/txt"],
      ["noext", "application/octet-stream", "data", "no extension"],
      ["image.png", "image/png", "not a real png", "spoofed PNG content"]
    ];
    for (const [filename, mime, content, label] of cases) {
      const response = await tryUpload(filename, mime, content);
      assert.ok(response.statusCode === 400 || response.statusCode === 415, `${label} (${filename}) -> ${response.statusCode}: ${response.body.slice(0, 160)}`);
    }
  });

  await t.test("filename traversal is neutralized to a safe basename", async () => {
    const traversal = await tryUpload("../../etc/passwd.pdf", "application/pdf", "%PDF-1.4 ok");
    if (traversal.statusCode === 201) {
      const name = traversal.json().document.name as string;
      assert.ok(!name.includes("..") && !name.includes("/") && !name.includes("\\"), `stored filename contains traversal: ${name}`);
      const stored = await prisma.document.findUniqueOrThrow({ where: { id: traversal.json().document.id } });
      assert.ok(stored.storageKey!.startsWith(`${org}/`), `storage key escaped tenant prefix: ${stored.storageKey}`);
    } else {
      assert.ok(traversal.statusCode === 400 || traversal.statusCode === 415, `traversal filename -> ${traversal.statusCode}`);
    }
  });

  await t.test("empty file and unicode filename edge cases", async () => {
    const empty = await tryUpload("vazio.txt", "text/plain", "");
    assert.ok(empty.statusCode < 500, `empty file -> ${empty.statusCode}`);

    const unicode = await tryUpload("relatório 2026 — final (v2).txt", "text/plain", "conteúdo");
    assert.equal(unicode.statusCode, 201, unicode.body);
  });

  await t.test("public share links: lifecycle, password enforcement and isolation", async () => {
    // Upload a document to share
    const upload = await tryUpload("partilhado.txt", "text/plain", "dados partilhados");
    assert.equal(upload.statusCode, 201, upload.body);
    const docId = upload.json().document.id as string;

    // Create a password-protected share link
    const link = await app.inject({ method: "POST", url: `/api/v1/organizations/${org}/documents/${docId}/share-links`, headers: { cookie: admin }, remoteAddress: nextIp(), payload: { expiresInHours: 24, password: "SharePass123", permission: "READ" } });
    assert.equal(link.statusCode, 201, link.body);
    const url = link.json().url as string;
    const token = url.split("/share/")[1];
    assert.ok(token, "share URL missing token");

    // Without password -> rejected (401/403), without leaking document content
    const noPass = await app.inject({ method: "GET", url: `/api/v1/shares/${token}`, remoteAddress: nextIp() });
    assert.ok(noPass.statusCode === 401 || noPass.statusCode === 403, `no password -> ${noPass.statusCode}`);
    assert.ok(!noPass.body.includes("dados partilhados"));

    // Wrong password -> rejected
    const wrongPass = await app.inject({ method: "GET", url: `/api/v1/shares/${token}`, headers: { "x-share-password": "WrongPass999" }, remoteAddress: nextIp() });
    assert.ok(wrongPass.statusCode === 401 || wrongPass.statusCode === 403, `wrong password -> ${wrongPass.statusCode}`);

    // Correct password -> metadata visible, download works
    const okMeta = await app.inject({ method: "GET", url: `/api/v1/shares/${token}`, headers: { "x-share-password": "SharePass123" }, remoteAddress: nextIp() });
    assert.equal(okMeta.statusCode, 200, okMeta.body);
    const okDownload = await app.inject({ method: "GET", url: `/api/v1/shares/${token}/download`, headers: { "x-share-password": "SharePass123" }, remoteAddress: nextIp() });
    assert.equal(okDownload.statusCode, 200);
    assert.equal(okDownload.rawPayload.toString(), "dados partilhados");

    // Tampered token -> not found
    const tampered = await app.inject({ method: "GET", url: `/api/v1/shares/${token.slice(0, -2)}xx/download`, remoteAddress: nextIp() });
    assert.ok(tampered.statusCode === 404 || tampered.statusCode === 400, `tampered token -> ${tampered.statusCode}`);

    // Revocation kills the link immediately
    const links = await app.inject({ method: "GET", url: `/api/v1/organizations/${org}/documents/${docId}/share-links`, headers: { cookie: admin }, remoteAddress: nextIp() });
    const linkId = links.json()[0].id as string;
    const revoke = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${org}/documents/${docId}/share-links/${linkId}`, headers: { cookie: admin }, remoteAddress: nextIp() });
    assert.equal(revoke.statusCode, 204);
    const afterRevoke = await app.inject({ method: "GET", url: `/api/v1/shares/${token}`, headers: { "x-share-password": "SharePass123" }, remoteAddress: nextIp() });
    assert.ok(afterRevoke.statusCode === 404 || afterRevoke.statusCode === 410 || afterRevoke.statusCode === 403, `revoked link -> ${afterRevoke.statusCode}`);
  });

  await t.test("download requires authentication and tenant membership", async () => {
    const upload = await tryUpload("privado.txt", "text/plain", "segredo");
    assert.equal(upload.statusCode, 201);
    const docId = upload.json().document.id as string;

    const unauth = await app.inject({ method: "GET", url: `/api/v1/organizations/${org}/documents/${docId}/download`, remoteAddress: nextIp() });
    assert.equal(unauth.statusCode, 401);

    // Direct storage URL is never exposed — document DTO must not include storageKey
    const detail = await app.inject({ method: "GET", url: `/api/v1/organizations/${org}/documents/${docId}`, headers: { cookie: admin }, remoteAddress: nextIp() });
    assert.equal(detail.statusCode, 200);
    assert.ok(!detail.body.includes("storageKey"), "document detail leaked storage key");
  });
});
