import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { createOpaqueToken } from "../../lib/security.js";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { prisma, transactionOptions } from "../../lib/prisma.js";
import { issueSession } from "./auth.service.js";

// --- OIDC SSO ---
// Authorization Code flow against any OIDC-compliant provider
// (Microsoft Entra ID, Okta, Auth0, Google Workspace, Keycloak, ...).

const stateSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const STATE_ISSUER = "nexora-sso";
const STATE_TTL_SECONDS = 600;

export const SSO_CALLBACK_URL = `${env.API_PUBLIC_URL}/api/v1/auth/sso/callback`;

// --- Configuration management ---

const ssoConfigSchemaDefaults = {
  scopes: "openid profile email",
  emailDomains: [] as string[]
};

export interface SsoConfigInput {
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string;
  emailDomains?: string[];
  isEnabled?: boolean;
}

export async function getSsoConfig(tenantId: string) {
  const config = await prisma.ssoConfiguration.findUnique({ where: { tenantId } });
  if (!config) return null;
  return {
    provider: config.provider,
    issuerUrl: config.issuerUrl,
    clientId: config.clientId,
    clientSecretSet: Boolean(config.clientSecret),
    scopes: config.scopes,
    emailDomains: safeParseDomains(config.emailDomains),
    isEnabled: config.isEnabled
  };
}

function safeParseDomains(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

export async function upsertSsoConfig(tenantId: string, actorMembershipId: string, input: SsoConfigInput) {
  const domains = (input.emailDomains ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean);
  const issuerUrl = input.issuerUrl.replace(/\/+$/, "");

  const config = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.ssoConfiguration.findUnique({ where: { tenantId } });
    const data = {
      issuerUrl,
      clientId: input.clientId,
      ...(input.clientSecret ? { clientSecret: input.clientSecret } : {}),
      scopes: input.scopes ?? ssoConfigSchemaDefaults.scopes,
      emailDomains: JSON.stringify(domains),
      isEnabled: input.isEnabled ?? false
    };
    const saved = existing
      ? await transaction.ssoConfiguration.update({ where: { tenantId }, data })
      : await transaction.ssoConfiguration.create({ data: { tenantId, ...data, clientSecret: input.clientSecret ?? "" } });
    await transaction.auditLog.create({
      data: {
        tenantId,
        actorId: actorMembershipId,
        action: existing ? "sso.updated" : "sso.created",
        resourceType: "SsoConfiguration",
        resourceId: saved.id,
        result: "SUCCESS"
      }
    });
    return saved;
  }, transactionOptions);

  // Invalidate cached discovery when the issuer changes
  discoveryCache.delete(issuerUrl);
  return getSsoConfig(config.tenantId);
}

export async function deleteSsoConfig(tenantId: string, actorMembershipId: string) {
  const existing = await prisma.ssoConfiguration.findUnique({ where: { tenantId } });
  if (!existing) return;
  await prisma.$transaction([
    prisma.ssoConfiguration.delete({ where: { tenantId } }),
    prisma.auditLog.create({
      data: { tenantId, actorId: actorMembershipId, action: "sso.deleted", resourceType: "SsoConfiguration", resourceId: existing.id, result: "SUCCESS" }
    })
  ]);
}

// --- Email → organization lookup (login page "Continue with SSO") ---

export async function lookupSsoByEmail(emailInput: string) {
  const domain = emailInput.trim().toLowerCase().split("@")[1];
  if (!domain) return { enabled: false as const };
  const configs = await prisma.ssoConfiguration.findMany({ where: { isEnabled: true } });
  for (const config of configs) {
    if (safeParseDomains(config.emailDomains).includes(domain)) {
      const org = await prisma.organization.findUnique({ where: { id: config.tenantId }, select: { id: true, name: true, status: true } });
      if (org && org.status === "ACTIVE") {
        return { enabled: true as const, organizationId: org.id, organizationName: org.name };
      }
    }
  }
  return { enabled: false as const };
}

// --- OIDC discovery (cached) ---

interface OidcMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

const discoveryCache = new Map<string, { metadata: OidcMetadata; expiresAt: number }>();
const DISCOVERY_TTL_MS = 3_600_000;

