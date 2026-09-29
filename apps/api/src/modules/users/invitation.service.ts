import type { InvitationDto, InvitationPreviewDto } from "@nexora/contracts";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { prisma, transactionOptions } from "../../lib/prisma.js";
import { createOpaqueToken, hashPassword, hashToken } from "../../lib/security.js";
import { mailService } from "../../services/mail/mail.service.js";
import { checkLimit } from "../billing/plan.service.js";

const INVITATION_TTL_DAYS = 7;

type InvitationRecord = {
  id: string;
  email: string;
  roleId: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  role: { name: string };
  invitedBy: { user: { name: string } };
};

function invitationStatus(invitation: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }): InvitationDto["status"] {
  if (invitation.acceptedAt) return "ACCEPTED";
  if (invitation.revokedAt) return "REVOKED";
  if (invitation.expiresAt <= new Date()) return "EXPIRED";
  return "PENDING";
}

function presentInvitation(invitation: InvitationRecord): InvitationDto {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role.name,
    invitedByName: invitation.invitedBy.user.name,
    status: invitationStatus(invitation),
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString()
  };
}

const invitationInclude = {
  role: { select: { name: true } },
  invitedBy: { select: { user: { select: { name: true } } } }
} as const;

export function buildInvitationUrl(token: string): string {
  const url = new URL("/accept-invite", env.APP_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function createInvitation(
  organizationId: string,
  inviterUserId: string,
  input: { email: string; role: string }
): Promise<{ invitation: InvitationDto; inviteUrl: string; emailSent: boolean }> {
  const email = input.email.trim().toLowerCase();

  const role = await prisma.role.findUnique({
    where: { tenantId_name: { tenantId: organizationId, name: input.role } }
  });
  if (!role) {
    throw new AppError(404, "ROLE_NOT_FOUND", "The selected role does not exist.");
  }

  const inviter = await prisma.organizationMember.findUnique({
    where: { tenantId_userId: { tenantId: organizationId, userId: inviterUserId } },
    include: { user: true, tenant: true }
  });
  if (!inviter) {
    throw new AppError(403, "FORBIDDEN", "You are not a member of this organization.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { memberships: { where: { tenantId: organizationId, status: "ACTIVE" }, select: { id: true } } }
  });
  if (existingUser && existingUser.memberships.length > 0) {
    throw new AppError(409, "ALREADY_MEMBER", "This user is already a member of the organization.");
  }

  await checkLimit(organizationId, "users");

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);

  const invitation = await prisma.$transaction(async (transaction) => {
    // Supersede any earlier pending invitation for the same email
    await transaction.invitation.updateMany({
      where: { tenantId: organizationId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    const created = await transaction.invitation.create({
      data: {
        tenantId: organizationId,
        email,
        roleId: role.id,
        tokenHash: hashToken(token),
        invitedById: inviter.id,
        expiresAt
      },
      include: invitationInclude
    });
    await transaction.auditLog.create({
      data: {
        tenantId: organizationId,
        actorId: inviter.id,
        action: "invitation.created",
        resourceType: "Invitation",
        resourceId: created.id,
        result: "SUCCESS"
      }
    });
    return created;
  }, transactionOptions);

  const inviteUrl = buildInvitationUrl(token);
  let emailSent = false;
  try {
    emailSent = await mailService.sendInvitation(email, inviter.tenant.name, inviter.user.name, inviteUrl);
  } catch {
    emailSent = false;
  }

  return { invitation: presentInvitation(invitation), inviteUrl, emailSent };
}

export async function listInvitations(organizationId: string): Promise<InvitationDto[]> {
  const invitations = await prisma.invitation.findMany({
    where: { tenantId: organizationId, acceptedAt: null, revokedAt: null },
    include: invitationInclude,
    orderBy: { createdAt: "desc" }
  });
  return invitations.map(presentInvitation);
}

export async function revokeInvitation(organizationId: string, invitationId: string, actorUserId: string): Promise<void> {
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, tenantId: organizationId, acceptedAt: null, revokedAt: null }
  });
  if (!invitation) {
    throw new AppError(404, "INVITATION_NOT_FOUND", "The invitation was not found.");
  }
  const actor = await prisma.organizationMember.findUnique({
    where: { tenantId_userId: { tenantId: organizationId, userId: actorUserId } }
  });
  await prisma.$transaction([
    prisma.invitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        tenantId: organizationId,
        actorId: actor?.id,
        action: "invitation.revoked",
        resourceType: "Invitation",
        resourceId: invitation.id,
        result: "SUCCESS"
      }
    })
  ]);
}

async function findValidInvitation(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      tenant: { select: { name: true } },
      role: { select: { name: true } },
      invitedBy: { select: { user: { select: { name: true } } } }
    }
  });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
    throw new AppError(410, "INVITATION_INVALID", "This invitation is no longer valid.");
  }
  return invitation;
}

export async function getInvitationPreview(token: string): Promise<InvitationPreviewDto> {
  const invitation = await findValidInvitation(token);
  const accountExists = Boolean(await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } }));
  return {
    organizationName: invitation.tenant.name,
    email: invitation.email,
    role: invitation.role.name,
    inviterName: invitation.invitedBy.user.name,
    expiresAt: invitation.expiresAt.toISOString(),
    accountExists
  };
}

export async function acceptInvitation(
  token: string,
  input: { name?: string; password?: string },
  metadata: { ipAddress?: string; userAgent?: string }
) {
  const invitation = await findValidInvitation(token);
  await checkLimit(invitation.tenantId, "users");

  const userId = await prisma.$transaction(async (transaction) => {
    // Re-validate inside the transaction to prevent double acceptance races
    const claimed = await transaction.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() }
    });
    if (claimed.count !== 1) {
      throw new AppError(410, "INVITATION_INVALID", "This invitation is no longer valid.");
    }

    let user = await transaction.user.findUnique({ where: { email: invitation.email } });
    if (!user) {
      if (!input.name || !input.password) {
        throw new AppError(400, "ACCOUNT_DETAILS_REQUIRED", "A name and password are required to create your account.");
      }
      user = await transaction.user.create({
        data: { name: input.name.trim(), email: invitation.email, passwordHash: await hashPassword(input.password) }
      });
    }

    const existingMembership = await transaction.organizationMember.findUnique({
      where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user.id } }
    });
    if (existingMembership) {
      if (existingMembership.status !== "ACTIVE") {
        await transaction.organizationMember.update({ where: { id: existingMembership.id }, data: { status: "ACTIVE" } });
      }
      return user.id;
    }

    const membership = await transaction.organizationMember.create({
      data: { tenantId: invitation.tenantId, userId: user.id }
    });
    await transaction.organizationMemberRole.create({
      data: { tenantId: invitation.tenantId, membershipId: membership.id, roleId: invitation.roleId }
    });
    await transaction.auditLog.create({
      data: {
        tenantId: invitation.tenantId,
        actorId: membership.id,
        action: "invitation.accepted",
        resourceType: "Invitation",
        resourceId: invitation.id,
        ipAddress: metadata.ipAddress,
        result: "SUCCESS"
      }
    });
    return user.id;
  }, transactionOptions);

  return userId;
}
