import type { ApprovalCommentDto, ApprovalDetailDto, ApprovalsResponse } from "@nexora/contracts";
import type { Approval, ApprovalComment, ApprovalDelegation } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { notify } from "../notifications/notification.service.js";
import { publishResourceEvent } from "../collaboration/realtime.service.js";

interface ActorContext {
  organizationId: string;
  userId: string;
  membershipId: string;
  isSuperAdmin: boolean;
}

export async function getActor(organizationId: string, userId: string, isSuperAdmin: boolean): Promise<ActorContext> {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return { organizationId, userId, membershipId: membership.id, isSuperAdmin };
}

type ApprovalWithRelations = Approval & {
  workflowInstance: { id: string; workflowDefinition: { name: string }; startedBy: { id: string; userId: string; user: { id: string; name: string } } };
  approver: { id: string; userId: string; user: { id: string; name: string } };
  delegatedBy: { id: string; userId: string; user: { id: string; name: string } } | null;
  comments: (ApprovalComment & { author: { id: string; userId: string; user: { id: string; name: string } } })[];
  delegations: (ApprovalDelegation & {
    fromMember: { id: string; userId: string; user: { id: string; name: string } };
    toMember: { id: string; userId: string; user: { id: string; name: string } };
  })[];
};

function toDetailDto(approval: ApprovalWithRelations): ApprovalDetailDto {
  return {
    id: approval.id,
    status: approval.status as ApprovalDetailDto["status"],
    stepOrder: approval.stepOrder,
    workflowInstanceId: approval.workflowInstanceId,
    workflowName: approval.workflowInstance.workflowDefinition.name,
    approver: { id: approval.approver.user.id, name: approval.approver.user.name },
    delegatedBy: approval.delegatedBy ? { id: approval.delegatedBy.user.id, name: approval.delegatedBy.user.name } : null,
    decisionNote: approval.decisionNote,
    decidedAt: approval.decidedAt?.toISOString() ?? null,
    createdAt: approval.createdAt.toISOString(),
    comments: approval.comments.map((c) => ({
      id: c.id,
      author: { id: c.author.user.id, name: c.author.user.name },
      body: c.body,
      createdAt: c.createdAt.toISOString()
    })),
    delegations: approval.delegations.map((d) => ({
      id: d.id,
      fromMember: { id: d.fromMember.user.id, name: d.fromMember.user.name },
      toMember: { id: d.toMember.user.id, name: d.toMember.user.name },
      reason: d.reason,
      createdAt: d.createdAt.toISOString()
    }))
  };
}

// --- List approvals ---

