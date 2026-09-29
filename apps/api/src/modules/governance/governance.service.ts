import type { AccessReviewResponse, EffectiveAccessEntryDto, GovernanceReportDto } from "@nexora/contracts";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

export interface ActorContext {
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

function grantPermission(flags: { canView?: boolean; canRead?: boolean; canEdit?: boolean; canDelete?: boolean; canShare?: boolean }): string {
  const levels = ["view"];
  if (flags.canEdit) levels.push("edit");
  if (flags.canDelete) levels.push("delete");
  if (flags.canShare) levels.push("share");
  return levels.join("+");
}

// --- Access review: effective access on a single resource ---

export async function accessReview(actor: ActorContext, kind: "document" | "folder", resourceId: string): Promise<AccessReviewResponse> {
  const entries: EffectiveAccessEntryDto[] = [];
  const memberIds = new Set<string>();

  let resourceName = "";
  const linkWhere = kind === "document" ? { documentId: resourceId } : { folderId: resourceId };

  if (kind === "document") {
    const document = await prisma.document.findFirst({ where: { id: resourceId, tenantId: actor.organizationId } });
    if (!document) throw new AppError(404, "DOCUMENT_NOT_FOUND", "The document was not found.");
    resourceName = document.name;
    const owner = await prisma.user.findUnique({ where: { id: document.createdById }, select: { name: true, email: true } });
    const ownerMembership = await prisma.organizationMember.findFirst({ where: { tenantId: actor.organizationId, userId: document.createdById } });
    if (owner && ownerMembership) {
      entries.push({ membershipId: ownerMembership.id, userName: owner.name, email: owner.email, access: "owner", permission: "full", source: "Proprietário" });
      memberIds.add(ownerMembership.id);
    }
    const [direct, teams, organizations] = await Promise.all([
      prisma.documentPermission.findMany({ where: { documentId: resourceId, tenantId: actor.organizationId }, include: { membership: { include: { user: { select: { name: true, email: true } } } } } }),
      prisma.documentTeamPermission.findMany({ where: { documentId: resourceId, tenantId: actor.organizationId }, include: { team: { select: { name: true, members: { include: { membership: { include: { user: { select: { name: true, email: true } } } } } } } } } }),
      prisma.documentOrganizationPermission.findMany({ where: { documentId: resourceId, tenantId: actor.organizationId }, include: { targetOrganization: { select: { name: true } } } })
    ]);
    for (const grant of direct) {
      entries.push({ membershipId: grant.membershipId, userName: grant.membership.user.name, email: grant.membership.user.email, access: "direct", permission: grantPermission(grant), source: "Permissão direta" });
      memberIds.add(grant.membershipId);
    }
    for (const grant of teams) {
      for (const member of grant.team.members) {
        if (memberIds.has(member.membershipId)) continue;
        entries.push({ membershipId: member.membershipId, userName: member.membership.user.name, email: member.membership.user.email, access: "team", permission: grantPermission(grant), source: `Equipa: ${grant.team.name}` });
        memberIds.add(member.membershipId);
      }
    }
    for (const grant of organizations) {
      entries.push({ membershipId: "", userName: grant.targetOrganization.name, email: "", access: "organization", permission: grantPermission(grant), source: "Organização parceira" });
    }
  } else {
    const folder = await prisma.folder.findFirst({ where: { id: resourceId, tenantId: actor.organizationId } });
    if (!folder) throw new AppError(404, "FOLDER_NOT_FOUND", "The folder was not found.");
    resourceName = folder.name;
    const owner = folder.createdById ? await prisma.user.findUnique({ where: { id: folder.createdById }, select: { name: true, email: true } }) : null;
    const ownerMembership = folder.createdById ? await prisma.organizationMember.findFirst({ where: { tenantId: actor.organizationId, userId: folder.createdById } }) : null;
    if (owner && ownerMembership) {
      entries.push({ membershipId: ownerMembership.id, userName: owner.name, email: owner.email, access: "owner", permission: "full", source: "Proprietário" });
      memberIds.add(ownerMembership.id);
    }
    const direct = await prisma.folderPermission.findMany({ where: { folderId: resourceId, tenantId: actor.organizationId }, include: { membership: { include: { user: { select: { name: true, email: true } } } } } });
    for (const grant of direct) {
      entries.push({ membershipId: grant.membershipId, userName: grant.membership.user.name, email: grant.membership.user.email, access: "direct", permission: grantPermission(grant), source: folder.inheritsPermissions ? "Permissão direta" : "Permissão direta (herança quebrada)" });
      memberIds.add(grant.membershipId);
    }
  }

  const links = await prisma.documentShareLink.findMany({
    where: { tenantId: actor.organizationId, ...linkWhere, revokedAt: null },
    select: { id: true, permission: true, expiresAt: true, createdAt: true }
  });
  return {
    resourceId,
    resourceName,
    resourceType: kind,
    entries,
    publicLinks: links.map((link) => ({ id: link.id, permission: link.permission, expiresAt: link.expiresAt.toISOString(), createdAt: link.createdAt.toISOString() }))
  };
}

// --- Governance report: org-wide over-sharing, inactivity, duplicates ---

export async function governanceReport(actor: ActorContext, input: { inactiveDays?: number }): Promise<GovernanceReportDto> {
  const inactiveDays = input.inactiveDays ?? 90;
  const cutoff = new Date(Date.now() - inactiveDays * 86_400_000);

  const [links, documents, versions, records, holds] = await Promise.all([
    prisma.documentShareLink.findMany({
      where: { tenantId: actor.organizationId, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { document: { select: { name: true } }, folder: { select: { name: true } }, creator: { select: { name: true } } }
    }),
    prisma.document.findMany({ where: { tenantId: actor.organizationId, status: "ACTIVE" }, select: { id: true, name: true, updatedAt: true, sizeBytes: true } }),
    prisma.documentVersion.findMany({ where: { tenantId: actor.organizationId }, select: { documentId: true, checksum: true, sizeBytes: true, version: true } }),
    prisma.document.count({ where: { tenantId: actor.organizationId, isRecord: true } }),
    prisma.document.count({ where: { tenantId: actor.organizationId, legalHold: true } })
  ]);

  // Inactive: no audit activity after the cutoff and not updated recently.
  const recentActivity = await prisma.auditLog.findMany({
    where: { tenantId: actor.organizationId, resourceType: "Document", occurredAt: { gt: cutoff }, resourceId: { not: null } },
    select: { resourceId: true }
  });
  const activeIds = new Set(recentActivity.map(({ resourceId }) => resourceId));
  const inactiveDocuments = documents
    .filter((document) => document.updatedAt < cutoff && !activeIds.has(document.id))
    .map((document) => ({ id: document.id, name: document.name, lastActivityAt: document.updatedAt.toISOString(), sizeBytes: document.sizeBytes }));

  // Duplicates by checksum of the latest version per document.
  const latestVersion = new Map<string, { checksum: string; sizeBytes: number; version: number }>();
  for (const version of versions) {
    const current = latestVersion.get(version.documentId);
    if (!current || version.version > current.version) latestVersion.set(version.documentId, { checksum: version.checksum, sizeBytes: version.sizeBytes, version: version.version });
  }
  const byChecksum = new Map<string, string[]>();
  for (const [documentId, { checksum }] of latestVersion) {
    const list = byChecksum.get(checksum) ?? [];
    list.push(documentId);
    byChecksum.set(checksum, list);
  }
  const nameById = new Map(documents.map((document) => [document.id, document.name]));
  const sizeByChecksum = new Map([...latestVersion.values()].map((v) => [v.checksum, v.sizeBytes]));
  const duplicateDocuments = [...byChecksum.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([checksum, documentIds]) => ({ checksum, documentIds, names: documentIds.map((id) => nameById.get(id) ?? id), sizeBytes: sizeByChecksum.get(checksum) ?? 0 }));

  return {
    publicLinks: links.map((link) => ({
      id: link.id,
      targetType: link.documentId ? "document" : "folder",
      targetName: link.document?.name ?? link.folder?.name ?? "",
      permission: link.permission,
      expiresAt: link.expiresAt.toISOString(),
      createdBy: link.creator.name
    })),
    inactiveDocuments,
    duplicateDocuments,
    recordsCount: records,
    legalHoldsCount: holds
  };
}
