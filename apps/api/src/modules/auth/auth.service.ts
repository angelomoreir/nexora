import type { AuthSession } from "@nexora/contracts";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { createAccessToken } from "../../lib/jwt.js";
import { prisma, transactionOptions } from "../../lib/prisma.js";
import {
  createOpaqueToken,
  hashPassword,
  hashToken,
  verifyDummyPassword,
  verifyPassword
} from "../../lib/security.js";
import { mailService } from "../../services/mail/mail.service.js";
import { createOrganizationForUser } from "../organizations/organization.service.js";
import { presentOrganizationMembership } from "../organizations/organization.presenter.js";
import { presentUser } from "../users/user.presenter.js";

interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

function refreshExpiry() {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
}

export async function issueSession(userId: string, metadata: SessionMetadata) {
  const refreshToken = createOpaqueToken();
  const session = await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiry(),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent
    }
  });
  return { accessToken: await createAccessToken(userId, session.id), refreshToken };
}

export async function register(
  input: { name: string; email: string; password: string; organizationName: string },
  metadata: SessionMetadata
) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, "EMAIL_ALREADY_EXISTS", "An account with this email already exists.");
    }

    const created = await transaction.user.create({
      data: { name: input.name.trim(), email, passwordHash }
    });
    await createOrganizationForUser(transaction, created.id, input.organizationName.trim());
    return created;
  }, transactionOptions);

  return { session: await issueSession(user.id, metadata), data: await getSession(user.id) };
}

export async function login(input: { email: string; password: string }, metadata: SessionMetadata) {
  const user = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
  if (!user?.passwordHash) {
    await verifyDummyPassword(input.password);
    throw new AppError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid || user.status !== "ACTIVE") {
    throw new AppError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
  }

  return { session: await issueSession(user.id, metadata), data: await getSession(user.id) };
}

export async function rotateRefreshToken(refreshToken: string, metadata: SessionMetadata) {
  const tokenHash = hashToken(refreshToken);
  const existing = await prisma.refreshSession.findUnique({
    where: { tokenHash },
    include: { user: { select: { status: true } } }
  });

  if (!existing || existing.expiresAt <= new Date() || existing.user.status !== "ACTIVE") {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "The refresh token is invalid or expired.");
  }
  if (existing.revokedAt) {
    await prisma.refreshSession.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    throw new AppError(401, "REFRESH_TOKEN_REUSED", "The session is no longer valid.");
  }

  const nextRefreshToken = createOpaqueToken();
  const nextSessionId = await prisma.$transaction(async (transaction) => {
    const revoked = await transaction.refreshSession.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() }
    });
    if (revoked.count !== 1) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "The refresh token is invalid or expired.");
    }
    const nextSession = await transaction.refreshSession.create({
      data: {
        userId: existing.userId,
        tokenHash: hashToken(nextRefreshToken),
        expiresAt: refreshExpiry(),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      }
    });
    return nextSession.id;
  }, transactionOptions);

  return {
    accessToken: await createAccessToken(existing.userId, nextSessionId),
    refreshToken: nextRefreshToken,
    data: await getSession(existing.userId)
  };
}

export async function logout(refreshToken?: string) {
  if (refreshToken) {
    await prisma.refreshSession.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
}

export async function requestPasswordReset(emailInput: string) {
  if (!mailService.available && !env.EXPOSE_PASSWORD_RESET_TOKEN) {
    throw new AppError(503, "PASSWORD_RESET_UNAVAILABLE", "Password recovery is not configured.");
  }

  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") {
    // Normalize timing to prevent email enumeration
    await hashPassword("dummy-password-for-timing-normalization");
    return {};
  }

  const token = createOpaqueToken();
  const resetRecord = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000)
    }
  });

  try {
    await mailService.sendPasswordReset(email, token);
  } catch {
    await prisma.passwordResetToken.delete({ where: { id: resetRecord.id } });
    return {};
  }

  return env.EXPOSE_PASSWORD_RESET_TOKEN ? { resetToken: token } : {};
}

export async function resetPassword(token: string, password: string) {
  const tokenHash = hashToken(token);
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
    throw new AppError(400, "INVALID_RESET_TOKEN", "The password reset token is invalid or expired.");
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (transaction) => {
    const used = await transaction.passwordResetToken.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: new Date() }
    });
    if (used.count !== 1) {
      throw new AppError(400, "INVALID_RESET_TOKEN", "The password reset token is invalid or expired.");
    }
    await transaction.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await transaction.refreshSession.updateMany({
      where: { userId: reset.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }, transactionOptions);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError(400, "INVALID_CURRENT_PASSWORD", "The current password is incorrect.");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);
}

export async function getSession(userId: string): Promise<AuthSession> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { status: "ACTIVE", tenant: { status: "ACTIVE" } },
        include: { tenant: { include: { organizationSettings: { select: { logoUrl: true } } } }, membershipRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return {
    user: presentUser(user),
    organizations: user.memberships.map(presentOrganizationMembership)
  };
}
