import type { AccessEntryDto, AccessPanelResponse, AccessRequestDto, AccessRequestsResponse, AccessRequestStatus, AutofillMetadataResponse, CreateEditorDocumentInput, DeltaFeedResponse, DocumentAccess, DocumentActivityDto, DocumentActivityResponse, DocumentCommentDto, DocumentDetailResponse, DocumentItemDto, DocumentOwnerDto, DocumentShareLinkDto, DocumentSharePermission, DocumentShareTargetType, DocumentShareTargetsResponse, DocumentVersionDto, DocumentVersionType, DocumentsResponse, EditorContentResponse, EditorDocumentKind, FavoritesResponse, FolderItemDto, FolderMetadataFieldDto, FolderMetadataFieldInput, FolderMetadataFieldType, GovernanceSettings, PublicDocumentShareDto, PublicShareFolderContentsDto, PublicShareItemDto, RecentDocumentDto, RecentDocumentsResponse, RetentionMode, SaveEditorContentInput, SensitivityLevel, SharedByMeDto, SharedDocumentDto, SharedDocumentsResponse, SharedVia, SubscriptionTargetType, TemplatesResponse, TrashItemDto, TrashResponse } from "@nexora/contracts";
import type { AccessRequest, Document, Folder, FolderMetadataField, Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { prisma, transactionOptions } from "../../lib/prisma.js";
import { createOpaqueToken, hashPassword, hashToken, verifyPassword } from "../../lib/security.js";
import { createZip, sanitizeZipSegment, uniqueZipName } from "../../lib/zip.js";
import { storage } from "../../services/storage/index.js";
import { permissions } from "../permissions/permissions.js";
import { notify, resolveMentions } from "../notifications/notification.service.js";
import { publishResourceEvent } from "../collaboration/realtime.service.js";
import { dispatchToSubscribers, type SubscriptionDispatchPayload } from "../subscriptions/subscription.service.js";
import { fireWorkflowEvent } from "../workflows/automation.service.js";

const permissionKeys: Record<DocumentAccess, string> = {
  view: permissions.documentsView,
  edit: permissions.documentsEdit,
  delete: permissions.documentsDelete,
  share: permissions.documentsShare
};

const allowedTypes: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".ppt": ["application/vnd.ms-powerpoint"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".txt": ["text/plain"],
  ".csv": ["text/csv", "application/vnd.ms-excel"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".nxdoc": ["application/vnd.nexora.doc+json", "application/json"],
  ".nxsheet": ["application/vnd.nexora.sheet+json", "application/json"]
};

export interface ActorContext {
  organizationId: string;
  userId: string;
  membershipId: string;
  isSuperAdmin: boolean;
  capabilities: Set<string>;
}

type DocumentWithRelations = Prisma.DocumentGetPayload<{
  include: { owner: { select: { id: true; name: true; avatar: true } }; favorites: true; permissions: true; checkedOutBy: { include: { user: { select: { id: true; name: true; avatar: true } } } } };
}>;
type FolderWithRelations = Prisma.FolderGetPayload<{
  include: { owner: { select: { id: true; name: true; avatar: true } }; favorites: true; permissions: true };
}>;

export async function getActor(organizationId: string, userId: string, isSuperAdmin: boolean): Promise<ActorContext> {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
    include: { membershipRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return {
    organizationId,
    userId,
    membershipId: membership.id,
    isSuperAdmin,
    capabilities: new Set(membership.membershipRoles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))
  };
}

function hasCapability(actor: ActorContext, access: DocumentAccess) {
  return actor.isSuperAdmin || actor.capabilities.has(permissionKeys[access]);
}

async function folderChain(organizationId: string, folderId: string | null) {
  const folders: Folder[] = [];
  let currentId = folderId;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) throw new AppError(409, "INVALID_FOLDER_TREE", "The folder hierarchy is invalid.");
    visited.add(currentId);
    const folder = await prisma.folder.findFirst({ where: { id: currentId, tenantId: organizationId, status: "ACTIVE" } });
    if (!folder) throw new AppError(404, "FOLDER_NOT_FOUND", "The folder was not found.");
    folders.unshift(folder);
    currentId = folder.parentId;
  }
  return folders;
}

// Ancestor chain regardless of trash status; stops silently when an ancestor is gone (purged).
async function ancestorFolders(organizationId: string, folderId: string | null) {
  const folders: Folder[] = [];
  let currentId = folderId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = await prisma.folder.findFirst({ where: { id: currentId, tenantId: organizationId } });
    if (!folder) break;
    folders.unshift(folder);
    currentId = folder.parentId;
  }
  return folders;
}

async function folderAccess(actor: ActorContext, folder: Folder, access: DocumentAccess, activeOnly = true) {
  if (!hasCapability(actor, access)) return false;
  if (actor.isSuperAdmin || folder.createdById === actor.userId) return true;
  // When inheritance is disabled, only explicit grants on the folder itself apply
  // (plus owner/admins, handled above) — ancestor grants are not consulted.
  const chain = folder.inheritsPermissions
    ? (activeOnly ? await folderChain(actor.organizationId, folder.id) : await ancestorFolders(actor.organizationId, folder.id))
    : [folder];
  const grants = await prisma.folderPermission.findMany({
    where: { tenantId: actor.organizationId, folderId: { in: chain.map(({ id }) => id) } }
  });
  if (grants.length === 0) return folder.inheritsPermissions;
  const ownGrants = grants.filter(({ membershipId }) => membershipId === actor.membershipId);
  const field = access === "view" ? "canView" : access === "edit" ? "canEdit" : access === "delete" ? "canDelete" : "canShare";
  return ownGrants.some((grant) => grant[field]);
}

async function documentAccess(actor: ActorContext, document: Document, access: DocumentAccess, activeOnly = true) {
  if (!hasCapability(actor, access)) return false;
  if (actor.isSuperAdmin) return true;
  if (document.tenantId !== actor.organizationId) {
    if (access !== "view" && access !== "edit") return false;
    const grant = await prisma.documentOrganizationPermission.findFirst({ where: { documentId: document.id, targetOrganizationId: actor.organizationId } });
    return Boolean(grant && (access === "view" ? grant.canRead : grant.canEdit));
  }
  if (document.createdById === actor.userId) return true;
  // When inheritance is disabled, parent-folder grants are not consulted — only
  // explicit document-level grants (member/team/organization) apply.
  const chain = document.inheritsPermissions
    ? (activeOnly ? await folderChain(actor.organizationId, document.folderId) : await ancestorFolders(actor.organizationId, document.folderId))
    : [];
  const teamIds = await prisma.teamMember.findMany({ where: { tenantId: actor.organizationId, membershipId: actor.membershipId }, select: { teamId: true } });
  const [documentGrants, teamGrants, folderGrants] = await Promise.all([
    prisma.documentPermission.findMany({ where: { tenantId: actor.organizationId, documentId: document.id } }),
    prisma.documentTeamPermission.findMany({ where: { tenantId: actor.organizationId, documentId: document.id, teamId: { in: teamIds.map(({ teamId }) => teamId) } } }),
    chain.length ? prisma.folderPermission.findMany({ where: { tenantId: actor.organizationId, folderId: { in: chain.map(({ id }) => id) } } }) : []
  ]);
  const hasSharingRules = await prisma.documentTeamPermission.count({ where: { documentId: document.id } })
    + await prisma.documentOrganizationPermission.count({ where: { documentId: document.id } });
  if (documentGrants.length + folderGrants.length + hasSharingRules === 0) return document.inheritsPermissions;
  const field = access === "view" ? "canView" : access === "edit" ? "canEdit" : access === "delete" ? "canDelete" : "canShare";
  const directAccess = [...documentGrants, ...folderGrants].filter(({ membershipId }) => membershipId === actor.membershipId).some((grant) => grant[field]);
  const teamAccess = (access === "view" || access === "edit") && teamGrants.some((grant) => access === "view" ? grant.canRead : grant.canEdit);
  return directAccess || teamAccess;
}

async function requireFolder(actor: ActorContext, folderId: string, access: DocumentAccess) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, tenantId: actor.organizationId, status: "ACTIVE" } });
  if (!folder) throw new AppError(404, "FOLDER_NOT_FOUND", "The folder was not found.");
  if (!(await folderAccess(actor, folder, access))) throw new AppError(403, "FORBIDDEN", "You cannot access this folder.");
  return folder;
}

export async function requireDocument(actor: ActorContext, documentId: string, access: DocumentAccess) {
  const document = await prisma.document.findFirst({ where: { id: documentId, status: "ACTIVE" } });
  if (!document) throw new AppError(404, "DOCUMENT_NOT_FOUND", "The document was not found.");
  if (!(await documentAccess(actor, document, access))) throw new AppError(403, "FORBIDDEN", "You cannot access this document.");
  return document;
}

async function effectiveFolderPermissions(actor: ActorContext, folder: Folder) {
  return Object.fromEntries(await Promise.all((["view", "edit", "delete", "share"] as DocumentAccess[]).map(async (access) => [access, await folderAccess(actor, folder, access)]))) as Record<DocumentAccess, boolean>;
}

async function effectiveDocumentPermissions(actor: ActorContext, document: Document) {
  return Object.fromEntries(await Promise.all((["view", "edit", "delete", "share"] as DocumentAccess[]).map(async (access) => [access, await documentAccess(actor, document, access)]))) as Record<DocumentAccess, boolean>;
}

// --- Governance (retention + sensitivity) ---
// Effective values walk the ancestor chain (nearest non-default wins): the closest
// folder — including the item itself — with retentionMode != "NONE" supplies the
// retention policy; the closest with sensitivity != "INTERNAL" supplies sensitivity.

export const SENSITIVITY_RANK: Record<SensitivityLevel, number> = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3 };

async function effectiveGovernance(organizationId: string, folderId: string | null): Promise<GovernanceSettings> {
  const fallback: GovernanceSettings = { retentionMode: "NONE", retentionDays: null, sensitivity: "INTERNAL", requireApproval: false, inheritedFrom: null };
  if (!folderId) return fallback;
  const chain = await ancestorFolders(organizationId, folderId); // root-first, includes the folder itself
  let retentionMode: RetentionMode = "NONE";
  let retentionDays: number | null = null;
  let retentionSource: string | null = null;
  let sensitivity: SensitivityLevel = "INTERNAL";
  let sensitivitySource: string | null = null;
  let requireApproval = false;
  let approvalSource: string | null = null;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const folder = chain[index]!;
    if (retentionSource === null && folder.retentionMode !== "NONE") {
      retentionMode = folder.retentionMode as RetentionMode;
      retentionDays = folder.retentionDays;
      retentionSource = folder.id;
    }
    if (sensitivitySource === null && folder.sensitivity !== "INTERNAL") {
      sensitivity = folder.sensitivity as SensitivityLevel;
      sensitivitySource = folder.id;
    }
    // Content approval is inherited down the tree: any ancestor that requires it applies it.
    if (!requireApproval && folder.requireApproval) {
      requireApproval = true;
      approvalSource = folder.id;
    }
  }
  const inheritedFrom = retentionSource && retentionSource !== folderId ? retentionSource
    : sensitivitySource && sensitivitySource !== folderId ? sensitivitySource
      : approvalSource && approvalSource !== folderId ? approvalSource
        : null;
  return { retentionMode, retentionDays, sensitivity, requireApproval, inheritedFrom };
}

function retentionError() {
  return new AppError(409, "RETENTION_BLOCKED", "A retention policy prevents deleting this item.");
}

// Soft delete (move to trash) is blocked by BLOCK_DELETE; RETAIN allows trashing.
async function assertSoftDeleteAllowed(organizationId: string, folderId: string | null) {
  const governance = await effectiveGovernance(organizationId, folderId);
  if (governance.retentionMode === "BLOCK_DELETE") throw retentionError();
}

// Permanent delete is blocked by BLOCK_DELETE, and by RETAIN while the retention
// window is still open (null retentionDays under RETAIN = retain indefinitely).
async function assertPurgeAllowed(organizationId: string, folderId: string | null, deletedAt: Date | null) {
  const governance = await effectiveGovernance(organizationId, folderId);
  if (governance.retentionMode === "BLOCK_DELETE") throw retentionError();
  if (governance.retentionMode === "RETAIN") {
    if (governance.retentionDays == null) throw retentionError();
    if (deletedAt && deletedAt.getTime() + governance.retentionDays * 86_400_000 > Date.now()) throw retentionError();
  }
}

// Non-throwing variant for the scheduled purge — returns true when retention still holds.
async function retentionBlocksPurge(organizationId: string, folderId: string | null, deletedAt: Date | null): Promise<boolean> {
  try {
    await assertPurgeAllowed(organizationId, folderId, deletedAt);
    return false;
  } catch (error) {
    if (error instanceof AppError && error.code === "RETENTION_BLOCKED") return true;
    throw error;
  }
}

async function presentFolder(actor: ActorContext, folder: FolderWithRelations): Promise<FolderItemDto> {
  return {
    id: folder.id,
    kind: "folder",
    name: folder.name,
    parentId: folder.parentId,
    owner: folder.owner,
    favorite: folder.favorites.some(({ membershipId }) => membershipId === actor.membershipId),
    permissions: await effectiveFolderPermissions(actor, folder),
    isTemplate: folder.isTemplate,
    pinnedAt: folder.pinnedAt?.toISOString() ?? null,
    governance: await effectiveGovernance(actor.organizationId, folder.id),
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString()
  };
}

function parseMetadata(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

// Slugs of metadata fields that were filled automatically by the AI provider.
function parseMetadataAuto(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((slug): slug is string => typeof slug === "string") : [];
  } catch {
    return [];
  }
}

async function presentDocument(actor: ActorContext, document: DocumentWithRelations): Promise<DocumentItemDto> {
  return {
    id: document.id,
    kind: "document",
    documentKind: (document.documentKind === "DOC" || document.documentKind === "SHEET" ? document.documentKind : "FILE") as DocumentItemDto["documentKind"],
    name: document.name,
    originalName: document.originalName,
    extension: document.extension,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    folderId: document.folderId,
    owner: document.owner,
    favorite: document.favorites.some(({ membershipId }) => membershipId === actor.membershipId),
    permissions: await effectiveDocumentPermissions(actor, document),
    checkedOut: document.checkedOutBy && document.checkedOutAt
      ? { membershipId: document.checkedOutBy.id, user: document.checkedOutBy.user, at: document.checkedOutAt.toISOString() }
      : null,
    metadata: parseMetadata(document.metadataJson),
    metadataAuto: parseMetadataAuto(document.metadataAutoJson),
    isTemplate: document.isTemplate,
    pinnedAt: document.pinnedAt?.toISOString() ?? null,
    publishStatus: document.publishStatus as DocumentItemDto["publishStatus"],
    isRecord: document.isRecord,
    legalHold: document.legalHold,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString()
  };
}

async function breadcrumbs(organizationId: string, folderId: string | null) {
  const chain = await folderChain(organizationId, folderId);
  return [{ id: null, name: "Documentos" }, ...chain.map(({ id, name }) => ({ id, name }))];
}

export async function listDocuments(actor: ActorContext, input: { folderId?: string; search?: string; sort: string; order: string; filter: string; type?: string; meta?: string; sensitivity?: string; publishStatus?: string }): Promise<DocumentsResponse> {
  const folderId = input.folderId ?? null;
  const currentFolder = folderId ? await requireFolder(actor, folderId, "view") : null;
  const include = {
    owner: { select: { id: true, name: true, avatar: true } },
    favorites: { where: { membershipId: actor.membershipId } },
    permissions: true
  } as const;
  const documentInclude = {
    ...include,
    checkedOutBy: { include: { user: { select: { id: true, name: true, avatar: true } } } }
  } as const;
  const search = input.search ? { contains: input.search, mode: "insensitive" as const } : undefined;
  const [folders, documents] = await Promise.all([
    input.filter === "documents" ? [] : prisma.folder.findMany({ where: { tenantId: actor.organizationId, parentId: folderId, status: "ACTIVE", name: search }, include }),
    input.filter === "folders" ? [] : prisma.document.findMany({
      where: {
        status: "ACTIVE",
        name: search,
        ...(input.type ? { mimeType: { contains: input.type, mode: "insensitive" as const } } : {}),
        ...(input.sensitivity ? { sensitivity: input.sensitivity } : {}),
        ...(input.publishStatus ? { publishStatus: input.publishStatus } : {}),
        OR: [
          { tenantId: actor.organizationId, folderId },
          ...(folderId ? [] : [{ organizationPermissions: { some: { targetOrganizationId: actor.organizationId, canRead: true } } }])
        ]
      },
      include: documentInclude
    })
  ]);
  const visibleFolders = (await Promise.all(folders.map(async (folder) => await folderAccess(actor, folder, "view") ? folder : null))).filter((folder): folder is FolderWithRelations => !!folder);
  let visibleDocuments = (await Promise.all(documents.map(async (document) => await documentAccess(actor, document, "view") ? document : null))).filter((document): document is DocumentWithRelations => !!document);
  // Metadata-oriented view: meta=slug:value filters by a metadata field value.
  const metaParts = input.meta?.includes(":") ? input.meta.split(":") : null;
  if (metaParts?.[0] !== undefined) {
    const [slug, expected] = [metaParts[0].trim(), metaParts.slice(1).join(":").trim()];
    visibleDocuments = visibleDocuments.filter((document) => String(parseMetadata(document.metadataJson)[slug] ?? "") === expected);
  }
  const favoriteFolders = input.filter === "favorites" ? visibleFolders.filter(({ favorites }) => favorites.length > 0) : visibleFolders;
  const favoriteDocuments = input.filter === "favorites" ? visibleDocuments.filter(({ favorites }) => favorites.length > 0) : visibleDocuments;
  const direction = input.order === "desc" ? -1 : 1;
  const compare = (left: FolderWithRelations | DocumentWithRelations, right: FolderWithRelations | DocumentWithRelations) => {
    // Pinned items always come first, most recently pinned ahead; unpinned keep the chosen sort.
    const pinnedDelta = (right.pinnedAt?.getTime() ?? 0) - (left.pinnedAt?.getTime() ?? 0);
    if (pinnedDelta !== 0) return pinnedDelta;
    const leftValue = input.sort === "updatedAt" ? left.updatedAt.getTime() : input.sort === "size" ? ("sizeBytes" in left ? left.sizeBytes : 0) : input.sort === "type" ? ("extension" in left ? left.extension : "folder") : input.sort === "owner" ? left.owner?.name ?? "" : left.name;
    const rightValue = input.sort === "updatedAt" ? right.updatedAt.getTime() : input.sort === "size" ? ("sizeBytes" in right ? right.sizeBytes : 0) : input.sort === "type" ? ("extension" in right ? right.extension : "folder") : input.sort === "owner" ? right.owner?.name ?? "" : right.name;
    return String(leftValue).localeCompare(String(rightValue), "pt", { numeric: true, sensitivity: "base" }) * direction;
  };
  favoriteFolders.sort(compare);
  favoriteDocuments.sort(compare);
  const [folderDtos, documentDtos] = await Promise.all([
    Promise.all(favoriteFolders.map((folder) => presentFolder(actor, folder))),
    Promise.all(favoriteDocuments.map((document) => presentDocument(actor, document)))
  ]);
  const metadataFields = await getEffectiveMetadataFields(actor.organizationId, folderId);
  return { folder: currentFolder ? await getFolderDto(actor, currentFolder.id) : null, breadcrumbs: await breadcrumbs(actor.organizationId, folderId), folders: folderDtos, documents: documentDtos, metadataFields, total: folderDtos.length + documentDtos.length };
}

