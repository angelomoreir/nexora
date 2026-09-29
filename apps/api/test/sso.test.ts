import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `sso-admin-${marker}@example.com`;
const organizationIds: string[] = [];
const issuer = `https://idp-${marker}.example.test`;
const tokenEndpoint = `${issuer}/token`;
const jwksUri = `${issuer}/jwks`;
const ssoEmail = `sso.user@corp-${marker}.com`;

const { publicKey, privateKey } = await generateKeyPair("RS256");
const publicJwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
let idTokenNonce = "";
const idTokenSubject = "idp-sub-1";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === `${issuer}/.well-known/openid-configuration`) {
    return Response.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: tokenEndpoint,
      jwks_uri: jwksUri
    });
  }
  if (url === tokenEndpoint) {
    const idToken = await new SignJWT({
      sub: idTokenSubject,
      email: ssoEmail,
      name: "SSO User",
      nonce: idTokenNonce
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "JWT" })
      .setIssuer(issuer)
      .setAudience("test-client-id")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);
    return Response.json({ id_token: idToken, access_token: "at_test", token_type: "Bearer" });
  }
  if (url === jwksUri) {
    return Response.json({ keys: [publicJwk] });
  }
  return originalFetch(input, init);
};

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => app.ready());
after(async () => {
  globalThis.fetch = originalFetch;
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, ssoEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("SSO OIDC: config CRUD, domain lookup, authorize redirect, callback provisions user", async () => {
  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "SSO Admin", email: adminEmail, password: "SsoAdminPass123", organizationName: "SSO Org" }
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  // --- No config initially ---
  const empty = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/sso`, headers: { cookie: adminCookies } });
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.json(), null);

  // --- Configure SSO ---
  const save = await app.inject({
    method: "PUT",
    url: `/api/v1/organizations/${organizationId}/sso`,
    headers: { cookie: adminCookies },
    payload: {
      issuerUrl: issuer,
      clientId: "test-client-id",
      clientSecret: "test-secret",
      emailDomains: [`corp-${marker}.com`],
      isEnabled: true
    }
  });
  assert.equal(save.statusCode, 200, save.body);
  assert.equal(save.json().isEnabled, true);
  assert.equal(save.json().clientSecretSet, true);
  assert.equal(save.json().clientSecret, undefined, "Secret must never be returned");

  // --- Lookup finds the org by email domain ---
  const lookup = await app.inject({
    method: "POST",
    url: "/api/v1/auth/sso/lookup",
    payload: { email: `someone@corp-${marker}.com` }
  });
  assert.equal(lookup.statusCode, 200);
  assert.equal(lookup.json().enabled, true);
  assert.equal(lookup.json().organizationId, organizationId);

  const lookupMiss = await app.inject({
    method: "POST",
    url: "/api/v1/auth/sso/lookup",
    payload: { email: "someone@other-domain.com" }
  });
  assert.equal(lookupMiss.json().enabled, false);

  // --- Start → redirect to IdP authorize ---
  const start = await app.inject({ method: "GET", url: `/api/v1/auth/sso/${organizationId}/start` });
  assert.equal(start.statusCode, 302, start.body);
  const authorizeUrl = new URL(start.headers.location as string);
  assert.equal(authorizeUrl.origin + authorizeUrl.pathname, `${issuer}/authorize`);
  const state = authorizeUrl.searchParams.get("state")!;
  idTokenNonce = authorizeUrl.searchParams.get("nonce")!;
  assert.ok(state && idTokenNonce);

  // --- Callback → verifies, provisions, issues session, redirects ---
  const callback = await app.inject({ method: "GET", url: `/api/v1/auth/sso/callback?code=fake-code&state=${encodeURIComponent(state)}` });
  assert.equal(callback.statusCode, 302, callback.body);
  assert.ok((callback.headers.location as string).endsWith("/dashboard"));
  assert.ok(cookies(callback).includes("nexora_access"), "Session cookies should be set");

  // User was provisioned and is a member
  const user = await prisma.user.findUnique({ where: { email: ssoEmail } });
  assert.ok(user, "JIT-provisioned user should exist");
  const membership = await prisma.organizationMember.findFirst({ where: { tenantId: organizationId, userId: user!.id, status: "ACTIVE" } });
  assert.ok(membership, "Membership should be created");

  // --- Invalid state rejected ---
  const badState = await app.inject({ method: "GET", url: "/api/v1/auth/sso/callback?code=x&state=forged" });
  assert.equal(badState.statusCode, 302);
  assert.ok((badState.headers.location as string).includes("sso=error"));

  // --- Disabled SSO blocks the flow ---
  await app.inject({
    method: "PUT",
    url: `/api/v1/organizations/${organizationId}/sso`,
    headers: { cookie: adminCookies },
    payload: { issuerUrl: issuer, clientId: "test-client-id", emailDomains: [`corp-${marker}.com`], isEnabled: false }
  });
  const disabledLookup = await app.inject({ method: "POST", url: "/api/v1/auth/sso/lookup", payload: { email: `a@corp-${marker}.com` } });
  assert.equal(disabledLookup.json().enabled, false);
  const disabledStart = await app.inject({ method: "GET", url: `/api/v1/auth/sso/${organizationId}/start` });
  assert.equal(disabledStart.statusCode, 404);
});