export async function listApprovals(actor: ActorContext, filters: { status?: string; scope?: "mine" | "all" }): Promise<ApprovalsResponse> {
  const where = {
    tenantId: actor.organizationId,
    status: filters.status || undefined,
    ...(filters.scope === "mine" ? { approverId: actor.membershipId } : {})
  };
  const approvals = await prisma.approval.findMany({
    where,
    include: {
      workflowInstance: { include: { workflowDefinition: { select: { name: true } }, startedBy: { include: { user: { select: { id: true, name: true } } } } } },
      approver: { include: { user: { select: { id: true, name: true } } } },
      delegatedBy: { include: { user: { select: { id: true, name: true } } } },
      comments: { include: { author: { include: { user: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "asc" } },
      delegations: { include: { fromMember: { include: { user: { select: { id: true, name: true } } } }, toMember: { include: { user: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "asc" } }
    },
    orderBy: { createdAt: "desc" }
  });
  return { approvals: approvals.map(toDetailDto), total: approvals.length };
}

// --- Get approval detail ---

export async function getApproval(actor: ActorContext, approvalId: string): Promise<ApprovalDetailDto> {
  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, tenantId: actor.organizationId },
    include: {
      workflowInstance: { include: { workflowDefinition: { select: { name: true } }, startedBy: { include: { user: { select: { id: true, name: true } } } } } },
      approver: { include: { user: { select: { id: true, name: true } } } },
      delegatedBy: { include: { user: { select: { id: true, name: true } } } },
      comments: { include: { author: { include: { user: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "asc" } },
      delegations: { include: { fromMember: { include: { user: { select: { id: true, name: true } } } }, toMember: { include: { user: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "asc" } }
    }
  });
  if (!approval) throw new AppError(404, "APPROVAL_NOT_FOUND", "The approval was not found.");
  return toDetailDto(approval);
}

// --- Comment on approval ---

export async function addComment(actor: ActorContext, approvalId: string, body: string): Promise<ApprovalCommentDto> {
  const approval = await prisma.approval.findFirst({ where: { id: approvalId, tenantId: actor.organizationId }, include: { approver: { include: { user: { select: { id: true, name: true } } } }, workflowInstance: { include: { startedBy: { include: { user: { select: { id: true, name: true } } } } } } } });
  if (!approval) throw new AppError(404, "APPROVAL_NOT_FOUND", "The approval was not found.");
  if (approval.status !== "PENDING") throw new AppError(409, "APPROVAL_ALREADY_DECIDED", "Cannot comment on a decided approval.");

  const comment = await prisma.approvalComment.create({
    data: { tenantId: actor.organizationId, approvalId, authorId: actor.membershipId, body },
    include: { author: { include: { user: { select: { id: true, name: true } } } } }
  });

  // Notify the approver if someone else comments
  if (approval.approverId !== actor.membershipId) {
    await notify({
      tenantId: actor.organizationId,
      recipientId: approval.approverId,
      type: "workflow.approval",
      title: "Novo comentário na aprovação",
      body: `${comment.author.user.name} comentou numa aprovação pendente.`,
      data: { approvalId, workflowInstanceId: approval.workflowInstanceId }
    });
  }

  publishResourceEvent(actor.organizationId, "approval", approvalId, "comment.created", { userId: comment.author.user.id, name: comment.author.user.name, avatar: null });
  return {
    id: comment.id,
    author: { id: comment.author.user.id, name: comment.author.user.name },
    body: comment.body,
    createdAt: comment.createdAt.toISOString()
  };
}

// --- Delegate approval ---

export async function delegateApproval(actor: ActorContext, approvalId: string, toMemberId: string, reason?: string): Promise<ApprovalDetailDto> {
  const approval = await prisma.approval.findFirst({ where: { id: approvalId, tenantId: actor.organizationId }, include: { approver: { include: { user: { select: { id: true, name: true } } } }, workflowInstance: { include: { workflowDefinition: { select: { name: true } }, startedBy: { include: { user: { select: { id: true, name: true } } } } } } } });
  if (!approval) throw new AppError(404, "APPROVAL_NOT_FOUND", "The approval was not found.");
  if (approval.status !== "PENDING") throw new AppError(409, "APPROVAL_ALREADY_DECIDED", "Cannot delegate a decided approval.");

  // Only the current approver or a super admin can delegate
  if (approval.approverId !== actor.membershipId && !actor.isSuperAdmin) {
    throw new AppError(403, "FORBIDDEN", "Only the current approver can delegate this approval.");
  }

  // Validate the target member
  const target = await prisma.organizationMember.findFirst({ where: { id: toMemberId, tenantId: actor.organizationId, status: "ACTIVE" }, include: { user: { select: { id: true, name: true } } } });
  if (!target) throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "The target member was not found.");
  if (toMemberId === actor.membershipId) throw new AppError(400, "VALIDATION_ERROR", "Cannot delegate to yourself.");
  if (toMemberId === approval.approverId) throw new AppError(400, "VALIDATION_ERROR", "The approval is already assigned to this member.");

  // Record the delegation
  await prisma.approvalDelegation.create({
    data: { tenantId: actor.organizationId, approvalId, fromMemberId: actor.membershipId, toMemberId, reason }
  });

  // Update the approver to the new person, record who delegated
  await prisma.approval.update({
    where: { id: approvalId },
    data: { approverId: toMemberId, delegatedById: actor.membershipId }
  });

  // Notify the new approver
  await notify({
    tenantId: actor.organizationId,
    recipientId: toMemberId,
    type: "workflow.approval",
    title: "Aprovação delegada",
    body: `${approval.approver.user.name} delegou-lhe uma aprovação no processo "${approval.workflowInstance.workflowDefinition.name}".`,
    data: { approvalId, workflowInstanceId: approval.workflowInstanceId, delegatedBy: actor.membershipId }
  });

  publishResourceEvent(actor.organizationId, "approval", approvalId, "resource.updated");
  return getApproval(actor, approvalId);
}
