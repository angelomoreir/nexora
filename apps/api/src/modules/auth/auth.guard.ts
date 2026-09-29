import type { FastifyReply, FastifyRequest } from "fastify";
import { ACCESS_COOKIE } from "../../lib/cookies.js";
import { AppError } from "../../lib/errors.js";
import { verifyAccessToken } from "../../lib/jwt.js";
import { prisma } from "../../lib/prisma.js";

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  const authorization = request.headers.authorization;
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const token = request.cookies[ACCESS_COOKIE] ?? bearerToken;

  if (!token) {
    throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  try {
    const { userId, sessionId } = await verifyAccessToken(token);
    const session = await prisma.refreshSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { select: { status: true, isSuperAdmin: true } } }
    });
    if (!session || session.user.status !== "ACTIVE") {
      throw new Error("Inactive session");
    }
    request.auth = { userId, sessionId, isSuperAdmin: session.user.isSuperAdmin };
  } catch {
    throw new AppError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired.");
  }
}