async function getFolderDto(actor: ActorContext, folderId: string) {
  const folder = await prisma.folder.findFirstOrThrow({ where: { id: folderId, tenantId: actor.organizationId }, include: { owner: { select: { id: true, name: true, avatar: true } }, favorites: true, permissions: true } });
  return presentFolder(actor, folder);
}

type VersionWithCreator = Prisma.DocumentVersionGetPayload<{ include: { creator: { select: { id: true; name: true; avatar: true } } } }>;

// SharePoint-style labels: MAJOR bumps to N.0, MINOR drafts count up under the
// current major (1.1, 1.2, ...). Computed over the full version list.
function versionLabels(versions: { id: string; version: number; versionType: string }[]): Map<string, string> {
  const labels = new Map<string, string>();
  let major = 0;
  let minor = 0;
  for (const version of [...versions].sort((a, b) => a.version - b.version)) {
    if (version.versionType === "MINOR") {
      minor += 1;
      labels.set(version.id, `${major}.${minor}`);
    } else {
      major += 1;
      minor = 0;
      labels.set(version.id, `${major}.0`);
    }
  }
  return labels;
}

function presentVersion(version: VersionWithCreator, currentStorageKey: string | null, label: string): DocumentVersionDto {
  return {
    id: version.id,
    version: version.version,
    versionType: version.versionType as DocumentVersionType,
    label,
    originalName: version.originalName,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    creator: version.creator,
    createdAt: version.createdAt.toISOString(),
    current: version.storageKey === currentStorageKey
  };
}

export async function getDocumentDetail(actor: ActorContext, documentId: string): Promise<DocumentDetailResponse> {
  const base = await requireDocument(actor, documentId, "view");
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: base.id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      favorites: true,
      permissions: true,
      checkedOutBy: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      versions: { orderBy: { version: "desc" }, include: { creator: { select: { id: true, name: true, avatar: true } } } }
    }
  });
  const documentBreadcrumbs = document.tenantId === actor.organizationId
    ? await breadcrumbs(actor.organizationId, document.folderId)
    : [{ id: null, name: "Documentos partilhados" }];
  const metadataFields = document.tenantId === actor.organizationId ? await getEffectiveMetadataFields(actor.organizationId, document.folderId) : [];
  const labels = versionLabels(document.versions);
  return { document: await presentDocument(actor, document), breadcrumbs: documentBreadcrumbs, versions: document.versions.map((version) => presentVersion(version, document.storageKey, labels.get(version.id) ?? `${version.version}.0`)), metadataFields };
}

// View tracking for the activity feed — deduplicated per actor per hour so that
// repeated opens do not flood the audit log.
export async function trackDocumentView(actor: ActorContext, documentId: string) {
  const document = await prisma.document.findFirst({ where: { id: documentId, status: "ACTIVE" }, select: { id: true, tenantId: true } });
  if (!document) return;
  const recent = await prisma.auditLog.findFirst({
    where: { tenantId: document.tenantId, resourceType: "Document", resourceId: document.id, action: "document.viewed", actorId: actor.membershipId, occurredAt: { gt: new Date(Date.now() - 3_600_000) } },
    select: { id: true }
  });
  if (recent) return;
  await prisma.auditLog.create({ data: { tenantId: document.tenantId, actorId: actor.membershipId, action: "document.viewed", resourceType: "Document", resourceId: document.id } }).catch(() => undefined);
}

async function ensureUniqueName(organizationId: string, folderId: string | null, name: string, kind: "folder" | "document", excludeId?: string) {
  const exists = kind === "folder"
    ? await prisma.folder.findFirst({ where: { tenantId: organizationId, parentId: folderId, name, status: "ACTIVE", id: excludeId ? { not: excludeId } : undefined } })
    : await prisma.document.findFirst({ where: { tenantId: organizationId, folderId, name, status: "ACTIVE", id: excludeId ? { not: excludeId } : undefined } });
  if (exists) throw new AppError(409, "NAME_ALREADY_EXISTS", "An item with this name already exists in the destination folder.");
}

async function audit(transaction: Prisma.TransactionClient, actor: ActorContext, action: string, resourceType: string, resourceId: string, tenantId = actor.organizationId, context?: Record<string, unknown>) {
  await transaction.auditLog.create({ data: { tenantId, actorId: actor.membershipId, action, resourceType, resourceId, contextJson: context ? JSON.stringify(context) : undefined } });
}

function assertNotCheckedOutByOther(actor: ActorContext, document: Document) {
  if (document.checkedOutByMembershipId && document.checkedOutByMembershipId !== actor.membershipId) {
    throw new AppError(409, "DOCUMENT_CHECKED_OUT", "The document is checked out by another user.");
  }
}

// Records management: a declared record is immutable (no edits, versions,
// metadata changes or deletion). Legal hold blocks any form of deletion.
function assertNotRecord(document: Pick<Document, "isRecord">) {
  if (document.isRecord) throw new AppError(409, "DOCUMENT_IS_RECORD", "This document is declared as a record and cannot be modified.");
}

function assertDeletable(document: Pick<Document, "isRecord" | "legalHold">) {
  if (document.isRecord) throw new AppError(409, "DOCUMENT_IS_RECORD", "A record cannot be deleted. Undeclare the record first.");
  if (document.legalHold) throw new AppError(409, "DOCUMENT_ON_HOLD", "This document is under legal hold and cannot be deleted.");
}

async function safeIndexDocumentContent(documentId: string) {
  const { indexDocumentContent } = await import("./content-extraction.service.js");
  await indexDocumentContent(documentId).catch((error) => console.error("document content indexing failed", error));
}

// Subscription fan-out must never break the main operation.
async function safeDispatch(tenantId: string, targetType: SubscriptionTargetType, targetId: string | null | undefined, event: string, payload: SubscriptionDispatchPayload) {
  if (!targetId) return;
  try {
    await dispatchToSubscribers(tenantId, targetType, targetId, event, payload);
  } catch (error) {
    console.error("subscription dispatch failed", error);
  }
}

// Webhook fan-out must never break the main operation either.
async function safeDispatchWebhooks(tenantId: string, event: string, payload: Record<string, unknown>) {
  try {
    const { dispatchWebhooks } = await import("../webhooks/webhook.service.js");
    await dispatchWebhooks(tenantId, event, payload);
  } catch (error) {
    console.error("webhook dispatch failed", error);
  }
}

// AI metadata autofill is best-effort — failures are logged and never break uploads.
async function safeAutoFillMetadata(actor: ActorContext, documentId: string) {
  try {
    const document = await prisma.document.findFirst({ where: { id: documentId, tenantId: actor.organizationId, status: "ACTIVE" } });
    if (!document) return;
    await computeMetadataSuggestions(actor.organizationId, document);
  } catch (error) {
    console.error("metadata autofill failed", error);
  }
}

// Resolves (creating when missing) a chain of folders like "clientes/acme/contratos"
// relative to baseFolderId. New folders get only tenantId + parentId + name + createdById.
async function getOrCreateFolderPath(actor: ActorContext, folderPath: string, baseFolderId: string | null) {
  const segments = folderPath.split(/[\\/]+/).map((segment) => segment.trim()).filter((segment) => segment && segment !== "." && segment !== "..");
  let parentId = baseFolderId;
  for (const name of segments.slice(0, 20)) {
    if (name.length > 120) throw new AppError(400, "INVALID_FOLDER_PATH", "A folder name in the path is too long.");
    let folder = await prisma.folder.findFirst({ where: { tenantId: actor.organizationId, parentId, name, status: "ACTIVE" } });
    if (!folder) {
      folder = await prisma.$transaction(async (transaction) => {
        const created = await transaction.folder.create({ data: { tenantId: actor.organizationId, parentId, name, createdById: actor.userId } });
        await audit(transaction, actor, "folder.created", "Folder", created.id, actor.organizationId, { via: "upload-path" });
        return created;
      }, transactionOptions);
    }
    parentId = folder.id;
  }
  return parentId;
}

export async function createFolder(actor: ActorContext, name: string, parentId: string | null) {
  if (!hasCapability(actor, "edit")) throw new AppError(403, "FORBIDDEN", "You cannot create folders.");
  if (parentId) await requireFolder(actor, parentId, "edit");
  await ensureUniqueName(actor.organizationId, parentId, name, "folder");
  const folder = await prisma.$transaction(async (transaction) => {
    const created = await transaction.folder.create({ data: { tenantId: actor.organizationId, parentId, name, createdById: actor.userId } });
    await audit(transaction, actor, "folder.created", "Folder", created.id);
    return created;
  }, transactionOptions);
  return getFolderDto(actor, folder.id);
}

export function validateUpload(filename: string, mimeType: string) {
  const extension = path.extname(filename).toLowerCase();
  if (!extension || !allowedTypes[extension]) throw new AppError(415, "FILE_EXTENSION_NOT_ALLOWED", "This file extension is not allowed.");
  if (!allowedTypes[extension].includes(mimeType.toLowerCase())) throw new AppError(415, "FILE_TYPE_MISMATCH", "The file MIME type does not match its extension.");
  return extension;
}

async function validateStoredContent(storageKey: string, extension: string) {
  const stream = await storage.get(storageKey);
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of stream) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(value);
    length += value.length;
    if (length >= 512) break;
  }
  stream.destroy();
  const header = Buffer.concat(chunks).subarray(0, 512);
  const starts = (...bytes: number[]) => bytes.every((byte, index) => header[index] === byte);
  if (extension === ".pdf") return header.subarray(0, 5).toString() === "%PDF-";
  if (extension === ".png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (extension === ".jpg" || extension === ".jpeg") return starts(0xff, 0xd8, 0xff);
  if (extension === ".webp") return header.subarray(0, 4).toString() === "RIFF" && header.subarray(8, 12).toString() === "WEBP";
  if ([".zip", ".docx", ".xlsx", ".pptx"].includes(extension)) return starts(0x50, 0x4b);
  if ([".doc", ".xls", ".ppt"].includes(extension)) return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  if (extension === ".txt" || extension === ".csv") return !header.includes(0);
  if (extension === ".nxdoc" || extension === ".nxsheet") {
    try { JSON.parse(header.toString("utf8")); return true; } catch { return header.toString("utf8").trimStart().startsWith("{"); }
  }
  return false;
}

