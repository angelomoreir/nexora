import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../../lib/cookies.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { hashToken } from "../../lib/security.js";
import { presentUser } from "../users/user.presenter.js";
import { acceptInvitationSchema } from "../users/user.schemas.js";
import { acceptInvitation, getInvitationPreview } from "../users/invitation.service.js";
import { authenticate } from "./auth.guard.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema
} from "./auth.schemas.js";
import {
  changePassword,
  getSession,
  issueSession,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  rotateRefreshToken
} from "./auth.service.js";

function sessionMetadata(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]?.slice(0, 500)
  };
}

const authRateLimit = { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } };

export const authRoute: FastifyPluginAsync = async (app) => {
  app.post("/register", authRateLimit, async (request, reply) => {
    const result = await register(registerSchema.parse(request.body), sessionMetadata(request));
    setAuthCookies(reply, result.session.accessToken, result.session.refreshToken);
    return reply.status(201).send(result.data);
  });

  app.post("/login", authRateLimit, async (request, reply) => {
    const result = await login(loginSchema.parse(request.body), sessionMetadata(request));
    setAuthCookies(reply, result.session.accessToken, result.session.refreshToken);
    // Audit: login success — log to all user's organizations
    const memberships = await prisma.organizationMember.findMany({ where: { userId: result.data.user.id, status: "ACTIVE" } });
    const ip = request.ip;
    await Promise.all(memberships.map((m) => prisma.auditLog.create({
      data: { tenantId: m.tenantId, actorId: m.id, action: "auth.login", resourceType: "User", resourceId: result.data.user.id, ipAddress: ip, result: "SUCCESS" }
    })));
    return result.data;
  });

  app.post("/refresh", authRateLimit, async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (!token) {
      throw new AppError(401, "REFRESH_TOKEN_REQUIRED", "A refresh token is required.");
    }
    const result = await rotateRefreshToken(token, sessionMetadata(request));
    setAuthCookies(reply, result.accessToken, result.refreshToken);
    return result.data;
  });

  app.post("/logout", async (request, reply) => {
    // Try to identify the user from the refresh token for audit before revoking
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (refreshToken) {
      try {
        const tokenHash = hashToken(refreshToken);
        const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });
        if (session && session.userId) {
          const memberships = await prisma.organizationMember.findMany({ where: { userId: session.userId, status: "ACTIVE" } });
          const ip = request.ip;
          await Promise.all(memberships.map((m) => prisma.auditLog.create({
            data: { tenantId: m.tenantId, actorId: m.id, action: "auth.logout", resourceType: "User", resourceId: session.userId, ipAddress: ip, result: "SUCCESS" }
          })));
        }
      } catch { /* ignore audit errors on logout */ }
    }
    await logout(refreshToken);
    clearAuthCookies(reply);
    return reply.status(204).send();
  });

  app.post("/forgot-password", authRateLimit, async (request) => {
    const result = await requestPasswordReset(forgotPasswordSchema.parse(request.body).email);
    return {
      message: "If the account exists, password recovery instructions have been sent.",
      ...(env.NODE_ENV !== "production" ? result : {})
    };
  });

  app.post("/reset-password", authRateLimit, async (request, reply) => {
    const input = resetPasswordSchema.parse(request.body);
    await resetPassword(input.token, input.password);
    clearAuthCookies(reply);
    return { message: "Password updated successfully." };
  });

  app.post("/change-password", { preHandler: authenticate }, async (request, reply) => {
    const input = changePasswordSchema.parse(request.body);
    await changePassword(request.auth!.userId, input.currentPassword, input.newPassword);
    clearAuthCookies(reply);
    return { message: "Password updated. Sign in again on all devices." };
  });

  app.get("/invitations/:token", authRateLimit, async (request) => {
    const { token } = request.params as { token: string };
    return getInvitationPreview(token);
  });

  app.post("/invitations/:token/accept", authRateLimit, async (request, reply) => {
    const { token } = request.params as { token: string };
    const input = acceptInvitationSchema.parse(request.body ?? {});
    const userId = await acceptInvitation(token, input, sessionMetadata(request));
    const session = await issueSession(userId, sessionMetadata(request));
    setAuthCookies(reply, session.accessToken, session.refreshToken);
    return reply.status(201).send(await getSession(userId));
  });

  app.get("/me", { preHandler: authenticate }, async (request) => getSession(request.auth!.userId));

  app.patch("/me", { preHandler: authenticate }, async (request) => {
    const input = updateProfileSchema.parse(request.body);
    const user = await prisma.user.update({ where: { id: request.auth!.userId }, data: input });
    return presentUser(user);
  });

  app.get("/sessions", { preHandler: authenticate }, async (request) => {
    const userId = request.auth!.userId;
    const refreshCookie = request.cookies[REFRESH_COOKIE];
    const currentHash = refreshCookie ? hashToken(refreshCookie) : null;
    const sessions = await prisma.refreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
    });
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
        current: session.tokenHash === currentHash || session.id === request.auth!.sessionId
      }))
    };
  });

  app.delete("/sessions/:sessionId", { preHandler: authenticate }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const revoked = await prisma.refreshSession.updateMany({
      where: { id: sessionId, userId: request.auth!.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    if (revoked.count === 0) {
      throw new AppError(404, "NOT_FOUND", "The session was not found.");
    }
    return reply.status(204).send();
  });

};