async function discoverOidc(issuerUrl: string): Promise<OidcMetadata> {
  const cached = discoveryCache.get(issuerUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.metadata;

  const response = await fetch(`${issuerUrl}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    throw new AppError(502, "SSO_DISCOVERY_FAILED", "Could not read the identity provider configuration.");
  }
  const doc = (await response.json()) as Record<string, unknown>;
  if (typeof doc.authorization_endpoint !== "string" || typeof doc.token_endpoint !== "string" || typeof doc.jwks_uri !== "string") {
    throw new AppError(502, "SSO_DISCOVERY_INVALID", "The identity provider metadata is incomplete.");
  }
  const metadata: OidcMetadata = {
    issuer: typeof doc.issuer === "string" ? doc.issuer : issuerUrl,
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    jwksUri: doc.jwks_uri
  };
  discoveryCache.set(issuerUrl, { metadata, expiresAt: Date.now() + DISCOVERY_TTL_MS });
  return metadata;
}

// --- Authorization redirect ---

export async function buildSsoAuthorizeUrl(organizationId: string): Promise<string> {
  const config = await prisma.ssoConfiguration.findUnique({ where: { tenantId: organizationId } });
  if (!config?.isEnabled) {
    throw new AppError(404, "SSO_NOT_CONFIGURED", "Single sign-on is not configured for this organization.");
  }
  const metadata = await discoverOidc(config.issuerUrl);
  const nonce = createOpaqueToken();
  const state = await new SignJWT({ tenantId: organizationId, nonce })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(STATE_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(stateSecret);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: SSO_CALLBACK_URL,
    scope: config.scopes,
    state,
    nonce
  });
  return `${metadata.authorizationEndpoint}?${params.toString()}`;
}

// --- Callback: code exchange + id_token verification + JIT provisioning ---

interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export async function handleSsoCallback(input: { code: string; state: string }, metadata: SessionMetadata) {
  let statePayload: { tenantId?: string; nonce?: string };
  try {
    const { payload } = await jwtVerify(input.state, stateSecret, { issuer: STATE_ISSUER });
    statePayload = payload as { tenantId?: string; nonce?: string };
  } catch {
    throw new AppError(400, "SSO_STATE_INVALID", "The sign-in state is invalid or expired.");
  }
  if (!statePayload.tenantId || !statePayload.nonce) {
    throw new AppError(400, "SSO_STATE_INVALID", "The sign-in state is invalid or expired.");
  }

  const config = await prisma.ssoConfiguration.findUnique({ where: { tenantId: statePayload.tenantId } });
  if (!config?.isEnabled) {
    throw new AppError(400, "SSO_NOT_CONFIGURED", "Single sign-on is not configured for this organization.");
  }
  const oidc = await discoverOidc(config.issuerUrl);

  // Exchange the authorization code
  const tokenResponse = await fetch(oidc.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: SSO_CALLBACK_URL,
      client_id: config.clientId,
      client_secret: config.clientSecret
    }).toString(),
    signal: AbortSignal.timeout(15_000)
  });
  if (!tokenResponse.ok) {
    throw new AppError(401, "SSO_TOKEN_EXCHANGE_FAILED", "The identity provider rejected the sign-in.");
  }
  const tokens = (await tokenResponse.json()) as { id_token?: string; access_token?: string };
  if (!tokens.id_token) {
    throw new AppError(401, "SSO_TOKEN_MISSING", "The identity provider did not return an ID token.");
  }

  // Verify the ID token against the provider JWKS
  const jwks = createRemoteJWKSet(new URL(oidc.jwksUri));
  let claims: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(tokens.id_token, jwks, { audience: config.clientId });
    claims = payload as Record<string, unknown>;
  } catch {
    throw new AppError(401, "SSO_TOKEN_INVALID", "The identity token could not be verified.");
  }
  if (claims.nonce !== statePayload.nonce) {
    throw new AppError(401, "SSO_NONCE_MISMATCH", "The sign-in could not be verified.");
  }

  const email = (typeof claims.email === "string" ? claims.email : typeof claims.preferred_username === "string" ? claims.preferred_username : null)?.toLowerCase();
  if (!email) {
    throw new AppError(400, "SSO_EMAIL_MISSING", "The identity provider did not return an email address.");
  }
  const allowedDomains = safeParseDomains(config.emailDomains);
  if (allowedDomains.length > 0 && !allowedDomains.includes(email.split("@")[1] ?? "")) {
    throw new AppError(403, "SSO_DOMAIN_NOT_ALLOWED", "This email domain is not allowed for single sign-on.");
  }

  const displayName = (typeof claims.name === "string" && claims.name.trim()) || email.split("@")[0]!;
  const tenantId = config.tenantId;

  const userId = await prisma.$transaction(async (transaction) => {
    let user = await transaction.user.findUnique({ where: { email } });
    if (!user) {
      user = await transaction.user.create({
        data: { email, name: displayName, passwordHash: null }
      });
    }
    let membership = await transaction.organizationMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } }
    });
    if (!membership) {
      const defaultRole = await transaction.role.findUnique({
        where: { tenantId_name: { tenantId, name: "Member" } }
      });
      membership = await transaction.organizationMember.create({
        data: { tenantId, userId: user.id }
      });
      if (defaultRole) {
        await transaction.organizationMemberRole.create({
          data: { tenantId, membershipId: membership.id, roleId: defaultRole.id }
        });
      }
    } else if (membership.status !== "ACTIVE") {
      await transaction.organizationMember.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
    }
    await transaction.auditLog.create({
      data: {
        tenantId,
        actorId: membership.id,
        action: "auth.sso.login",
        resourceType: "User",
        resourceId: user.id,
        ipAddress: metadata.ipAddress,
        result: "SUCCESS"
      }
    });
    return user.id;
  }, transactionOptions);

  return issueSession(userId, metadata);
}