export async function uploadDocument(actor: ActorContext, file: Readable, filename: string, mimeType: string, folderId: string | null, options?: { path?: string }) {
  if (!hasCapability(actor, "edit")) throw new AppError(403, "FORBIDDEN", "You cannot upload documents.");
  let targetFolderId = folderId;
  if (options?.path?.trim()) {
    // The last segment may be the filename itself — only folders are created.
    const segments = options.path.split(/[\\/]+/).map((segment) => segment.trim()).filter(Boolean);
    if (segments.length && segments[segments.length - 1] === filename) segments.pop();
    targetFolderId = await getOrCreateFolderPath(actor, segments.join("/"), targetFolderId);
  }
  if (targetFolderId) await requireFolder(actor, targetFolderId, "edit");
  const extension = validateUpload(filename, mimeType);
  await ensureUniqueName(actor.organizationId, targetFolderId, filename, "document");
  // Check plan limits before uploading
  const { checkLimit, checkStorageLimit } = await import("../billing/plan.service.js");
  await checkLimit(actor.organizationId, "documents");
  await checkStorageLimit(actor.organizationId, env.DOCUMENT_MAX_SIZE_BYTES);
  const documentId = randomUUID();
  const storageKey = `${actor.organizationId}/${documentId}/${randomUUID()}${extension}`;
  const checksum = createHash("sha256");
  const hashingStream = new Transform({
    transform(chunk, _encoding, callback) {
      checksum.update(chunk);
      callback(null, chunk);
    }
  });
  // When the folder requires content approval, uploads from non-approvers land
  // as unpublished drafts (first MINOR version), like SharePoint draft items.
  const uploadGovernance = await effectiveGovernance(actor.organizationId, targetFolderId);
  const uploadFolder = uploadGovernance.requireApproval && targetFolderId
    ? await prisma.folder.findFirst({ where: { id: targetFolderId, tenantId: actor.organizationId } })
    : null;
  const canApproveUpload = !uploadGovernance.requireApproval
    || (uploadFolder ? await folderAccess(actor, uploadFolder, "share") : hasCapability(actor, "share"));
  const startsAsDraft = uploadGovernance.requireApproval && !canApproveUpload;
  let stored: { size: number } | undefined;
  try {
    stored = await storage.put(storageKey, file.pipe(hashingStream));
    if ((file as Readable & { truncated?: boolean }).truncated) throw new AppError(413, "FILE_TOO_LARGE", "The file exceeds the maximum allowed size.");
    if (!(await validateStoredContent(storageKey, extension))) throw new AppError(415, "FILE_CONTENT_MISMATCH", "The file content does not match its extension and MIME type.");
    const document = await prisma.$transaction(async (transaction) => {
      const created = await transaction.document.create({ data: { id: documentId, tenantId: actor.organizationId, folderId: targetFolderId, name: filename, originalName: filename, extension: extension.slice(1), mimeType, sizeBytes: stored!.size, storageKey, createdById: actor.userId, publishStatus: startsAsDraft ? "DRAFT" : "PUBLISHED" } });
      await transaction.documentVersion.create({ data: { tenantId: actor.organizationId, documentId, version: 1, versionType: startsAsDraft ? "MINOR" : "MAJOR", storageKey, originalName: filename, mimeType, sizeBytes: stored!.size, checksum: checksum.digest("hex"), createdById: actor.userId } });
      await audit(transaction, actor, "document.uploaded", "Document", documentId, actor.organizationId, { version: 1, versionType: startsAsDraft ? "MINOR" : "MAJOR" });
      return created;
    }, transactionOptions);
    await safeIndexDocumentContent(document.id);
    await safeAutoFillMetadata(actor, document.id);
    await safeDispatch(actor.organizationId, "folder", targetFolderId, "created", {
      actorMembershipId: actor.membershipId,
      title: "Novo documento na pasta",
      body: `O documento "${document.name}" foi adicionado a uma pasta que segue.`,
      data: { documentId: document.id, folderId: targetFolderId }
    });
    await safeDispatchWebhooks(actor.organizationId, "document.created", {
      documentId: document.id,
      folderId: targetFolderId,
      name: document.name,
      actorMembershipId: actor.membershipId
    });
    await fireWorkflowEvent(actor, "document.created", { documentId: document.id, folderId: targetFolderId, name: document.name });
    return getDocumentDetail(actor, document.id);
  } catch (error) {
    if (stored) await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

async function storeVersionFile(tenantId: string, documentId: string, file: Readable, filename: string, mimeType: string) {
  const extension = validateUpload(filename, mimeType);
  const storageKey = `${tenantId}/${documentId}/${randomUUID()}${extension}`;
  const checksum = createHash("sha256");
  const hashingStream = new Transform({
    transform(chunk, _encoding, callback) {
      checksum.update(chunk);
      callback(null, chunk);
    }
  });
  let stored: { size: number } | undefined;
  try {
    stored = await storage.put(storageKey, file.pipe(hashingStream));
    if ((file as Readable & { truncated?: boolean }).truncated) throw new AppError(413, "FILE_TOO_LARGE", "The file exceeds the maximum allowed size.");
    if (!(await validateStoredContent(storageKey, extension))) throw new AppError(415, "FILE_CONTENT_MISMATCH", "The file content does not match its extension and MIME type.");
    return { storageKey, extension: extension.slice(1), sizeBytes: stored.size, checksum: checksum.digest("hex") };
  } catch (error) {
    if (stored) await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function uploadDocumentVersion(actor: ActorContext, documentId: string, file: Readable, filename: string, mimeType: string, options?: { versionType?: "major" | "minor" }) {
  const document = await requireDocument(actor, documentId, "edit");
  assertNotCheckedOutByOther(actor, document);
  assertNotRecord(document);
  // Drafts are forced when the folder requires approval and the actor cannot
  // approve (share access) — their uploads stay unpublished until approved.
  const governance = await effectiveGovernance(document.tenantId, document.folderId);
  const canApprove = await documentAccess(actor, document, "share");
  const requestedType = options?.versionType === "minor" ? "MINOR" : "MAJOR";
  const versionType: DocumentVersionType = governance.requireApproval && !canApprove ? "MINOR" : requestedType;
  const nextStatus = versionType === "MINOR" ? "DRAFT" : "PUBLISHED";
  const stored = await storeVersionFile(document.tenantId, document.id, file, filename, mimeType);
  try {
    await prisma.$transaction(async (transaction) => {
      const latest = await transaction.documentVersion.findFirst({ where: { documentId: document.id }, orderBy: { version: "desc" }, select: { version: true } });
      const version = (latest?.version ?? 0) + 1;
      await transaction.documentVersion.create({ data: { tenantId: document.tenantId, documentId: document.id, version, versionType, storageKey: stored.storageKey, originalName: filename, mimeType, sizeBytes: stored.sizeBytes, checksum: stored.checksum, createdById: actor.userId } });
      // Only published (major) versions become the file served to readers; minor
      // drafts live on the version row until promoted by a publish. A new draft
      // supersedes any pending publish request for older content.
      await transaction.document.update({
        where: { id: document.id },
        data: versionType === "MAJOR"
          ? { originalName: filename, extension: stored.extension, mimeType, sizeBytes: stored.sizeBytes, storageKey: stored.storageKey, publishStatus: nextStatus, publishRequestedById: null, publishRequestedAt: null }
          : { publishStatus: nextStatus, publishRequestedById: null, publishRequestedAt: null }
      });
      await audit(transaction, actor, "document.uploaded", "Document", document.id, document.tenantId, { version, versionType });
    }, transactionOptions);
  } catch (error) {
    await storage.delete(stored.storageKey).catch(() => undefined);
    throw error;
  }

  // Notify users who have direct permissions on this document that it changed
  const permittedMembers = await prisma.documentPermission.findMany({ where: { documentId: document.id, tenantId: document.tenantId }, select: { membershipId: true } });
  for (const { membershipId } of permittedMembers) {
    if (membershipId === actor.membershipId) continue;
    await notify({
      tenantId: document.tenantId,
      recipientId: membershipId,
      type: "document.changed",
      title: "Documento atualizado",
      body: `Uma nova versão do documento "${document.name}" foi carregada.`,
      data: { documentId, version: stored.extension }
    });
  }

  await safeDispatch(document.tenantId, "document", document.id, "version.added", {
    actorMembershipId: actor.membershipId,
    title: "Nova versão do documento",
    body: `Uma nova versão do documento "${document.name}" foi carregada.`,
    data: { documentId: document.id }
  });
  await safeDispatch(document.tenantId, "folder", document.folderId, "updated", {
    actorMembershipId: actor.membershipId,
    title: "Documento atualizado na pasta",
    body: `O documento "${document.name}" foi atualizado numa pasta que segue.`,
    data: { documentId: document.id, folderId: document.folderId }
  });
  await safeDispatchWebhooks(document.tenantId, "document.version.added", {
    documentId: document.id,
    folderId: document.folderId,
    name: document.name,
    actorMembershipId: actor.membershipId
  });
  await fireWorkflowEvent(actor, "document.version.added", { documentId: document.id, folderId: document.folderId, name: document.name, versionType });

  await safeIndexDocumentContent(document.id);
  await safeAutoFillMetadata(actor, document.id);
  return getDocumentDetail(actor, document.id);
}

async function getVersion(actor: ActorContext, documentId: string, versionId: string, access: "view" | "edit") {
  const document = await requireDocument(actor, documentId, access);
  const version = await prisma.documentVersion.findFirst({ where: { id: versionId, documentId: document.id, tenantId: document.tenantId }, include: { creator: { select: { id: true, name: true, avatar: true } } } });
  if (!version) throw new AppError(404, "DOCUMENT_VERSION_NOT_FOUND", "The document version was not found.");
  return { document, version };
}

export async function downloadDocumentVersion(actor: ActorContext, documentId: string, versionId: string) {
  const { document, version } = await getVersion(actor, documentId, versionId, "view");
  if (!(await storage.exists(version.storageKey))) throw new AppError(404, "FILE_NOT_FOUND", "The stored file was not found.");
  await prisma.auditLog.create({ data: { tenantId: document.tenantId, actorId: actor.membershipId, action: "document.version.downloaded", resourceType: "Document", resourceId: document.id, contextJson: JSON.stringify({ version: version.version }) } });
  return { stream: await storage.get(version.storageKey), name: version.originalName, mimeType: version.mimeType, size: version.sizeBytes };
}

export async function restoreDocumentVersion(actor: ActorContext, documentId: string, versionId: string) {
  const { document, version: source } = await getVersion(actor, documentId, versionId, "edit");
  assertNotCheckedOutByOther(actor, document);
  assertNotRecord(document);
  const extension = path.extname(source.originalName).toLowerCase() || `.${document.extension}`;
  const storageKey = `${document.tenantId}/${document.id}/${randomUUID()}${extension}`;
  const stored = await storage.put(storageKey, await storage.get(source.storageKey));
  try {
    await prisma.$transaction(async (transaction) => {
      const latest = await transaction.documentVersion.findFirst({ where: { documentId: document.id }, orderBy: { version: "desc" }, select: { version: true } });
      const version = (latest?.version ?? 0) + 1;
      await transaction.documentVersion.create({ data: { tenantId: document.tenantId, documentId: document.id, version, versionType: source.versionType, storageKey, originalName: source.originalName, mimeType: source.mimeType, sizeBytes: stored.size, checksum: source.checksum, createdById: actor.userId } });
      await transaction.document.update({
        where: { id: document.id },
        data: source.versionType === "MINOR"
          ? { publishStatus: "DRAFT", publishRequestedById: null, publishRequestedAt: null }
          : { originalName: source.originalName, extension: extension.slice(1), mimeType: source.mimeType, sizeBytes: stored.size, storageKey, publishStatus: "PUBLISHED", publishRequestedById: null, publishRequestedAt: null }
      });
      await audit(transaction, actor, "document.version.restored", "Document", document.id, document.tenantId, { sourceVersion: source.version, version });
    }, transactionOptions);
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
  await safeIndexDocumentContent(document.id);
  return getDocumentDetail(actor, document.id);
}

export async function downloadDocument(actor: ActorContext, documentId: string) {
  const document = await requireDocument(actor, documentId, "view");
  const version = document.storageKey ? null : await prisma.documentVersion.findFirst({ where: { tenantId: actor.organizationId, documentId }, orderBy: { version: "desc" } });
  const storageKey = document.storageKey ?? version?.storageKey;
  if (!storageKey || !(await storage.exists(storageKey))) throw new AppError(404, "FILE_NOT_FOUND", "The stored file was not found.");
  await prisma.auditLog.create({ data: { tenantId: document.tenantId, actorId: actor.membershipId, action: "document.downloaded", resourceType: "Document", resourceId: document.id } });
  return { stream: await storage.get(storageKey), name: document.originalName || version?.originalName || document.name, mimeType: document.mimeType || version?.mimeType || "application/octet-stream", size: document.sizeBytes || version?.sizeBytes };
}

export async function updateDocument(actor: ActorContext, documentId: string, input: { name?: string; folderId?: string | null }) {
  const document = await requireDocument(actor, documentId, "edit");
  assertNotCheckedOutByOther(actor, document);
  assertNotRecord(document);
  const targetFolderId = input.folderId === undefined ? document.folderId : input.folderId;
  if (targetFolderId) await requireFolder(actor, targetFolderId, "edit");
  const name = input.name ?? document.name;
  await ensureUniqueName(actor.organizationId, targetFolderId, name, "document", document.id);
  await prisma.$transaction(async (transaction) => {
    await transaction.document.update({ where: { id: document.id }, data: { name, folderId: targetFolderId } });
    await audit(transaction, actor, input.folderId === undefined ? "document.renamed" : "document.moved", "Document", document.id);
  }, transactionOptions);
  await safeDispatch(document.tenantId, "document", document.id, "updated", {
    actorMembershipId: actor.membershipId,
    title: "Documento atualizado",
    body: `O documento "${name}" foi atualizado.`,
    data: { documentId: document.id }
  });
  await safeDispatch(document.tenantId, "folder", targetFolderId, "updated", {
    actorMembershipId: actor.membershipId,
    title: "Documento atualizado na pasta",
    body: `O documento "${name}" foi atualizado numa pasta que segue.`,
    data: { documentId: document.id, folderId: targetFolderId }
  });
  await safeDispatchWebhooks(document.tenantId, "document.updated", {
    documentId: document.id,
    folderId: targetFolderId,
    name,
    actorMembershipId: actor.membershipId
  });
  await fireWorkflowEvent(actor, "document.updated", { documentId: document.id, folderId: targetFolderId, name });
  return getDocumentDetail(actor, document.id);
}

export async function updateFolder(actor: ActorContext, folderId: string, input: { name?: string; parentId?: string | null }) {
  const folder = await requireFolder(actor, folderId, "edit");
  const targetParentId = input.parentId === undefined ? folder.parentId : input.parentId;
  if (targetParentId === folder.id) throw new AppError(400, "INVALID_FOLDER_MOVE", "A folder cannot be moved into itself.");
  if (targetParentId) {
    await requireFolder(actor, targetParentId, "edit");
    const chain = await folderChain(actor.organizationId, targetParentId);
    if (chain.some(({ id }) => id === folder.id)) throw new AppError(400, "INVALID_FOLDER_MOVE", "A folder cannot be moved into one of its descendants.");
  }
  const name = input.name ?? folder.name;
  await ensureUniqueName(actor.organizationId, targetParentId, name, "folder", folder.id);
  await prisma.$transaction(async (transaction) => {
    await transaction.folder.update({ where: { id: folder.id }, data: { name, parentId: targetParentId } });
    await audit(transaction, actor, input.parentId === undefined ? "folder.renamed" : "folder.moved", "Folder", folder.id);
  }, transactionOptions);
  return getFolderDto(actor, folder.id);
}

export async function copyDocument(actor: ActorContext, documentId: string, folderId: string | null) {
  const source = await requireDocument(actor, documentId, "view");
  if (!hasCapability(actor, "edit")) throw new AppError(403, "FORBIDDEN", "You cannot copy documents.");
  if (folderId) await requireFolder(actor, folderId, "edit");
  const download = await downloadDocument(actor, documentId);
  let name = source.name;
  let sequence = 1;
  while (await prisma.document.findFirst({ where: { tenantId: actor.organizationId, folderId, name, status: "ACTIVE" } })) {
    const extension = path.extname(source.name);
    name = `${path.basename(source.name, extension)} - cópia${sequence > 1 ? ` ${sequence}` : ""}${extension}`;
    sequence += 1;
  }
  return uploadDocument(actor, download.stream, name, download.mimeType, folderId);
}

async function descendantFolderIds(organizationId: string, rootId: string) {
  const ids = [rootId];
  for (let index = 0; index < ids.length; index += 1) {
    const children = await prisma.folder.findMany({ where: { tenantId: organizationId, parentId: ids[index], status: "ACTIVE" }, select: { id: true } });
    ids.push(...children.map(({ id }) => id));
  }
  return ids;
}

export async function copyFolder(actor: ActorContext, folderId: string, parentId: string | null) {
  const source = await requireFolder(actor, folderId, "view");
  if (!hasCapability(actor, "edit")) throw new AppError(403, "FORBIDDEN", "You cannot copy folders.");
  if (parentId) await requireFolder(actor, parentId, "edit");
  let name = source.name;
  let sequence = 1;
  while (await prisma.folder.findFirst({ where: { tenantId: actor.organizationId, parentId, name, status: "ACTIVE" } })) {
    name = `${source.name} - cópia${sequence > 1 ? ` ${sequence}` : ""}`;
    sequence += 1;
  }
  const created = await createFolder(actor, name, parentId);
  const children = await prisma.folder.findMany({ where: { tenantId: actor.organizationId, parentId: source.id, status: "ACTIVE" }, select: { id: true } });
  const documents = await prisma.document.findMany({ where: { tenantId: actor.organizationId, folderId: source.id, status: "ACTIVE" }, select: { id: true } });
  for (const document of documents) await copyDocument(actor, document.id, created.id);
  for (const child of children) await copyFolder(actor, child.id, created.id);
  return created;
}

export async function deleteDocument(actor: ActorContext, documentId: string) {
  const document = await requireDocument(actor, documentId, "delete");
  assertNotCheckedOutByOther(actor, document);
  assertDeletable(document);
  await assertSoftDeleteAllowed(document.tenantId, document.folderId);
  await prisma.$transaction(async (transaction) => {
    await transaction.document.update({ where: { id: document.id }, data: { status: "DELETED", deletedAt: new Date(), deletedByMembershipId: actor.membershipId } });
    await audit(transaction, actor, "document.trashed", "Document", document.id);
  }, transactionOptions);
  await safeDispatch(document.tenantId, "document", document.id, "deleted", {
    actorMembershipId: actor.membershipId,
    title: "Documento eliminado",
    body: `O documento "${document.name}" foi movido para a reciclagem.`,
    data: { documentId: document.id }
  });
  await safeDispatch(document.tenantId, "folder", document.folderId, "deleted", {
    actorMembershipId: actor.membershipId,
    title: "Documento eliminado da pasta",
    body: `O documento "${document.name}" foi eliminado de uma pasta que segue.`,
    data: { documentId: document.id, folderId: document.folderId }
  });
  await safeDispatchWebhooks(document.tenantId, "document.deleted", {
    documentId: document.id,
    folderId: document.folderId,
    name: document.name,
    actorMembershipId: actor.membershipId
  });
  await fireWorkflowEvent(actor, "document.deleted", { documentId: document.id, folderId: document.folderId, name: document.name });
}

export async function deleteFolder(actor: ActorContext, folderId: string) {
  await requireFolder(actor, folderId, "delete");
  const ids = await descendantFolderIds(actor.organizationId, folderId);
  await assertSoftDeleteAllowed(actor.organizationId, folderId);
  const blocked = await prisma.folder.count({ where: { tenantId: actor.organizationId, id: { in: ids }, retentionMode: "BLOCK_DELETE" } });
  if (blocked > 0) throw retentionError();
  const documents = await prisma.document.findMany({ where: { tenantId: actor.organizationId, folderId: { in: ids }, status: "ACTIVE" } });
  for (const document of documents) {
    if (!(await documentAccess(actor, document, "delete"))) throw new AppError(403, "FORBIDDEN", "You cannot delete all documents in this folder.");
    assertDeletable(document);
  }
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.document.updateMany({
      where: { tenantId: actor.organizationId, folderId: { in: ids }, status: "ACTIVE" },
      data: { status: "DELETED", deletedAt: now, deletedByMembershipId: actor.membershipId, deletedViaFolderId: folderId }
    });
    await transaction.folder.updateMany({
      where: { tenantId: actor.organizationId, id: { in: ids }, status: "ACTIVE", NOT: { id: folderId } },
      data: { status: "DELETED", deletedAt: now, deletedByMembershipId: actor.membershipId, deletedViaFolderId: folderId }
    });
    await transaction.folder.update({ where: { id: folderId }, data: { status: "DELETED", deletedAt: now, deletedByMembershipId: actor.membershipId } });
    await audit(transaction, actor, "folder.trashed", "Folder", folderId);
  }, transactionOptions);
}

export async function setFavorite(actor: ActorContext, kind: "document" | "folder", id: string, favorite: boolean) {
  if (kind === "document") await requireDocument(actor, id, "view"); else await requireFolder(actor, id, "view");
  if (kind === "document") {
    if (favorite) await prisma.documentFavorite.upsert({ where: { documentId_membershipId: { documentId: id, membershipId: actor.membershipId } }, create: { tenantId: actor.organizationId, documentId: id, membershipId: actor.membershipId }, update: {} });
    else await prisma.documentFavorite.deleteMany({ where: { tenantId: actor.organizationId, documentId: id, membershipId: actor.membershipId } });
  } else {
    if (favorite) await prisma.folderFavorite.upsert({ where: { folderId_membershipId: { folderId: id, membershipId: actor.membershipId } }, create: { tenantId: actor.organizationId, folderId: id, membershipId: actor.membershipId }, update: {} });
    else await prisma.folderFavorite.deleteMany({ where: { tenantId: actor.organizationId, folderId: id, membershipId: actor.membershipId } });
  }
}

export async function setPermission(actor: ActorContext, kind: "document" | "folder", id: string, input: { membershipId: string; view: boolean; edit: boolean; delete: boolean; share: boolean }) {
  if (kind === "document") await requireDocument(actor, id, "share"); else await requireFolder(actor, id, "share");
  const membership = await prisma.organizationMember.findFirst({ where: { id: input.membershipId, tenantId: actor.organizationId, status: "ACTIVE" } });
  if (!membership) throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "The organization member was not found.");
  const data = { tenantId: actor.organizationId, membershipId: input.membershipId, canView: input.view, canEdit: input.edit, canDelete: input.delete, canShare: input.share };
  if (kind === "document") await prisma.documentPermission.upsert({ where: { documentId_membershipId: { documentId: id, membershipId: input.membershipId } }, create: { ...data, documentId: id }, update: data });
  else await prisma.folderPermission.upsert({ where: { folderId_membershipId: { folderId: id, membershipId: input.membershipId } }, create: { ...data, folderId: id }, update: data });
  await prisma.auditLog.create({ data: { tenantId: actor.organizationId, actorId: actor.membershipId, action: `${kind}.shared`, resourceType: kind === "document" ? "Document" : "Folder", resourceId: id, contextJson: JSON.stringify({ membershipId: input.membershipId }) } });
}

export async function getDocumentShareTargets(actor: ActorContext, documentId: string): Promise<DocumentShareTargetsResponse> {
  await requireDocument(actor, documentId, "share");
  const [memberships, teams, organizations] = await Promise.all([
    prisma.organizationMember.findMany({ where: { tenantId: actor.organizationId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { user: { name: "asc" } } }),
    prisma.team.findMany({ where: { tenantId: actor.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.organizationMember.findMany({
      where: { userId: actor.userId, status: "ACTIVE", tenantId: { not: actor.organizationId }, membershipRoles: { some: { role: { name: { in: ["Admin", "Super Admin"] } } } } },
      select: { tenant: { select: { id: true, name: true } } },
      orderBy: { tenant: { name: "asc" } }
    })
  ]);
  return {
    users: memberships.map(({ id, user }) => ({ id, name: user.name, email: user.email })),
    teams,
    organizations: organizations.map(({ tenant }) => tenant)
  };
}

export async function shareDocument(actor: ActorContext, documentId: string, targetType: DocumentShareTargetType, targetId: string, permission: DocumentSharePermission) {
  const document = await requireDocument(actor, documentId, "share");
  if (targetType === "ORGANIZATION") {
    const governance = await effectiveGovernance(document.tenantId, document.folderId);
    if (governance.sensitivity === "RESTRICTED") {
      throw new AppError(409, "SENSITIVITY_BLOCKED", "The document's sensitivity level prevents sharing with other organizations.");
    }
  }
  const canEdit = permission === "EDIT";
  await prisma.$transaction(async (transaction) => {
    if (targetType === "USER") {
      const membership = await transaction.organizationMember.findFirst({ where: { id: targetId, tenantId: document.tenantId, status: "ACTIVE" } });
      if (!membership) throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "The organization member was not found.");
      await transaction.documentPermission.upsert({ where: { documentId_membershipId: { documentId, membershipId: targetId } }, create: { tenantId: document.tenantId, documentId, membershipId: targetId, canView: true, canEdit }, update: { canView: true, canEdit } });
    } else if (targetType === "TEAM") {
      const team = await transaction.team.findFirst({ where: { id: targetId, tenantId: document.tenantId } });
      if (!team) throw new AppError(404, "TEAM_NOT_FOUND", "The team was not found.");
      await transaction.documentTeamPermission.upsert({ where: { documentId_teamId: { documentId, teamId: targetId } }, create: { tenantId: document.tenantId, documentId, teamId: targetId, canRead: true, canEdit }, update: { canRead: true, canEdit } });
    } else {
      if (targetId === document.tenantId) throw new AppError(400, "INVALID_TARGET_ORGANIZATION", "Select another organization.");
      const target = await transaction.organization.findFirst({ where: { id: targetId, status: "ACTIVE" } });
      if (!target) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "The target organization was not found.");
      if (!actor.isSuperAdmin) {
        const authorization = await transaction.organizationMember.findFirst({ where: { tenantId: targetId, userId: actor.userId, status: "ACTIVE", membershipRoles: { some: { role: { name: { in: ["Admin", "Super Admin"] } } } } } });
        if (!authorization) throw new AppError(403, "CROSS_ORGANIZATION_SHARE_FORBIDDEN", "You are not authorized to share with this organization.");
      }
      await transaction.documentOrganizationPermission.upsert({ where: { documentId_targetOrganizationId: { documentId, targetOrganizationId: targetId } }, create: { tenantId: document.tenantId, documentId, targetOrganizationId: targetId, canRead: true, canEdit }, update: { canRead: true, canEdit } });
    }
    await audit(transaction, actor, "document.shared", "Document", document.id, document.tenantId, { targetType, targetId, permission });
  }, transactionOptions);

  // Notify the user when a document is shared with them directly
  if (targetType === "USER" && targetId !== actor.membershipId) {
    await notify({
      tenantId: document.tenantId,
      recipientId: targetId,
      type: "document.shared",
      title: "Documento partilhado",
      body: `O documento "${document.name}" foi partilhado consigo com permissão de ${permission === "EDIT" ? "edição" : "leitura"}.`,
      data: { documentId, permission }
    });
  }
}

function presentShareLink(link: { id: string; documentId: string | null; permission: string; expiresAt: Date; passwordHash: string | null; createdAt: Date }, url?: string): DocumentShareLinkDto {
  return { id: link.id, targetType: link.documentId ? "document" : "folder", permission: link.permission as DocumentSharePermission, expiresAt: link.expiresAt.toISOString(), passwordProtected: Boolean(link.passwordHash), createdAt: link.createdAt.toISOString(), ...(url ? { url } : {}) };
}

export async function createDocumentShareLink(actor: ActorContext, documentId: string, input: { expiresInHours: number; password?: string; permission: DocumentSharePermission }) {
  const document = await requireDocument(actor, documentId, "share");
  if (input.permission === "UPLOAD") throw new AppError(400, "VALIDATION_ERROR", "Upload-only links are only available for folders.");
  const governance = await effectiveGovernance(document.tenantId, document.folderId);
  if (governance.sensitivity === "CONFIDENTIAL" || governance.sensitivity === "RESTRICTED") {
    throw new AppError(409, "SENSITIVITY_BLOCKED", "The document's sensitivity level prevents creating public share links.");
  }
  const token = createOpaqueToken();
  const link = await prisma.$transaction(async (transaction) => {
    const created = await transaction.documentShareLink.create({ data: { tenantId: document.tenantId, documentId, tokenHash: hashToken(token), passwordHash: input.password ? await hashPassword(input.password) : null, permission: input.permission, expiresAt: new Date(Date.now() + input.expiresInHours * 3_600_000), createdById: actor.userId } });
    await audit(transaction, actor, "document.link.created", "Document", document.id, document.tenantId, { linkId: created.id, permission: input.permission, expiresAt: created.expiresAt.toISOString() });
    return created;
  }, transactionOptions);
  return presentShareLink(link, `${env.APP_URL}/share/${token}`);
}

export async function listDocumentShareLinks(actor: ActorContext, documentId: string) {
  const document = await requireDocument(actor, documentId, "share");
  const links = await prisma.documentShareLink.findMany({ where: { tenantId: document.tenantId, documentId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  return links.map((link) => presentShareLink(link));
}

export async function revokeDocumentShareLink(actor: ActorContext, documentId: string, linkId: string) {
  const document = await requireDocument(actor, documentId, "share");
  const updated = await prisma.documentShareLink.updateMany({ where: { id: linkId, documentId, tenantId: document.tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!updated.count) throw new AppError(404, "SHARE_LINK_NOT_FOUND", "The share link was not found.");
  await prisma.auditLog.create({ data: { tenantId: document.tenantId, actorId: actor.membershipId, action: "document.link.revoked", resourceType: "Document", resourceId: document.id, contextJson: JSON.stringify({ linkId }) } });
}

// --- Folder share links & file requests ---

export async function createFolderShareLink(actor: ActorContext, folderId: string, input: { expiresInHours: number; password?: string; permission: DocumentSharePermission }) {
  const folder = await requireFolder(actor, folderId, "share");
  if (input.permission === "EDIT") throw new AppError(400, "VALIDATION_ERROR", "Folder links support read or upload-only access.");
  const governance = await effectiveGovernance(folder.tenantId, folder.id);
  if (governance.sensitivity === "CONFIDENTIAL" || governance.sensitivity === "RESTRICTED") {
    throw new AppError(409, "SENSITIVITY_BLOCKED", "The folder's sensitivity level prevents creating public share links.");
  }
  const token = createOpaqueToken();
  const link = await prisma.$transaction(async (transaction) => {
    const created = await transaction.documentShareLink.create({ data: { tenantId: folder.tenantId, folderId, tokenHash: hashToken(token), passwordHash: input.password ? await hashPassword(input.password) : null, permission: input.permission, expiresAt: new Date(Date.now() + input.expiresInHours * 3_600_000), createdById: actor.userId } });
    await audit(transaction, actor, "folder.link.created", "Folder", folder.id, folder.tenantId, { linkId: created.id, permission: input.permission, expiresAt: created.expiresAt.toISOString() });
    return created;
  }, transactionOptions);
  return presentShareLink(link, `${env.APP_URL}/share/${token}`);
}

export async function listFolderShareLinks(actor: ActorContext, folderId: string) {
  const folder = await requireFolder(actor, folderId, "share");
  const links = await prisma.documentShareLink.findMany({ where: { tenantId: folder.tenantId, folderId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  return links.map((link) => presentShareLink(link));
}

export async function revokeFolderShareLink(actor: ActorContext, folderId: string, linkId: string) {
  const folder = await requireFolder(actor, folderId, "share");
  const updated = await prisma.documentShareLink.updateMany({ where: { id: linkId, folderId, tenantId: folder.tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!updated.count) throw new AppError(404, "SHARE_LINK_NOT_FOUND", "The share link was not found.");
  await prisma.auditLog.create({ data: { tenantId: folder.tenantId, actorId: actor.membershipId, action: "folder.link.revoked", resourceType: "Folder", resourceId: folder.id, contextJson: JSON.stringify({ linkId }) } });
}

type ResolvedShareLink = Prisma.DocumentShareLinkGetPayload<{ include: { document: true; folder: true } }>;

async function resolveShareLink(token: string, password?: string, requireEdit = false) {
  const link = await prisma.documentShareLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { document: true, folder: true } });
  const targetActive = link?.document ? link.document.status === "ACTIVE" : link?.folder ? link.folder.status === "ACTIVE" : false;
  if (!link || link.revokedAt || link.expiresAt <= new Date() || !targetActive) throw new AppError(404, "SHARE_LINK_NOT_FOUND", "The share link is invalid or has expired.");
  if (requireEdit && link.permission !== "EDIT") throw new AppError(403, "SHARE_LINK_READ_ONLY", "This share link is read-only.");
  if (link.passwordHash && (!password || !(await verifyPassword(link.passwordHash, password)))) throw new AppError(401, "SHARE_PASSWORD_REQUIRED", "The share link password is required or invalid.");
  return link;
}

// Checks that a document/folder sits inside the shared folder's subtree.
async function withinSharedFolder(link: ResolvedShareLink, folderId: string | null | undefined, documentId?: string): Promise<boolean> {
  if (!link.folder) return false;
  if (folderId) {
    if (folderId === link.folderId) return true;
    const chain = await ancestorFolders(link.tenantId, folderId);
    return chain.some((folder) => folder.id === link.folderId && folder.status === "ACTIVE");
  }
  if (documentId) {
    const document = await prisma.document.findFirst({ where: { id: documentId, tenantId: link.tenantId, status: "ACTIVE" }, select: { folderId: true } });
    return document ? withinSharedFolder(link, document.folderId) : false;
  }
  return false;
}

export async function getPublicDocumentShare(token: string, password?: string): Promise<PublicDocumentShareDto> {
  const link = await resolveShareLink(token, password);
  if (link.folder) {
    return { kind: "folder", documentId: null, folderId: link.folder.id, name: link.folder.name, mimeType: null, sizeBytes: null, permission: link.permission as DocumentSharePermission, expiresAt: link.expiresAt.toISOString() };
  }
  const document = link.document!;
  return { kind: "document", documentId: document.id, folderId: null, name: document.name, mimeType: document.mimeType, sizeBytes: document.sizeBytes, permission: link.permission as DocumentSharePermission, expiresAt: link.expiresAt.toISOString() };
}

// Lists one level inside a folder shared via link (READ links only).
export async function browsePublicFolderShare(token: string, folderId: string | undefined, password?: string): Promise<PublicShareFolderContentsDto> {
  const link = await resolveShareLink(token, password);
  if (!link.folder || link.permission !== "READ") throw new AppError(403, "SHARE_LINK_READ_ONLY", "This share link does not allow browsing.");
  const currentId = folderId ?? link.folderId!;
  if (!(await withinSharedFolder(link, currentId))) throw new AppError(404, "FOLDER_NOT_FOUND", "The folder was not found in this share.");
  const current = await prisma.folder.findFirst({ where: { id: currentId, tenantId: link.tenantId, status: "ACTIVE" } });
  if (!current) throw new AppError(404, "FOLDER_NOT_FOUND", "The folder was not found in this share.");
  const [folders, documents] = await Promise.all([
    prisma.folder.findMany({ where: { tenantId: link.tenantId, parentId: current.id, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.document.findMany({ where: { tenantId: link.tenantId, folderId: current.id, status: "ACTIVE" }, orderBy: { name: "asc" } })
  ]);
  const items: PublicShareItemDto[] = [
    ...folders.map((folder): PublicShareItemDto => ({ id: folder.id, kind: "folder", name: folder.name, mimeType: null, sizeBytes: null, updatedAt: folder.updatedAt.toISOString() })),
    ...documents.map((document): PublicShareItemDto => ({ id: document.id, kind: "document", name: document.name, mimeType: document.mimeType, sizeBytes: document.sizeBytes, updatedAt: document.updatedAt.toISOString() }))
  ];
  // Breadcrumbs rooted at the shared folder (shown as the anonymous root).
  const chain = await ancestorFolders(link.tenantId, current.id);
  const rootIndex = chain.findIndex((folder) => folder.id === link.folderId);
  const trail = rootIndex >= 0 ? chain.slice(rootIndex + 1) : [];
  return {
    folder: { id: current.id, name: current.name },
    breadcrumbs: [{ id: null, name: link.folder.name }, ...trail.filter((folder) => folder.id !== current.id).map((folder) => ({ id: folder.id, name: folder.name }))],
    items
  };
}

export async function downloadPublicShareFile(token: string, documentId: string, password?: string) {
  const link = await resolveShareLink(token, password);
  if (link.folder) {
    if (link.permission !== "READ") throw new AppError(403, "SHARE_LINK_READ_ONLY", "This share link does not allow downloads.");
    if (!(await withinSharedFolder(link, null, documentId))) throw new AppError(404, "DOCUMENT_NOT_FOUND", "The document was not found in this share.");
    const document = await prisma.document.findFirstOrThrow({ where: { id: documentId, tenantId: link.tenantId, status: "ACTIVE" } });
    if (!document.storageKey || !(await storage.exists(document.storageKey))) throw new AppError(404, "FILE_NOT_FOUND", "The stored file was not found.");
    await prisma.auditLog.create({ data: { tenantId: link.tenantId, action: "folder.link.downloaded", resourceType: "Document", resourceId: document.id, contextJson: JSON.stringify({ linkId: link.id }) } });
    return { stream: await storage.get(document.storageKey), name: document.originalName || document.name, mimeType: document.mimeType, size: document.sizeBytes };
  }
  const document = link.document!;
  if (document.id !== documentId) throw new AppError(404, "DOCUMENT_NOT_FOUND", "The document was not found in this share.");
  return downloadPublicDocumentShare(token, password);
}

export async function downloadPublicDocumentShare(token: string, password?: string) {
  const link = await resolveShareLink(token, password);
  if (!link.document) throw new AppError(400, "VALIDATION_ERROR", "This share link points to a folder.");
  if (!link.document.storageKey || !(await storage.exists(link.document.storageKey))) throw new AppError(404, "FILE_NOT_FOUND", "The stored file was not found.");
  await prisma.auditLog.create({ data: { tenantId: link.tenantId, action: "document.link.downloaded", resourceType: "Document", resourceId: link.documentId, contextJson: JSON.stringify({ linkId: link.id }) } });
  return { stream: await storage.get(link.document.storageKey), name: link.document.originalName || link.document.name, mimeType: link.document.mimeType, size: link.document.sizeBytes };
}

export async function uploadPublicDocumentVersion(token: string, password: string | undefined, file: Readable, filename: string, mimeType: string) {
  const link = await resolveShareLink(token, password, true);
  if (!link.document) throw new AppError(400, "VALIDATION_ERROR", "This share link points to a folder.");
  if (link.document.checkedOutByMembershipId) throw new AppError(409, "DOCUMENT_CHECKED_OUT", "The document is checked out.");
  const actor = await getActor(link.tenantId, link.createdById, false);
  const result = await uploadDocumentVersion(actor, link.documentId!, file, filename, mimeType);
  await prisma.auditLog.create({ data: { tenantId: link.tenantId, action: "document.link.edited", resourceType: "Document", resourceId: link.documentId, contextJson: JSON.stringify({ linkId: link.id }) } });
  return result;
}

// File request: anonymous upload into a folder shared with an UPLOAD link.
export async function uploadPublicFolderFile(token: string, password: string | undefined, file: Readable, filename: string, mimeType: string) {
  const link = await resolveShareLink(token, password);
  if (!link.folder || link.permission !== "UPLOAD") throw new AppError(403, "SHARE_LINK_UPLOAD_ONLY", "This share link does not accept uploads.");
  const actor = await getActor(link.tenantId, link.createdById, false);
  let result;
  try {
    result = await uploadDocument(actor, file, filename, mimeType, link.folderId);
  } catch (error) {
    // File requests should never fail on name clashes — auto-rename instead.
    if (!(error instanceof AppError && error.code === "NAME_ALREADY_EXISTS")) throw error;
    const extension = path.extname(filename);
    const base = path.basename(filename, extension);
    let sequence = 2;
    let name = `${base} (${sequence})${extension}`;
    while (await prisma.document.findFirst({ where: { tenantId: link.tenantId, folderId: link.folderId, name, status: "ACTIVE" }, select: { id: true } })) {
      sequence += 1;
      name = `${base} (${sequence})${extension}`;
    }
    result = await uploadDocument(actor, file, name, mimeType, link.folderId);
  }
  await prisma.auditLog.create({ data: { tenantId: link.tenantId, action: "folder.link.uploaded", resourceType: "Folder", resourceId: link.folderId, contextJson: JSON.stringify({ linkId: link.id, documentId: result.document.id, name: filename }) } });
  await safeDispatch(link.tenantId, "folder", link.folderId, "created", {
    actorMembershipId: actor.membershipId,
    title: "Ficheiro recebido por ligação",
    body: `Um ficheiro foi carregado para a pasta "${link.folder.name}" através de uma ligação de pedido.`,
    data: { folderId: link.folderId, documentId: result.document.id }
  });
  return { name: result.document.name };
}

// --- Recycle bin ---

type TrashDocument = Prisma.DocumentGetPayload<{ include: { deletedBy: { include: { user: { select: { id: true; name: true; avatar: true } } } } } }>;
type TrashFolder = Prisma.FolderGetPayload<{ include: { deletedBy: { include: { user: { select: { id: true; name: true; avatar: true } } } } } }>;

const trashInclude = { deletedBy: { include: { user: { select: { id: true, name: true, avatar: true } } } } } as const;

async function originalLocation(organizationId: string, parentFolderId: string | null) {
  const ancestors = await ancestorFolders(organizationId, parentFolderId);
  return ancestors.length ? ancestors.map(({ name }) => name).join(" / ") : "Documentos";
}

function presentTrashDocument(document: TrashDocument, location: string): TrashItemDto {
  return { id: document.id, kind: "document", name: document.name, deletedAt: document.deletedAt!.toISOString(), deletedBy: document.deletedBy ? { id: document.deletedBy.user.id, name: document.deletedBy.user.name, avatar: document.deletedBy.user.avatar } : null, originalLocation: location };
}

function presentTrashFolder(folder: TrashFolder, location: string): TrashItemDto {
  return { id: folder.id, kind: "folder", name: folder.name, deletedAt: folder.deletedAt!.toISOString(), deletedBy: folder.deletedBy ? { id: folder.deletedBy.user.id, name: folder.deletedBy.user.name, avatar: folder.deletedBy.user.avatar } : null, originalLocation: location };
}

export async function listTrash(actor: ActorContext): Promise<TrashResponse> {
  if (!hasCapability(actor, "view")) throw new AppError(403, "FORBIDDEN", "You cannot view the trash.");
  const [folders, documents] = await Promise.all([
    prisma.folder.findMany({ where: { tenantId: actor.organizationId, status: "DELETED", deletedViaFolderId: null }, include: trashInclude, orderBy: { deletedAt: "desc" } }),
    prisma.document.findMany({ where: { tenantId: actor.organizationId, status: "DELETED", deletedViaFolderId: null }, include: trashInclude, orderBy: { deletedAt: "desc" } })
  ]);
  const folderDtos: TrashItemDto[] = [];
  for (const folder of folders) {
    if (await folderAccess(actor, folder, "view", false)) folderDtos.push(presentTrashFolder(folder, await originalLocation(actor.organizationId, folder.parentId)));
  }
  const documentDtos: TrashItemDto[] = [];
  for (const document of documents) {
    if (await documentAccess(actor, document, "view", false)) documentDtos.push(presentTrashDocument(document, await originalLocation(actor.organizationId, document.folderId)));
  }
  return { folders: folderDtos, documents: documentDtos };
}

async function requireTrashDocument(actor: ActorContext, documentId: string, access: DocumentAccess) {
  const document = await prisma.document.findFirst({ where: { id: documentId, tenantId: actor.organizationId, status: "DELETED" } });
  if (!document) throw new AppError(404, "DOCUMENT_NOT_FOUND", "The document was not found in the trash.");
  if (!(await documentAccess(actor, document, access, false))) throw new AppError(403, "FORBIDDEN", "You cannot access this document.");
  return document;
}

async function requireTrashFolder(actor: ActorContext, folderId: string, access: DocumentAccess) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, tenantId: actor.organizationId, status: "DELETED", deletedViaFolderId: null } });
  if (!folder) throw new AppError(404, "FOLDER_NOT_FOUND", "The folder was not found in the trash.");
  if (!(await folderAccess(actor, folder, access, false))) throw new AppError(403, "FORBIDDEN", "You cannot access this folder.");
  return folder;
}

async function folderIsActive(organizationId: string, folderId: string | null) {
  if (!folderId) return false;
  const folder = await prisma.folder.findFirst({ where: { id: folderId, tenantId: organizationId, status: "ACTIVE" }, select: { id: true } });
  return Boolean(folder);
}

function restoredName(name: string, sequence: number, isDocument: boolean) {
  const extension = isDocument ? path.extname(name) : "";
  const base = isDocument ? path.basename(name, extension) : name;
  return `${base} (restaurado${sequence > 1 ? ` ${sequence}` : ""})${extension}`;
}

export async function restoreTrashItem(actor: ActorContext, kind: "document" | "folder", id: string) {
  if (kind === "document") {
    const document = await requireTrashDocument(actor, id, "delete");
    let folderId = document.folderId;
    if (folderId && !(await folderIsActive(actor.organizationId, folderId))) folderId = null;
    let name = document.name;
    let sequence = 1;
    while (await prisma.document.findFirst({ where: { tenantId: actor.organizationId, folderId, name, status: "ACTIVE" } })) {
      name = restoredName(document.name, sequence, true);
      sequence += 1;
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.document.update({ where: { id: document.id }, data: { status: "ACTIVE", deletedAt: null, deletedByMembershipId: null, deletedViaFolderId: null, folderId, name } });
      await audit(transaction, actor, "document.restored", "Document", document.id);
    }, transactionOptions);
    await safeDispatchWebhooks(document.tenantId, "document.restored", {
      documentId: document.id,
      folderId,
      name,
      actorMembershipId: actor.membershipId
    });
    return;
  }
  const folder = await requireTrashFolder(actor, id, "delete");
  let parentId = folder.parentId;
  if (parentId && !(await folderIsActive(actor.organizationId, parentId))) parentId = null;
  let name = folder.name;
  let sequence = 1;
  while (await prisma.folder.findFirst({ where: { tenantId: actor.organizationId, parentId, name, status: "ACTIVE" } })) {
    name = restoredName(folder.name, sequence, false);
    sequence += 1;
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.document.updateMany({
      where: { tenantId: actor.organizationId, deletedViaFolderId: folder.id },
      data: { status: "ACTIVE", deletedAt: null, deletedByMembershipId: null, deletedViaFolderId: null }
    });
    await transaction.folder.updateMany({
      where: { tenantId: actor.organizationId, deletedViaFolderId: folder.id },
      data: { status: "ACTIVE", deletedAt: null, deletedByMembershipId: null, deletedViaFolderId: null }
    });
    await transaction.folder.update({ where: { id: folder.id }, data: { status: "ACTIVE", deletedAt: null, deletedByMembershipId: null, parentId, name } });
    await audit(transaction, actor, "folder.restored", "Folder", folder.id);
  }, transactionOptions);
}

async function purgeDocument(documentId: string, tenantId: string, transaction: Prisma.TransactionClient) {
  const versions = await transaction.documentVersion.findMany({ where: { tenantId, documentId }, select: { storageKey: true } });
  const document = await transaction.document.findUnique({ where: { id: documentId }, select: { storageKey: true } });
  await transaction.document.delete({ where: { id: documentId } });
  const keys = [...new Set([document?.storageKey, ...versions.map(({ storageKey }) => storageKey)].filter((key): key is string => !!key))];
  return keys;
}

export async function purgeTrashItem(actor: ActorContext, kind: "document" | "folder", id: string) {
  const keys: string[] = [];
  if (kind === "document") {
    const document = await requireTrashDocument(actor, id, "delete");
    assertDeletable(document);
    await assertPurgeAllowed(actor.organizationId, document.folderId, document.deletedAt);
    await prisma.$transaction(async (transaction) => {
      keys.push(...await purgeDocument(document.id, actor.organizationId, transaction));
      await audit(transaction, actor, "document.purged", "Document", document.id);
    }, transactionOptions);
  } else {
    const folder = await requireTrashFolder(actor, id, "delete");
    await assertPurgeAllowed(actor.organizationId, folder.id, folder.deletedAt);
    const descendantIds = await prisma.folder.findMany({ where: { tenantId: actor.organizationId, deletedViaFolderId: folder.id }, select: { id: true } });
    const folderIds = [folder.id, ...descendantIds.map(({ id: folderId }) => folderId)];
    const documents = await prisma.document.findMany({ where: { tenantId: actor.organizationId, OR: [{ deletedViaFolderId: folder.id }, { folderId: { in: folderIds } }] }, select: { id: true, isRecord: true, legalHold: true } });
    for (const document of documents) assertDeletable(document);
    await prisma.$transaction(async (transaction) => {
      for (const document of documents) keys.push(...await purgeDocument(document.id, actor.organizationId, transaction));
      await transaction.folder.deleteMany({ where: { tenantId: actor.organizationId, id: { in: folderIds } } });
      await audit(transaction, actor, "folder.purged", "Folder", folder.id);
    }, transactionOptions);
  }
  await Promise.all(keys.map((key) => storage.delete(key).catch(() => undefined)));
}

export async function emptyTrash(actor: ActorContext) {
  const trash = await listTrash(actor);
  for (const item of [...trash.folders, ...trash.documents]) {
    await purgeTrashItem(actor, item.kind, item.id);
  }
}

export async function purgeExpiredTrash() {
  const cutoffBase = new Date();
  const organizations = await prisma.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true, organizationSettings: { select: { trashRetentionDays: true } } } });
  for (const organization of organizations) {
    const retentionDays = organization.organizationSettings?.trashRetentionDays ?? 30;
    const cutoff = new Date(cutoffBase.getTime() - retentionDays * 86_400_000);
    const [folders, documents] = await Promise.all([
      prisma.folder.findMany({ where: { tenantId: organization.id, status: "DELETED", deletedViaFolderId: null, deletedAt: { lt: cutoff } }, select: { id: true, deletedAt: true } }),
      prisma.document.findMany({ where: { tenantId: organization.id, status: "DELETED", deletedViaFolderId: null, deletedAt: { lt: cutoff } }, select: { id: true, folderId: true, deletedAt: true, isRecord: true, legalHold: true } })
    ]);
    for (const { id, folderId, deletedAt, isRecord, legalHold } of documents) {
      // Records and legal holds are never purged automatically.
      if (isRecord || legalHold) continue;
      // Folder retention policies (RETAIN/BLOCK_DELETE) keep the item in trash.
      if (await retentionBlocksPurge(organization.id, folderId, deletedAt)) continue;
      const keys = await prisma.$transaction(async (transaction) => {
        const storageKeys = await purgeDocument(id, organization.id, transaction);
        await transaction.auditLog.create({ data: { tenantId: organization.id, action: "document.purged", resourceType: "Document", resourceId: id, contextJson: JSON.stringify({ reason: "retention" }) } });
        return storageKeys;
      }, transactionOptions);
      await Promise.all(keys.map((key) => storage.delete(key).catch(() => undefined)));
    }
    for (const { id, deletedAt } of folders) {
      if (await retentionBlocksPurge(organization.id, id, deletedAt)) continue;
      const descendantIds = await prisma.folder.findMany({ where: { tenantId: organization.id, deletedViaFolderId: id }, select: { id: true } });
      const folderIds = [id, ...descendantIds.map((descendant) => descendant.id)];
      const trashedDocuments = await prisma.document.findMany({ where: { tenantId: organization.id, OR: [{ deletedViaFolderId: id }, { folderId: { in: folderIds } }] }, select: { id: true } });
      const keys = await prisma.$transaction(async (transaction) => {
        const storageKeys: string[] = [];
        for (const document of trashedDocuments) storageKeys.push(...await purgeDocument(document.id, organization.id, transaction));
        await transaction.folder.deleteMany({ where: { tenantId: organization.id, id: { in: folderIds } } });
        await transaction.auditLog.create({ data: { tenantId: organization.id, action: "folder.purged", resourceType: "Folder", resourceId: id, contextJson: JSON.stringify({ reason: "retention" }) } });
        return storageKeys;
      }, transactionOptions);
      await Promise.all(keys.map((key) => storage.delete(key).catch(() => undefined)));
    }
  }
}

// --- Document comments ---

function presentComment(comment: { id: string; body: string; createdAt: Date; updatedAt: Date; author: { id: string; name: string; avatar: string | null } }): DocumentCommentDto {
  return { id: comment.id, body: comment.body, author: comment.author, createdAt: comment.createdAt.toISOString(), updatedAt: comment.updatedAt.toISOString() };
}

export async function createDocumentComment(actor: ActorContext, documentId: string, body: string): Promise<DocumentCommentDto> {
  const document = await requireDocument(actor, documentId, "view");
  const comment = await prisma.documentComment.create({
    data: { tenantId: document.tenantId, documentId: document.id, authorId: actor.userId, body },
    include: { author: { select: { id: true, name: true, avatar: true } } }
  });
  await prisma.auditLog.create({ data: { tenantId: actor.organizationId, actorId: actor.membershipId, action: "document.commented", resourceType: "Document", resourceId: document.id, contextJson: JSON.stringify({ commentId: comment.id }) } });
  publishResourceEvent(document.tenantId, "document", document.id, "comment.created", { userId: actor.userId, name: comment.author.name, avatar: comment.author.avatar });

  const mentions = await resolveMentions(actor.organizationId, body, permissions.documentsView);
  const accessibleMentions: typeof mentions = [];
  for (const mention of mentions) {
    if (mention.membershipId === actor.membershipId) continue;
    const target = await prisma.organizationMember.findFirst({
      where: { id: mention.membershipId, tenantId: document.tenantId, status: "ACTIVE" },
      include: { user: { select: { id: true, isSuperAdmin: true } }, membershipRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
    });
    if (!target) continue;
    const targetActor: ActorContext = {
      organizationId: document.tenantId,
      userId: target.userId,
      membershipId: target.id,
      isSuperAdmin: target.user.isSuperAdmin,
      capabilities: new Set(target.membershipRoles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))
    };
    if (await documentAccess(targetActor, document, "view")) accessibleMentions.push(mention);
  }
  const mentionIds = new Set(accessibleMentions.map((mention) => mention.membershipId));
  const notified = new Set<string>([actor.membershipId]);
  for (const mention of accessibleMentions) {
    if (notified.has(mention.membershipId)) continue;
    notified.add(mention.membershipId);
    await notify({
      tenantId: document.tenantId,
      recipientId: mention.membershipId,
      type: "user.mentioned",
      title: "Foi mencionado",
      body: `${comment.author.name} mencionou-o no documento "${document.name}".`,
      data: { documentId: document.id, commentId: comment.id, mentionedName: mention.name }
    });
  }

  if (document.createdById !== actor.userId) {
    const ownerMembership = await prisma.organizationMember.findFirst({ where: { tenantId: document.tenantId, userId: document.createdById, status: "ACTIVE" } });
    if (ownerMembership && !notified.has(ownerMembership.id) && !mentionIds.has(ownerMembership.id)) {
      notified.add(ownerMembership.id);
      await notify({
        tenantId: document.tenantId,
        recipientId: ownerMembership.id,
        type: "document.commented",
        title: "Novo comentário no documento",
        body: `${comment.author.name} comentou no documento "${document.name}".`,
        data: { documentId: document.id, commentId: comment.id }
      });
    }
  }

  await safeDispatch(document.tenantId, "document", document.id, "commented", {
    actorMembershipId: actor.membershipId,
    title: "Novo comentário no documento",
    body: `${comment.author.name} comentou no documento "${document.name}".`,
    data: { documentId: document.id, commentId: comment.id }
  });
  await safeDispatchWebhooks(document.tenantId, "document.commented", {
    documentId: document.id,
    commentId: comment.id,
    actorMembershipId: actor.membershipId
  });

  return presentComment(comment);
}

export async function listDocumentComments(actor: ActorContext, documentId: string): Promise<DocumentCommentDto[]> {
  const document = await requireDocument(actor, documentId, "view");
  const comments = await prisma.documentComment.findMany({
    where: { tenantId: document.tenantId, documentId: document.id },
    include: { author: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: "asc" }
  });
  return comments.map(presentComment);
}

export async function deleteDocumentComment(actor: ActorContext, documentId: string, commentId: string): Promise<void> {
  const document = await requireDocument(actor, documentId, "view");
  const comment = await prisma.documentComment.findFirst({ where: { id: commentId, documentId: document.id, tenantId: document.tenantId } });
  if (!comment) throw new AppError(404, "COMMENT_NOT_FOUND", "The comment was not found.");
  if (comment.authorId !== actor.userId && !actor.isSuperAdmin) {
    throw new AppError(403, "FORBIDDEN", "You can only delete your own comments.");
  }
  await prisma.documentComment.delete({ where: { id: commentId } });
  publishResourceEvent(document.tenantId, "document", document.id, "comment.deleted");
}

// --- Check-out / check-in ---

export async function checkOutDocument(actor: ActorContext, documentId: string) {
  const document = await requireDocument(actor, documentId, "edit");
  if (document.checkedOutByMembershipId) {
    if (document.checkedOutByMembershipId !== actor.membershipId) throw new AppError(409, "DOCUMENT_CHECKED_OUT", "The document is checked out by another user.");
    return getDocumentDetail(actor, document.id);
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.document.update({ where: { id: document.id }, data: { checkedOutByMembershipId: actor.membershipId, checkedOutAt: new Date() } });
    await audit(transaction, actor, "document.checked_out", "Document", document.id);
  }, transactionOptions);
  return getDocumentDetail(actor, document.id);
}

export async function checkInDocument(actor: ActorContext, documentId: string) {
  const document = await requireDocument(actor, documentId, "edit");
  if (document.checkedOutByMembershipId) {
    const allowed = document.checkedOutByMembershipId === actor.membershipId || actor.isSuperAdmin || actor.capabilities.has(permissions.documentsDelete);
    if (!allowed) throw new AppError(403, "FORBIDDEN", "Only the user who checked out this document or an administrator can check it in.");
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.document.update({ where: { id: document.id }, data: { checkedOutByMembershipId: null, checkedOutAt: null } });
    await audit(transaction, actor, "document.checked_in", "Document", document.id);
  }, transactionOptions);
  return getDocumentDetail(actor, document.id);
}

// --- Folder metadata ---

const folderMetadataFieldTypes: FolderMetadataFieldType[] = ["text", "longtext", "number", "currency", "date", "datetime", "boolean", "choice", "email", "url", "user"];

function parseOptions(optionsJson: string | null) {
  if (!optionsJson) return null;
  try {
    const parsed = JSON.parse(optionsJson);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function presentMetadataField(field: FolderMetadataField): FolderMetadataFieldDto {
  return { id: field.id, name: field.name, slug: field.slug, type: field.type as FolderMetadataFieldType, required: field.required, options: parseOptions(field.optionsJson), order: field.order };
}

export async function getEffectiveMetadataFields(organizationId: string, folderId: string | null): Promise<FolderMetadataFieldDto[]> {
  if (!folderId) return [];
  const chain = await folderChain(organizationId, folderId);
  const fields = await prisma.folderMetadataField.findMany({
    where: { tenantId: organizationId, folderId: { in: chain.map(({ id }) => id) } },
    orderBy: { order: "asc" }
  });
  const byFolder = new Map(chain.map((folder, index) => [folder.id, index]));
  const bySlug = new Map<string, FolderMetadataField>();
  for (const field of fields) {
    const existing = bySlug.get(field.slug);
    if (!existing || (byFolder.get(field.folderId) ?? -1) > (byFolder.get(existing.folderId) ?? -1)) bySlug.set(field.slug, field);
  }
  return [...bySlug.values()]
    .sort((a, b) => (byFolder.get(b.folderId) ?? 0) - (byFolder.get(a.folderId) ?? 0) || a.order - b.order)
    .map(presentMetadataField);
}

export async function getFolderMetadataFields(actor: ActorContext, folderId: string) {
  const folder = await requireFolder(actor, folderId, "view");
  const ancestors = await folderChain(actor.organizationId, folder.parentId);
  const [own, inherited] = await Promise.all([
    prisma.folderMetadataField.findMany({ where: { tenantId: actor.organizationId, folderId: folder.id }, orderBy: { order: "asc" } }),
    ancestors.length ? prisma.folderMetadataField.findMany({ where: { tenantId: actor.organizationId, folderId: { in: ancestors.map(({ id }) => id) } }, orderBy: { order: "asc" } }) : []
  ]);
  const depth = new Map(ancestors.map((ancestor, index) => [ancestor.id, index]));
  const bySlug = new Map<string, FolderMetadataField>();
  for (const field of inherited) {
    const existing = bySlug.get(field.slug);
    if (!existing || (depth.get(field.folderId) ?? -1) > (depth.get(existing.folderId) ?? -1)) bySlug.set(field.slug, field);
  }
  return {
    fields: own.map(presentMetadataField),
    inherited: [...bySlug.values()]
      .sort((a, b) => (depth.get(b.folderId) ?? 0) - (depth.get(a.folderId) ?? 0) || a.order - b.order)
      .map(presentMetadataField)
  };
}

export async function setFolderMetadataFields(actor: ActorContext, folderId: string, fields: FolderMetadataFieldInput[]) {
  const folder = await requireFolder(actor, folderId, "edit");
  const slugs = new Set<string>();
  for (const field of fields) {
    if (!folderMetadataFieldTypes.includes(field.type)) throw new AppError(400, "VALIDATION_ERROR", `Field type "${field.type}" is not supported.`);
    if (slugs.has(field.slug)) throw new AppError(400, "VALIDATION_ERROR", `Duplicate field slug: ${field.slug}`);
    slugs.add(field.slug);
    if (field.type === "choice" && (!field.options || field.options.length === 0)) throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" requires at least one option.`);
  }
  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.folderMetadataField.findMany({ where: { tenantId: actor.organizationId, folderId: folder.id } });
    const keepSlugs = new Set(fields.map((field) => field.slug));
    const toDelete = existing.filter((field) => !keepSlugs.has(field.slug));
    if (toDelete.length) await transaction.folderMetadataField.deleteMany({ where: { id: { in: toDelete.map((field) => field.id) } } });
    for (const field of fields) {
      const data = { tenantId: actor.organizationId, name: field.name, type: field.type, required: field.required, optionsJson: field.options ? JSON.stringify(field.options) : null, order: field.order };
      await transaction.folderMetadataField.upsert({ where: { folderId_slug: { folderId: folder.id, slug: field.slug } }, create: { ...data, folderId: folder.id, slug: field.slug }, update: data });
    }
    await audit(transaction, actor, "folder.metadata_schema_updated", "Folder", folder.id);
  }, transactionOptions);
  return getFolderMetadataFields(actor, folder.id);
}

async function validateMetadataValue(organizationId: string, field: FolderMetadataFieldDto, raw: unknown): Promise<unknown> {
  const fail = () => new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" has an invalid value.`);
  switch (field.type) {
    case "text":
    case "longtext":
      if (typeof raw !== "string") throw fail();
      return raw.slice(0, field.type === "longtext" ? 10_000 : 1000);
    case "number": {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw fail();
      return value;
    }
    case "currency": {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw fail();
      return Math.round(value * 100) / 100;
    }
    case "boolean":
      if (typeof raw !== "boolean") throw fail();
      return raw;
    case "date":
    case "datetime": {
      const value = new Date(typeof raw === "string" ? raw : String(raw));
      if (Number.isNaN(value.getTime())) throw fail();
      return value.toISOString();
    }
    case "choice": {
      const allowed = (field.options ?? []).map((option) => option.value);
      if (typeof raw !== "string" || !allowed.includes(raw)) throw fail();
      return raw;
    }
    case "email":
      if (typeof raw !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) throw fail();
      return raw;
    case "url":
      if (typeof raw !== "string") throw fail();
      try { new URL(raw); } catch { throw fail(); }
      return raw;
    case "user": {
      if (typeof raw !== "string" || !raw.trim()) throw fail();
      const membership = await prisma.organizationMember.findFirst({ where: { id: raw, tenantId: organizationId, status: "ACTIVE" }, select: { id: true } });
      if (!membership) throw fail();
      return raw;
    }
    default:
      throw fail();
  }
}

export async function updateDocumentMetadata(actor: ActorContext, documentId: string, values: Record<string, unknown>) {
  const document = await requireDocument(actor, documentId, "edit");
  assertNotCheckedOutByOther(actor, document);
  assertNotRecord(document);
  const fields = await getEffectiveMetadataFields(actor.organizationId, document.folderId);
  const known = new Map(fields.map((field) => [field.slug, field]));
  const metadata = { ...parseMetadata(document.metadataJson), ...values };
  for (const key of Object.keys(values)) {
    if (!known.has(key)) throw new AppError(400, "VALIDATION_ERROR", `Unknown field "${key}".`);
  }
  const result: Record<string, unknown> = {};
  for (const [slug, raw] of Object.entries(metadata)) {
    const field = known.get(slug);
    if (!field) continue;
    result[slug] = raw == null || raw === "" ? raw : await validateMetadataValue(actor.organizationId, field, raw);
  }
  for (const field of fields) {
    const value = result[field.slug];
    if (field.required && (value == null || value === "")) throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" is required.`);
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.document.update({ where: { id: document.id }, data: { metadataJson: JSON.stringify(result) } });
    await audit(transaction, actor, "document.metadata_updated", "Document", document.id);
  }, transactionOptions);
  return getDocumentDetail(actor, document.id);
}

// --- Templates ---

export async function setDocumentTemplate(actor: ActorContext, documentId: string, isTemplate: boolean) {
  const document = await requireDocument(actor, documentId, "edit");
  await prisma.$transaction(async (transaction) => {
    await transaction.document.update({ where: { id: document.id }, data: { isTemplate } });
    await audit(transaction, actor, "document.template.set", "Document", document.id, document.tenantId, { isTemplate });
  }, transactionOptions);
  return getDocumentDetail(actor, document.id);
}

export async function setFolderTemplate(actor: ActorContext, folderId: string, isTemplate: boolean) {
  const folder = await requireFolder(actor, folderId, "edit");
  await prisma.$transaction(async (transaction) => {
    await transaction.folder.update({ where: { id: folder.id }, data: { isTemplate } });
    await audit(transaction, actor, "folder.template.set", "Folder", folder.id, actor.organizationId, { isTemplate });
  }, transactionOptions);
  return getFolderDto(actor, folder.id);
}

export async function listTemplates(actor: ActorContext): Promise<TemplatesResponse> {
  if (!hasCapability(actor, "view")) throw new AppError(403, "FORBIDDEN", "You cannot view templates.");
  const include = {
    owner: { select: { id: true, name: true, avatar: true } },
    favorites: { where: { membershipId: actor.membershipId } },
    permissions: true
  } as const;
  const [folders, documents] = await Promise.all([
    prisma.folder.findMany({ where: { tenantId: actor.organizationId, isTemplate: true, status: "ACTIVE" }, include, orderBy: { name: "asc" } }),
    prisma.document.findMany({
      where: { tenantId: actor.organizationId, isTemplate: true, status: "ACTIVE" },
      include: { ...include, checkedOutBy: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
      orderBy: { name: "asc" }
    })
  ]);
  const visibleFolders = (await Promise.all(folders.map(async (folder) => await folderAccess(actor, folder, "view") ? folder : null))).filter((folder): folder is FolderWithRelations => !!folder);
  const visibleDocuments = (await Promise.all(documents.map(async (document) => await documentAccess(actor, document, "view") ? document : null))).filter((document): document is DocumentWithRelations => !!document);
  return {
    documents: await Promise.all(visibleDocuments.map((document) => presentDocument(actor, document))),
    folders: await Promise.all(visibleFolders.map((folder) => presentFolder(actor, folder)))
  };
}

export async function instantiateDocument(actor: ActorContext, templateDocumentId: string, input: { folderId?: string | null; name?: string }) {
  const template = await requireDocument(actor, templateDocumentId, "view");
  if (!template.isTemplate) throw new AppError(400, "NOT_A_TEMPLATE", "This document is not a template.");
  if (!hasCapability(actor, "edit")) throw new AppError(403, "FORBIDDEN", "You cannot create documents.");
  const folderId = input.folderId ?? null;
  if (folderId) await requireFolder(actor, folderId, "edit");
  const download = await downloadDocument(actor, templateDocumentId);
  const created = await uploadDocument(actor, download.stream, input.name ?? template.name, download.mimeType, folderId);
  await prisma.auditLog.create({
    data: { tenantId: actor.organizationId, actorId: actor.membershipId, action: "document.instantiated", resourceType: "Document", resourceId: created.document.id, contextJson: JSON.stringify({ templateDocumentId }) }
  });
  return created;
}

export async function instantiateFolder(actor: ActorContext, templateFolderId: string, input: { parentId?: string | null; name?: string }) {
  const source = await requireFolder(actor, templateFolderId, "view");
  if (!source.isTemplate) throw new AppError(400, "NOT_A_TEMPLATE", "This folder is not a template.");
  if (!hasCapability(actor, "edit")) throw new AppError(403, "FORBIDDEN", "You cannot create folders.");
  const parentId = input.parentId ?? null;
  if (parentId) await requireFolder(actor, parentId, "edit");
  let name = input.name ?? source.name;
  if (input.name) {
    await ensureUniqueName(actor.organizationId, parentId, name, "folder");
  } else {
    let sequence = 1;
    while (await prisma.folder.findFirst({ where: { tenantId: actor.organizationId, parentId, name, status: "ACTIVE" } })) {
      name = `${source.name} - cópia${sequence > 1 ? ` ${sequence}` : ""}`;
      sequence += 1;
    }
  }
  const created = await createFolder(actor, name, parentId);
  const children = await prisma.folder.findMany({ where: { tenantId: actor.organizationId, parentId: source.id, status: "ACTIVE" }, select: { id: true } });
  const documents = await prisma.document.findMany({ where: { tenantId: actor.organizationId, folderId: source.id, status: "ACTIVE" }, select: { id: true } });
  for (const document of documents) await copyDocument(actor, document.id, created.id);
  for (const child of children) await copyFolder(actor, child.id, created.id);
  await prisma.auditLog.create({
    data: { tenantId: actor.organizationId, actorId: actor.membershipId, action: "folder.instantiated", resourceType: "Folder", resourceId: created.id, contextJson: JSON.stringify({ templateFolderId }) }
  });
  return created;
}

// --- Pinning ---

export async function setPinned(actor: ActorContext, kind: "document" | "folder", id: string, pinned: boolean) {
  if (kind === "document") await requireDocument(actor, id, "edit"); else await requireFolder(actor, id, "edit");
  const pinnedAt = pinned ? new Date() : null;
  await prisma.$transaction(async (transaction) => {
    if (kind === "document") await transaction.document.update({ where: { id }, data: { pinnedAt } });
    else await transaction.folder.update({ where: { id }, data: { pinnedAt } });
    await audit(transaction, actor, `${kind}.${pinned ? "pinned" : "unpinned"}`, kind === "document" ? "Document" : "Folder", id);
  }, transactionOptions);
  return kind === "document" ? getDocumentDetail(actor, id) : getFolderDto(actor, id);
}

// --- Recent & favorites ---

export async function listRecentDocuments(actor: ActorContext): Promise<RecentDocumentsResponse> {
  if (!hasCapability(actor, "view")) throw new AppError(403, "FORBIDDEN", "You cannot view documents.");
  const documents = await prisma.document.findMany({
    where: { tenantId: actor.organizationId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      favorites: { where: { membershipId: actor.membershipId } },
      permissions: true,
      checkedOutBy: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      folder: { select: { id: true, name: true } }
    }
  });
  const visible: RecentDocumentDto[] = [];
  for (const document of documents) {
    if (visible.length >= 50) break;
    if (!(await documentAccess(actor, document, "view"))) continue;
    visible.push({ ...(await presentDocument(actor, document)), folderName: document.folder?.name ?? null });
  }
  return { documents: visible };
}

export async function listFavorites(actor: ActorContext): Promise<FavoritesResponse> {
  if (!hasCapability(actor, "view")) throw new AppError(403, "FORBIDDEN", "You cannot view favorites.");
  const include = {
    owner: { select: { id: true, name: true, avatar: true } },
    favorites: { where: { membershipId: actor.membershipId } },
    permissions: true
  } as const;
  const [folderFavorites, documentFavorites] = await Promise.all([
    prisma.folderFavorite.findMany({
      where: { tenantId: actor.organizationId, membershipId: actor.membershipId, folder: { status: "ACTIVE" } },
      include: { folder: { include } },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    prisma.documentFavorite.findMany({
      where: { tenantId: actor.organizationId, membershipId: actor.membershipId, document: { status: "ACTIVE" } },
      include: { document: { include: { ...include, checkedOutBy: { include: { user: { select: { id: true, name: true, avatar: true } } } } } } },
      orderBy: { createdAt: "desc" },
      take: 200
    })
  ]);
  const folders: FolderItemDto[] = [];
  for (const { folder } of folderFavorites) {
    if (await folderAccess(actor, folder, "view")) folders.push(await presentFolder(actor, folder));
  }
  const documents: DocumentItemDto[] = [];
  for (const { document } of documentFavorites) {
    if (await documentAccess(actor, document, "view")) documents.push(await presentDocument(actor, document));
  }
  return { folders, documents };
}

// --- Folder governance (retention + sensitivity) ---

export async function updateFolderGovernance(actor: ActorContext, folderId: string, input: { retentionMode?: RetentionMode; retentionDays?: number | null; sensitivity?: SensitivityLevel; requireApproval?: boolean }) {
  const folder = await requireFolder(actor, folderId, "edit");
  if (input.retentionMode === "RETAIN" && input.retentionDays === null) {
    throw new AppError(400, "VALIDATION_ERROR", "RETAIN mode requires a retention period in days.");
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.folder.update({
      where: { id: folder.id },
      data: {
        retentionMode: input.retentionMode,
        retentionDays: input.retentionDays,
        sensitivity: input.sensitivity,
        requireApproval: input.requireApproval
      }
    });
    await audit(transaction, actor, "folder.governance.updated", "Folder", folder.id, actor.organizationId, { ...input });
  }, transactionOptions);
  return getFolderDto(actor, folder.id);
}

// --- Access panel ("Gerir acesso") + access requests ---

const fullAccess: Record<DocumentAccess, boolean> = { view: true, edit: true, delete: true, share: true };

function grantAccess(grant: { canView: boolean; canEdit: boolean; canDelete: boolean; canShare: boolean }): Record<DocumentAccess, boolean> {
  return { view: grant.canView, edit: grant.canEdit, delete: grant.canDelete, share: grant.canShare };
}

async function membershipName(membershipId: string): Promise<{ name: string; email: string } | null> {
  const membership = await prisma.organizationMember.findFirst({
    where: { id: membershipId },
    include: { user: { select: { name: true, email: true } } }
  });
  return membership ? membership.user : null;
}

export async function getAccessPanel(actor: ActorContext, kind: "document" | "folder", id: string): Promise<AccessPanelResponse> {
  const entries: AccessEntryDto[] = [];
  let owner: DocumentOwnerDto | null = null;
  let inheritsPermissions = true;
  let linksCount = 0;

  if (kind === "document") {
    const document = await requireDocument(actor, id, "share");
    inheritsPermissions = document.inheritsPermissions;
    const [grants, teamGrants, links, ownerUser, ownerMembership] = await Promise.all([
      prisma.documentPermission.findMany({ where: { tenantId: document.tenantId, documentId: id }, include: { membership: { include: { user: { select: { name: true, email: true } } } } } }),
      prisma.documentTeamPermission.findMany({ where: { tenantId: document.tenantId, documentId: id }, include: { team: { select: { name: true } } } }),
      prisma.documentShareLink.findMany({ where: { tenantId: document.tenantId, documentId: id, revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.user.findUnique({ where: { id: document.createdById }, select: { id: true, name: true, avatar: true } }),
      prisma.organizationMember.findFirst({ where: { tenantId: document.tenantId, userId: document.createdById, status: "ACTIVE" }, select: { id: true } })
    ]);
    owner = ownerUser;
    if (ownerUser) entries.push({ membershipId: ownerMembership?.id, name: ownerUser.name, access: { ...fullAccess }, source: "owner" });
    for (const grant of grants) entries.push({ membershipId: grant.membershipId, name: grant.membership.user.name, access: grantAccess(grant), source: "user" });
    for (const grant of teamGrants) entries.push({ teamId: grant.teamId, name: grant.team.name, access: { view: grant.canRead, edit: grant.canEdit, delete: false, share: false }, source: "team" });
    for (const link of links) entries.push({ name: "Ligação pública", access: { view: true, edit: link.permission === "EDIT", delete: false, share: false }, source: "link" });
    linksCount = links.length;
  } else {
    const folder = await requireFolder(actor, id, "share");
    inheritsPermissions = folder.inheritsPermissions;
    const [grants, links, ownerUser, ownerMembership] = await Promise.all([
      prisma.folderPermission.findMany({ where: { tenantId: folder.tenantId, folderId: id }, include: { membership: { include: { user: { select: { name: true, email: true } } } } } }),
      prisma.documentShareLink.findMany({ where: { tenantId: folder.tenantId, folderId: id, revokedAt: null, expiresAt: { gt: new Date() } } }),
      folder.createdById ? prisma.user.findUnique({ where: { id: folder.createdById }, select: { id: true, name: true, avatar: true } }) : null,
      folder.createdById ? prisma.organizationMember.findFirst({ where: { tenantId: folder.tenantId, userId: folder.createdById, status: "ACTIVE" }, select: { id: true } }) : null
    ]);
    owner = ownerUser;
    if (ownerUser) entries.push({ membershipId: ownerMembership?.id, name: ownerUser.name, access: { ...fullAccess }, source: "owner" });
    for (const grant of grants) entries.push({ membershipId: grant.membershipId, name: grant.membership.user.name, access: grantAccess(grant), source: "user" });
    for (const link of links) entries.push({ name: "Ligação pública", access: { view: link.permission === "READ", edit: false, delete: false, share: false }, source: "link" });
    linksCount = links.length;
  }

  return { entries, inheritsPermissions, owner, linksCount };
}

export async function setInheritance(actor: ActorContext, kind: "document" | "folder", id: string, inherit: boolean) {
  if (kind === "document") await requireDocument(actor, id, "share"); else await requireFolder(actor, id, "share");
  await prisma.$transaction(async (transaction) => {
    if (kind === "document") await transaction.document.update({ where: { id }, data: { inheritsPermissions: inherit } });
    else await transaction.folder.update({ where: { id }, data: { inheritsPermissions: inherit } });
    await audit(transaction, actor, `${kind}.inheritance.set`, kind === "document" ? "Document" : "Folder", id, actor.organizationId, { inherit });
  }, transactionOptions);
  return getAccessPanel(actor, kind, id);
}

// Finds the resource name for display, regardless of trash status.
async function resourceName(organizationId: string, resourceType: "document" | "folder", resourceId: string): Promise<string | null> {
  if (resourceType === "document") {
    const document = await prisma.document.findFirst({ where: { id: resourceId, tenantId: organizationId }, select: { name: true } });
    return document?.name ?? null;
  }
  const folder = await prisma.folder.findFirst({ where: { id: resourceId, tenantId: organizationId }, select: { name: true } });
  return folder?.name ?? null;
}

// Approvers for an access request: the item owner, falling back to org admins.
async function accessApprovers(organizationId: string, resourceType: "document" | "folder", resourceId: string, excludeMembershipId?: string): Promise<string[]> {
  let ownerUserId: string | null = null;
  if (resourceType === "document") {
    const document = await prisma.document.findFirst({ where: { id: resourceId, tenantId: organizationId }, select: { createdById: true } });
    ownerUserId = document?.createdById ?? null;
  } else {
    const folder = await prisma.folder.findFirst({ where: { id: resourceId, tenantId: organizationId }, select: { createdById: true } });
    ownerUserId = folder?.createdById ?? null;
  }
  if (ownerUserId) {
    const ownerMembership = await prisma.organizationMember.findFirst({ where: { tenantId: organizationId, userId: ownerUserId, status: "ACTIVE" }, select: { id: true } });
    if (ownerMembership && ownerMembership.id !== excludeMembershipId) return [ownerMembership.id];
  }
  const admins = await prisma.organizationMember.findMany({
    where: { tenantId: organizationId, status: "ACTIVE", membershipRoles: { some: { role: { name: { in: ["Admin", "Super Admin"] } } } } },
    select: { id: true }
  });
  return admins.map(({ id }) => id).filter((id) => id !== excludeMembershipId);
}

// Whether the actor holds "share" capability on a resource — used to filter approver views.
async function canShareResource(actor: ActorContext, resourceType: "document" | "folder", resourceId: string): Promise<boolean> {
  if (resourceType === "document") {
    const document = await prisma.document.findFirst({ where: { id: resourceId, tenantId: actor.organizationId, status: "ACTIVE" } });
    return document ? documentAccess(actor, document, "share") : false;
  }
  const folder = await prisma.folder.findFirst({ where: { id: resourceId, tenantId: actor.organizationId, status: "ACTIVE" } });
  return folder ? folderAccess(actor, folder, "share") : false;
}

async function presentAccessRequest(organizationId: string, request: AccessRequest): Promise<AccessRequestDto> {
  const [requester, name] = await Promise.all([
    membershipName(request.requesterMembershipId),
    resourceName(organizationId, request.resourceType as "document" | "folder", request.resourceId)
  ]);
  return {
    id: request.id,
    resourceType: request.resourceType as "document" | "folder",
    resourceId: request.resourceId,
    resourceName: name ?? "(removido)",
    requester: requester ? { membershipId: request.requesterMembershipId, name: requester.name, email: requester.email } : null,
    message: request.message,
    status: request.status as AccessRequestStatus,
    decidedByMembershipId: request.decidedByMembershipId,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString()
  };
}

export async function requestAccess(actor: ActorContext, input: { resourceType: "document" | "folder"; resourceId: string; message?: string }): Promise<AccessRequestDto> {
  const name = await resourceName(actor.organizationId, input.resourceType, input.resourceId);
  if (!name) throw new AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
  // One PENDING request per requester + resource (service-level dedupe).
  const pending = await prisma.accessRequest.findFirst({
    where: { tenantId: actor.organizationId, requesterMembershipId: actor.membershipId, resourceType: input.resourceType, resourceId: input.resourceId, status: "PENDING" }
  });
  if (pending) throw new AppError(409, "ACCESS_REQUEST_PENDING", "An access request for this item is already pending.");
  const request = await prisma.accessRequest.create({
    data: {
      tenantId: actor.organizationId,
      requesterMembershipId: actor.membershipId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      message: input.message
    }
  });
  const requester = await membershipName(actor.membershipId);
  const requesterName = requester?.name ?? "Um membro";
  const recipients = await accessApprovers(actor.organizationId, input.resourceType, input.resourceId, actor.membershipId);
  for (const recipientId of recipients) {
    await notify({
      tenantId: actor.organizationId,
      recipientId,
      type: "access.requested",
      title: "Pedido de acesso",
      body: `${requesterName} pediu acesso a "${name}".`,
      data: { requestId: request.id, resourceType: input.resourceType, resourceId: input.resourceId, resourceName: name, requesterName }
    });
  }
  return presentAccessRequest(actor.organizationId, request);
}

export async function listAccessRequests(actor: ActorContext, input: { status?: AccessRequestStatus }): Promise<AccessRequestsResponse> {
  const requests = await prisma.accessRequest.findMany({
    where: { tenantId: actor.organizationId, status: input.status },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  const visible: AccessRequest[] = [];
  for (const request of requests) {
    if (request.requesterMembershipId === actor.membershipId) {
      visible.push(request);
    } else if (await canShareResource(actor, request.resourceType as "document" | "folder", request.resourceId)) {
      visible.push(request);
    }
  }
  return { requests: await Promise.all(visible.map((request) => presentAccessRequest(actor.organizationId, request))) };
}

export async function decideAccessRequest(actor: ActorContext, requestId: string, input: { approve: boolean; access?: "view" | "edit" }): Promise<AccessRequestDto> {
  const request = await prisma.accessRequest.findFirst({ where: { id: requestId, tenantId: actor.organizationId } });
  if (!request) throw new AppError(404, "ACCESS_REQUEST_NOT_FOUND", "The access request was not found.");
  if (request.status !== "PENDING") throw new AppError(409, "ACCESS_REQUEST_DECIDED", "The access request has already been decided.");
  const resourceType = request.resourceType as "document" | "folder";
  if (!(await canShareResource(actor, resourceType, request.resourceId))) {
    throw new AppError(403, "FORBIDDEN", "You cannot decide access requests for this item.");
  }
  const decided = await prisma.$transaction(async (transaction) => {
    if (input.approve) {
      const grant = {
        tenantId: actor.organizationId,
        membershipId: request.requesterMembershipId,
        canView: true,
        canEdit: input.access === "edit",
        canDelete: false,
        canShare: false
      };
      if (resourceType === "document") {
        await transaction.documentPermission.upsert({
          where: { documentId_membershipId: { documentId: request.resourceId, membershipId: request.requesterMembershipId } },
          create: { ...grant, documentId: request.resourceId },
          update: grant
        });
      } else {
        await transaction.folderPermission.upsert({
          where: { folderId_membershipId: { folderId: request.resourceId, membershipId: request.requesterMembershipId } },
          create: { ...grant, folderId: request.resourceId },
          update: grant
        });
      }
    }
    const updated = await transaction.accessRequest.update({
      where: { id: request.id },
      data: { status: input.approve ? "APPROVED" : "REJECTED", decidedByMembershipId: actor.membershipId, decidedAt: new Date() }
    });
    await audit(transaction, actor, input.approve ? "access_request.approved" : "access_request.rejected", "AccessRequest", request.id, actor.organizationId, {
      resourceType,
      resourceId: request.resourceId,
      access: input.access ?? "view"
    });
    return updated;
  }, transactionOptions);

  const name = await resourceName(actor.organizationId, resourceType, request.resourceId);
  await notify({
    tenantId: actor.organizationId,
    recipientId: request.requesterMembershipId,
    type: input.approve ? "access.granted" : "access.rejected",
    title: input.approve ? "Acesso concedido" : "Acesso recusado",
    body: `O seu pedido de acesso a "${name ?? request.resourceId}" foi ${input.approve ? "aprovado" : "recusado"}.`,
    data: { requestId: request.id, resourceType, resourceId: request.resourceId, resourceName: name }
  });
  return presentAccessRequest(actor.organizationId, decided);
}

// --- AI auto-metadata ---

// Asks the active AI provider for metadata suggestions based on the extracted
// document text, validates each suggestion against the effective field schema and
// fills only fields that are still empty. Returns what was suggested vs applied.
async function computeMetadataSuggestions(organizationId: string, document: Document): Promise<{ suggested: Record<string, unknown>; applied: Record<string, unknown> }> {
  const fields = await getEffectiveMetadataFields(organizationId, document.folderId);
  if (fields.length === 0) return { suggested: {}, applied: {} };
  const content = await prisma.documentContent.findUnique({ where: { documentId: document.id }, select: { text: true } });
  const text = [document.name, content?.text ?? ""].join("\n").trim();
  if (!text) return { suggested: {}, applied: {} };
  const { getAIProvider } = await import("../ai/ai.service.js");
  const result = await getAIProvider().suggestMetadata(text, fields.map((field) => ({ name: field.name, slug: field.slug, type: field.type, options: field.options })));
  const suggested = ((result.actionData as { suggestions?: Record<string, unknown> } | undefined)?.suggestions ?? {}) as Record<string, unknown>;
  const current = parseMetadata(document.metadataJson);
  const bySlug = new Map(fields.map((field) => [field.slug, field]));
  const applied: Record<string, unknown> = {};
  for (const [slug, raw] of Object.entries(suggested)) {
    const field = bySlug.get(slug);
    if (!field) continue;
    const existing = current[slug];
    if (existing !== undefined && existing !== null && existing !== "") continue;
    try {
      applied[slug] = await validateMetadataValue(organizationId, field, raw);
    } catch {
      // Suggestion failed type validation — skipped.
    }
  }
  if (Object.keys(applied).length > 0) {
    const auto = new Set([...parseMetadataAuto(document.metadataAutoJson), ...Object.keys(applied)]);
    await prisma.document.update({
      where: { id: document.id },
      data: { metadataJson: JSON.stringify({ ...current, ...applied }), metadataAutoJson: JSON.stringify([...auto]) }
    });
  }
  return { suggested, applied };
}

export async function autofillDocumentMetadata(actor: ActorContext, documentId: string): Promise<AutofillMetadataResponse> {
  const document = await requireDocument(actor, documentId, "edit");
  return computeMetadataSuggestions(actor.organizationId, document);
}

// --- Document activity feed ---

const EDIT_ACTIONS = new Set(["document.uploaded", "document.version.restored", "document.metadata_updated", "document.renamed", "document.moved", "document.link.edited"]);
const DOWNLOAD_ACTIONS = new Set(["document.downloaded", "document.version.downloaded", "document.link.downloaded", "folder.link.downloaded"]);

export async function getDocumentActivity(actor: ActorContext, documentId: string): Promise<DocumentActivityResponse> {
  const document = await requireDocument(actor, documentId, "view");
  const entries = await prisma.auditLog.findMany({
    where: { tenantId: document.tenantId, resourceType: "Document", resourceId: document.id },
    include: { actor: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
    orderBy: { occurredAt: "desc" },
    take: 100
  });
  const activity: DocumentActivityDto[] = entries.map((entry) => {
    let context: Record<string, unknown> | null = null;
    if (entry.contextJson) {
      try { context = JSON.parse(entry.contextJson) as Record<string, unknown>; } catch { context = null; }
    }
    return {
      id: entry.id,
      action: entry.action,
      actor: entry.actor ? { id: entry.actor.user.id, name: entry.actor.user.name, avatar: entry.actor.user.avatar } : null,
      context,
      occurredAt: entry.occurredAt.toISOString()
    };
  });
  return {
    activity,
    stats: {
      views: entries.filter((entry) => entry.action === "document.viewed").length,
      downloads: entries.filter((entry) => DOWNLOAD_ACTIONS.has(entry.action)).length,
      edits: entries.filter((entry) => EDIT_ACTIONS.has(entry.action)).length
    }
  };
}

// --- Shared with me / shared by me ---

const sharedInclude = {
  owner: { select: { id: true, name: true, avatar: true } },
  favorites: true,
  permissions: true,
  checkedOutBy: { include: { user: { select: { id: true, name: true, avatar: true } } } },
  folder: { select: { id: true, name: true } }
} as const;

export async function listSharedDocuments(actor: ActorContext): Promise<SharedDocumentsResponse> {
  if (!hasCapability(actor, "view")) throw new AppError(403, "FORBIDDEN", "You cannot view documents.");
  const teamIds = (await prisma.teamMember.findMany({ where: { tenantId: actor.organizationId, membershipId: actor.membershipId }, select: { teamId: true } })).map(({ teamId }) => teamId);

  const [direct, viaTeams, viaOrganization, mine] = await Promise.all([
    prisma.documentPermission.findMany({
      where: { tenantId: actor.organizationId, membershipId: actor.membershipId, document: { status: "ACTIVE", createdById: { not: actor.userId } } },
      include: { document: { include: sharedInclude } }
    }),
    teamIds.length ? prisma.documentTeamPermission.findMany({
      where: { tenantId: actor.organizationId, teamId: { in: teamIds }, document: { status: "ACTIVE", createdById: { not: actor.userId } } },
      include: { document: { include: sharedInclude } }
    }) : [],
    prisma.documentOrganizationPermission.findMany({
      where: { targetOrganizationId: actor.organizationId, document: { status: "ACTIVE" } },
      include: { document: { include: sharedInclude } }
    }),
    prisma.document.findMany({
      where: { tenantId: actor.organizationId, createdById: actor.userId, status: "ACTIVE" },
      include: {
        ...sharedInclude,
        _count: { select: { permissions: true, teamPermissions: true, organizationPermissions: true } },
        shareLinks: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 200
    })
  ]);

  const withMe = new Map<string, { document: typeof direct[number]["document"]; sharedVia: SharedVia; canEdit: boolean }>();
  const merge = (document: typeof direct[number]["document"], sharedVia: SharedVia, canEdit: boolean) => {
    const existing = withMe.get(document.id);
    withMe.set(document.id, {
      document,
      sharedVia: existing?.sharedVia === "DIRECT" ? "DIRECT" : sharedVia,
      canEdit: Boolean(existing?.canEdit) || canEdit
    });
  };
  for (const grant of direct) merge(grant.document, "DIRECT", grant.canEdit);
  for (const grant of viaTeams) merge(grant.document, "TEAM", grant.canEdit);
  for (const grant of viaOrganization) merge(grant.document, "ORGANIZATION", grant.canEdit);

  const sharedWithMe: SharedDocumentDto[] = [];
  for (const { document, sharedVia, canEdit } of withMe.values()) {
    if (!(await documentAccess(actor, document, "view"))) continue;
    sharedWithMe.push({ ...(await presentDocument(actor, document)), sharedVia, canEdit, folderName: document.folder?.name ?? null });
  }

  const sharedByMe: SharedByMeDto[] = [];
  for (const document of mine) {
    const grants = document._count.permissions + document._count.teamPermissions + document._count.organizationPermissions;
    const links = document.shareLinks.length;
    if (grants === 0 && links === 0) continue;
    sharedByMe.push({ ...(await presentDocument(actor, document)), grants, links });
  }

  return { sharedWithMe, sharedByMe };
}

// --- Bulk download (ZIP) ---

const BULK_DOWNLOAD_MAX_FILES = 200;

async function collectZipDocuments(actor: ActorContext, input: { documentIds?: string[]; folderIds?: string[] }) {
  const documents: Document[] = [];
  for (const documentId of input.documentIds ?? []) {
    documents.push(await requireDocument(actor, documentId, "view"));
  }
  for (const folderId of input.folderIds ?? []) {
    await requireFolder(actor, folderId, "view");
    const ids = await descendantFolderIds(actor.organizationId, folderId);
    const children = await prisma.document.findMany({ where: { tenantId: actor.organizationId, folderId: { in: ids }, status: "ACTIVE" } });
    for (const document of children) {
      // Folder contents include only what the actor can actually see.
      if (await documentAccess(actor, document, "view")) documents.push(document);
    }
  }
  const seen = new Set<string>();
  return documents.filter((document) => (seen.has(document.id) ? false : (seen.add(document.id), true))).slice(0, BULK_DOWNLOAD_MAX_FILES);
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function downloadDocumentsZip(actor: ActorContext, input: { documentIds?: string[]; folderIds?: string[] }) {
  if (!hasCapability(actor, "view")) throw new AppError(403, "FORBIDDEN", "You cannot download documents.");
  const documents = await collectZipDocuments(actor, input);
  if (documents.length === 0) throw new AppError(400, "NOTHING_TO_DOWNLOAD", "No downloadable documents were found in the selection.");
  // Build relative paths preserving the folder hierarchy below each selected folder.
  const folderPaths = new Map<string, string>();
  const selectedFolderIds = input.folderIds ?? [];
  if (selectedFolderIds.length > 0) {
    const allFolderIds = new Set<string>();
    for (const folderId of selectedFolderIds) for (const id of await descendantFolderIds(actor.organizationId, folderId)) allFolderIds.add(id);
    const folders = await prisma.folder.findMany({ where: { tenantId: actor.organizationId, id: { in: [...allFolderIds] } }, select: { id: true, name: true, parentId: true } });
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    for (const folder of folders) {
      const segments: string[] = [];
      let cursor: typeof folder | undefined = folder;
      while (cursor) {
        segments.unshift(sanitizeZipSegment(cursor.name));
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      folderPaths.set(folder.id, segments.join("/"));
    }
  }
  const used = new Set<string>();
  const entries: { name: string; data: Buffer }[] = [];
  for (const document of documents) {
    if (!document.storageKey || !(await storage.exists(document.storageKey))) continue;
    const prefix = document.folderId ? folderPaths.get(document.folderId) : undefined;
    entries.push({ name: uniqueZipName(`${prefix ? `${prefix}/` : ""}${sanitizeZipSegment(document.originalName || document.name)}`, used), data: await streamToBuffer(await storage.get(document.storageKey)) });
  }
  if (entries.length === 0) throw new AppError(404, "FILE_NOT_FOUND", "The stored files were not found.");
  await prisma.auditLog.create({
    data: { tenantId: actor.organizationId, actorId: actor.membershipId, action: "documents.bulk_downloaded", resourceType: "Document", resourceId: null, contextJson: JSON.stringify({ documents: entries.length }) }
  });
  return { buffer: createZip(entries), name: `nexora-documentos-${new Date().toISOString().slice(0, 10)}.zip` };
}

// --- Major/minor publishing + content approval ---

// Members able to approve publishes: anyone with the documents.share capability.
async function publishApprovers(organizationId: string, excludeMembershipId?: string): Promise<string[]> {
  const members = await prisma.organizationMember.findMany({
    where: {
      tenantId: organizationId,
      status: "ACTIVE",
      membershipRoles: { some: { role: { permissions: { some: { permission: { key: permissions.documentsShare } } } } } }
    },
    select: { id: true }
  });
  return members.map(({ id }) => id).filter((id) => id !== excludeMembershipId);
}

async function latestDraftVersion(documentId: string) {
  return prisma.documentVersion.findFirst({ where: { documentId, versionType: "MINOR" }, orderBy: { version: "desc" } });
}

async function canApproveDocument(actor: ActorContext, document: Document) {
  // Approvers mirror publishApprovers: members with the documents.share
  // capability who can manage access on this document (or super admins).
  return actor.isSuperAdmin || (await documentAccess(actor, document, "share"));
}

async function promoteDraft(actor: ActorContext, document: Document) {
  const draft = await latestDraftVersion(document.id);
  if (!draft) throw new AppError(400, "NOTHING_TO_PUBLISH", "There is no unpublished draft version.");
  await prisma.$transaction(async (transaction) => {
    await transaction.documentVersion.update({ where: { id: draft.id }, data: { versionType: "MAJOR" } });
    // The promoted draft becomes the published file served to readers.
    await transaction.document.update({
      where: { id: document.id },
      data: {
        storageKey: draft.storageKey,
        originalName: draft.originalName,
        extension: path.extname(draft.originalName).toLowerCase().replace(/^\./, "") || document.extension,
        mimeType: draft.mimeType,
        sizeBytes: draft.sizeBytes,
        publishStatus: "PUBLISHED",
        publishRequestedById: null,
        publishRequestedAt: null
      }
    });
    await audit(transaction, actor, "document.published", "Document", document.id, document.tenantId, { version: draft.version });
  }, transactionOptions);
  return draft;
}

export async function publishDocument(actor: ActorContext, documentId: string, note?: string) {
  const document = await requireDocument(actor, documentId, "edit");
  if (!["DRAFT", "REJECTED"].includes(document.publishStatus)) throw new AppError(409, "NOTHING_TO_PUBLISH", "This document has no draft changes to publish.");
  const governance = await effectiveGovernance(document.tenantId, document.folderId);
  const approver = await canApproveDocument(actor, document);
  if (governance.requireApproval && !approver) {
    await prisma.$transaction(async (transaction) => {
      await transaction.document.update({ where: { id: document.id }, data: { publishStatus: "PENDING", publishRequestedById: actor.membershipId, publishRequestedAt: new Date() } });
      await audit(transaction, actor, "document.publish_requested", "Document", document.id, document.tenantId, { note });
    }, transactionOptions);
    for (const recipientId of await publishApprovers(document.tenantId, actor.membershipId)) {
      await notify({
        tenantId: document.tenantId,
        recipientId,
        type: "document.publish_requested",
        title: "Publicação pendente",
        body: `O documento "${document.name}" aguarda aprovação de publicação.`,
        data: { documentId: document.id, requestedBy: actor.membershipId }
      });
    }
    return getDocumentDetail(actor, document.id);
  }
  const draft = await promoteDraft(actor, document);
  await safeDispatch(document.tenantId, "document", document.id, "updated", {
    actorMembershipId: actor.membershipId,
    title: "Documento publicado",
    body: `O documento "${document.name}" foi publicado (v${draft.version}).`,
    data: { documentId: document.id, version: draft.version }
  });
  await safeDispatchWebhooks(document.tenantId, "document.published", { documentId: document.id, name: document.name, version: draft.version, actorMembershipId: actor.membershipId });
  await fireWorkflowEvent(actor, "document.published", { documentId: document.id, folderId: document.folderId, name: document.name, version: draft.version });
  return getDocumentDetail(actor, document.id);
}

export async function decideDocumentPublish(actor: ActorContext, documentId: string, approve: boolean, note?: string) {
  const document = await requireDocument(actor, documentId, "view");
  if (document.publishStatus !== "PENDING") throw new AppError(409, "PUBLISH_NOT_PENDING", "This document is not awaiting publication approval.");
  if (!(await canApproveDocument(actor, document))) throw new AppError(403, "FORBIDDEN", "You cannot approve the publication of this document.");
  if (approve) {
    const draft = await promoteDraft(actor, document);
    if (document.publishRequestedById) {
      await notify({
        tenantId: document.tenantId,
        recipientId: document.publishRequestedById,
        type: "document.publish_decided",
        title: "Publicação aprovada",
        body: `O documento "${document.name}" foi aprovado e publicado.`,
        data: { documentId: document.id, version: draft.version }
      });
    }
    await safeDispatch(document.tenantId, "document", document.id, "updated", {
      actorMembershipId: actor.membershipId,
      title: "Documento publicado",
      body: `O documento "${document.name}" foi publicado (v${draft.version}).`,
      data: { documentId: document.id, version: draft.version }
    });
    await safeDispatchWebhooks(document.tenantId, "document.published", { documentId: document.id, name: document.name, version: draft.version, actorMembershipId: actor.membershipId });
    await fireWorkflowEvent(actor, "document.published", { documentId: document.id, folderId: document.folderId, name: document.name, version: draft.version });
  } else {
    await prisma.$transaction(async (transaction) => {
      await transaction.document.update({ where: { id: document.id }, data: { publishStatus: "REJECTED", publishRequestedAt: null } });
      await audit(transaction, actor, "document.publish_rejected", "Document", document.id, document.tenantId, { note });
    }, transactionOptions);
    if (document.publishRequestedById) {
      await notify({
        tenantId: document.tenantId,
        recipientId: document.publishRequestedById,
        type: "document.publish_decided",
        title: "Publicação recusada",
        body: `A publicação do documento "${document.name}" foi recusada${note ? `: ${note}` : "."}`,
        data: { documentId: document.id, note }
      });
    }
    await safeDispatchWebhooks(document.tenantId, "document.publish_rejected", { documentId: document.id, name: document.name, actorMembershipId: actor.membershipId });
  }
  return getDocumentDetail(actor, document.id);
}

// --- Records management & legal hold ---

export async function setDocumentRecord(actor: ActorContext, documentId: string, isRecord: boolean) {
  const document = await requireDocument(actor, documentId, "share");
  if (!isRecord && document.legalHold) throw new AppError(409, "DOCUMENT_ON_HOLD", "Remove the legal hold before undeclaring the record.");
  await prisma.$transaction(async (transaction) => {
    await transaction.document.update({ where: { id: document.id }, data: { isRecord } });
    await audit(transaction, actor, isRecord ? "document.record_declared" : "document.record_undeclared", "Document", document.id, document.tenantId);
  }, transactionOptions);
  return getDocumentDetail(actor, document.id);
}

export async function setDocumentLegalHold(actor: ActorContext, documentId: string, legalHold: boolean, reason?: string) {
  const document = await requireDocument(actor, documentId, "share");
  await prisma.$transaction(async (transaction) => {
    await transaction.document.update({ where: { id: document.id }, data: { legalHold } });
    await audit(transaction, actor, legalHold ? "document.hold_applied" : "document.hold_removed", "Document", document.id, document.tenantId, { reason });
  }, transactionOptions);
  return getDocumentDetail(actor, document.id);
}

// --- Delta / changes feed (sync foundation) ---
// Cursor is an ISO timestamp; each entry maps a document/folder audit event to
// created/updated/deleted. Purged items cannot be permission-checked and are
// skipped rather than leaked.

const DELTA_ACTION_TYPES: Record<string, "created" | "updated" | "deleted"> = {
  "document.uploaded": "created",
  "folder.created": "created",
  "document.trashed": "deleted",
  "folder.trashed": "deleted",
  "document.restored": "created",
  "folder.restored": "created"
};

export async function listDocumentDelta(actor: ActorContext, input: { cursor?: string; limit?: number }): Promise<DeltaFeedResponse> {
  const limit = Math.min(input.limit ?? 100, 500);
  const since = input.cursor ? new Date(input.cursor) : new Date(0);
  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId: actor.organizationId,
      resourceType: { in: ["Document", "Folder"] },
      resourceId: { not: null },
      occurredAt: { gt: since },
      action: { notIn: ["document.viewed", "document.downloaded", "document.version.downloaded", "documents.bulk_downloaded"] }
    },
    orderBy: { occurredAt: "asc" },
    take: limit
  });

  // Keep only the latest event per resource inside the window.
  const latestByResource = new Map<string, { action: string; at: Date }>();
  for (const log of logs) latestByResource.set(log.resourceId as string, { action: log.action, at: log.occurredAt });

  const docIds = [...latestByResource.keys()];
  const [documents, folders] = await Promise.all([
    prisma.document.findMany({ where: { tenantId: actor.organizationId, id: { in: docIds } }, include: { owner: { select: { id: true, name: true, avatar: true } }, favorites: true, permissions: true, checkedOutBy: { include: { user: { select: { id: true, name: true, avatar: true } } } } } }),
    prisma.folder.findMany({ where: { tenantId: actor.organizationId, id: { in: docIds } }, include: { owner: { select: { id: true, name: true, avatar: true } }, favorites: true, permissions: true } })
  ]);

  const entries: DeltaFeedResponse["entries"] = [];
  for (const document of documents) {
    const event = latestByResource.get(document.id);
    if (!event) continue;
    if (!(await documentAccess(actor, document, "view"))) continue;
    entries.push({
      type: DELTA_ACTION_TYPES[event.action] ?? "updated",
      resourceType: "document",
      resourceId: document.id,
      name: document.name,
      folderId: document.folderId,
      changedAt: event.at.toISOString()
    });
  }
  for (const folder of folders) {
    const event = latestByResource.get(folder.id);
    if (!event) continue;
    if (!(await folderAccess(actor, folder, "view"))) continue;
    entries.push({
      type: DELTA_ACTION_TYPES[event.action] ?? "updated",
      resourceType: "folder",
      resourceId: folder.id,
      name: folder.name,
      folderId: folder.parentId,
      changedAt: event.at.toISOString()
    });
  }
  entries.sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  const last = logs[logs.length - 1];
  return { entries, cursor: (last?.occurredAt ?? since).toISOString() };
}

// --- Nexora Docs & Sheets (in-app editor documents) ---

const EDITOR_MIME: Record<EditorDocumentKind, string> = {
  DOC: "application/vnd.nexora.doc+json",
  SHEET: "application/vnd.nexora.sheet+json"
};
const EDITOR_EXT: Record<EditorDocumentKind, string> = { DOC: "nxdoc", SHEET: "nxsheet" };
const MAX_EDITOR_CONTENT_BYTES = 5 * 1024 * 1024;

function emptyEditorContent(kind: EditorDocumentKind): unknown {
  if (kind === "SHEET") return { version: 2, sheets: [{ name: "Folha1", cells: {}, columnWidths: {}, rowCount: 100, columnCount: 26 }] };
  return { type: "doc", content: [{ type: "paragraph" }] };
}

async function uniqueEditorName(organizationId: string, folderId: string | null, baseName: string, extension: string) {
  const siblings = new Set(
    (await prisma.document.findMany({
      where: { tenantId: organizationId, folderId, status: "ACTIVE", name: { startsWith: baseName } },
      select: { name: true }
    })).map((d) => d.name)
  );
  let candidate = `${baseName}${extension}`;
  let counter = 2;
  while (siblings.has(candidate)) candidate = `${baseName} ${counter++}${extension}`;
  return candidate;
}

function editorKindOf(document: Pick<Document, "documentKind">): EditorDocumentKind {
  if (document.documentKind === "DOC" || document.documentKind === "SHEET") return document.documentKind;
  throw new AppError(400, "NOT_EDITOR_DOCUMENT", "This document is not editable in the Nexora editor.");
}

export async function createEditorDocument(actor: ActorContext, input: CreateEditorDocumentInput) {
  if (!hasCapability(actor, "edit")) throw new AppError(403, "FORBIDDEN", "You cannot create documents.");
  const kind = input.kind;
  const folderId = input.folderId ?? null;
  if (folderId) await requireFolder(actor, folderId, "edit");
  const baseName = input.name.trim().replace(/\.(nxdoc|nxsheet)$/i, "") || "Sem título";
  const extension = `.${EDITOR_EXT[kind]}`;
  const mimeType = EDITOR_MIME[kind];
  const filename = await uniqueEditorName(actor.organizationId, folderId, baseName, extension);
  const { checkLimit, checkStorageLimit } = await import("../billing/plan.service.js");
  await checkLimit(actor.organizationId, "documents");
  const buffer = Buffer.from(JSON.stringify(emptyEditorContent(kind)), "utf8");
  await checkStorageLimit(actor.organizationId, buffer.length);
  const documentId = randomUUID();
  const storageKey = `${actor.organizationId}/${documentId}/${randomUUID()}${extension}`;
  const checksum = createHash("sha256").update(buffer).digest("hex");
  let stored: { size: number } | undefined;
  try {
    stored = await storage.put(storageKey, Readable.from(buffer));
    const document = await prisma.$transaction(async (transaction) => {
      const created = await transaction.document.create({
        data: { id: documentId, tenantId: actor.organizationId, folderId, name: filename, originalName: filename, extension: EDITOR_EXT[kind], documentKind: kind, mimeType, sizeBytes: stored!.size, storageKey, createdById: actor.userId, publishStatus: "PUBLISHED" }
      });
      await transaction.documentVersion.create({ data: { tenantId: actor.organizationId, documentId, version: 1, versionType: "MAJOR", storageKey, originalName: filename, mimeType, sizeBytes: stored!.size, checksum, createdById: actor.userId } });
      await audit(transaction, actor, "document.uploaded", "Document", documentId, actor.organizationId, { version: 1, versionType: "MAJOR", editor: kind });
      return created;
    }, transactionOptions);
    await safeIndexDocumentContent(document.id);
    await safeDispatch(actor.organizationId, "folder", folderId, "created", {
      actorMembershipId: actor.membershipId,
      title: "Novo documento na pasta",
      body: `O documento "${document.name}" foi adicionado a uma pasta que segue.`,
      data: { documentId: document.id, folderId }
    });
    await safeDispatchWebhooks(actor.organizationId, "document.created", { documentId: document.id, folderId, name: document.name, actorMembershipId: actor.membershipId });
    await fireWorkflowEvent(actor, "document.created", { documentId: document.id, folderId, name: document.name });
    return getDocumentDetail(actor, document.id);
  } catch (error) {
    if (stored) await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

async function readEditorBuffer(storageKey: string): Promise<Buffer> {
  const stream: Readable = await storage.get(storageKey);
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of stream) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(value);
    length += value.length;
    if (length > MAX_EDITOR_CONTENT_BYTES) {
      stream.destroy();
      throw new AppError(413, "CONTENT_TOO_LARGE", "The stored document content exceeds the maximum size.");
    }
  }
  return Buffer.concat(chunks);
}

export async function getEditorContent(actor: ActorContext, documentId: string): Promise<EditorContentResponse> {
  const document = await requireDocument(actor, documentId, "view");
  const kind = editorKindOf(document);
  if (!document.storageKey) throw new AppError(404, "CONTENT_NOT_FOUND", "The document has no stored content.");
  const buffer = await readEditorBuffer(document.storageKey);
  let content: unknown;
  try {
    content = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new AppError(422, "CONTENT_CORRUPTED", "The stored document content is not valid.");
  }
  return { kind, content, updatedAt: document.updatedAt.toISOString() };
}

export async function saveEditorContent(actor: ActorContext, documentId: string, input: SaveEditorContentInput): Promise<EditorContentResponse> {
  const document = await requireDocument(actor, documentId, "edit");
  assertNotCheckedOutByOther(actor, document);
  assertNotRecord(document);
  const kind = editorKindOf(document);
  if (!document.storageKey) throw new AppError(404, "CONTENT_NOT_FOUND", "The document has no stored content.");
  const buffer = Buffer.from(JSON.stringify(input.content ?? emptyEditorContent(kind)), "utf8");
  if (buffer.length > MAX_EDITOR_CONTENT_BYTES) throw new AppError(413, "CONTENT_TOO_LARGE", "The document content exceeds the maximum size.");
  await storage.put(document.storageKey, Readable.from(buffer));
  await prisma.$transaction(async (transaction) => {
    await transaction.document.update({ where: { id: document.id }, data: { sizeBytes: buffer.length } });
    await audit(transaction, actor, "document.edited", "Document", document.id, document.tenantId, { editor: kind });
  }, transactionOptions);
  await safeIndexDocumentContent(document.id);
  const updated = await prisma.document.findUniqueOrThrow({ where: { id: document.id }, select: { updatedAt: true } });
  return { kind, content: input.content, updatedAt: updated.updatedAt.toISOString() };
}
