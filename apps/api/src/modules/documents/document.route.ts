import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { Readable } from "node:stream";
import { AppError } from "../../lib/errors.js";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { bulkDownloadSchema, copyItemSchema, createDocumentCommentSchema, createEditorDocumentSchema, createFolderSchema, decideAccessSchema, decidePublishSchema, documentDeltaSchema, documentShareSchema, folderShareLinkSchema, instantiateSchema, listAccessRequestsSchema, listDocumentsSchema, permissionSchema, publishDocumentSchema, requestAccessSchema, saveEditorContentSchema, setFolderMetadataFieldsSchema, setInheritanceSchema, setLegalHoldSchema, setPinnedSchema, setRecordSchema, setTemplateSchema, shareLinkSchema, updateDocumentMetadataSchema, updateGovernanceSchema, updateItemSchema } from "./document.schemas.js";
import {
  autofillDocumentMetadata,
  browsePublicFolderShare,
  checkInDocument,
  checkOutDocument,
  copyDocument,
  copyFolder,
  createDocumentComment,
  createDocumentShareLink,
  createEditorDocument,
  createFolder,
  createFolderShareLink,
  decideAccessRequest,
  decideDocumentPublish,
  deleteDocument,
  deleteDocumentComment,
  deleteFolder,
  downloadDocument,
  downloadDocumentsZip,
  downloadDocumentVersion,
  downloadPublicDocumentShare,
  downloadPublicShareFile,
  emptyTrash,
  getAccessPanel,
  getActor,
  getDocumentActivity,
  getDocumentDetail,
  getDocumentShareTargets,
  getEditorContent,
  getFolderMetadataFields,
  getPublicDocumentShare,
  instantiateDocument,
  instantiateFolder,
  listAccessRequests,
  listDocumentComments,
  listDocumentDelta,
  listDocumentShareLinks,
  listDocuments,
  listFavorites,
  listFolderShareLinks,
  listRecentDocuments,
  listSharedDocuments,
  listTemplates,
  listTrash,
  publishDocument,
  purgeTrashItem,
  requestAccess,
  restoreDocumentVersion,
  restoreTrashItem,
  revokeDocumentShareLink,
  saveEditorContent,
  revokeFolderShareLink,
  setDocumentLegalHold,
  setDocumentRecord,
  setDocumentTemplate,
  setFavorite,
  setFolderMetadataFields,
  setFolderTemplate,
  setInheritance,
  setPermission,
  setPinned,
  shareDocument,
  trackDocumentView,
  updateDocument,
  updateDocumentMetadata,
  updateFolder,
  updateFolderGovernance,
  uploadDocument,
  uploadDocumentVersion,
  uploadPublicDocumentVersion,
  uploadPublicFolderFile,
  requireDocument
} from "./document.service.js";
import { openRealtimeStream } from "../collaboration/realtime.service.js";

const documentView = [authenticate, requirePermission(permissions.documentsView)];
const documentEdit = [authenticate, requirePermission(permissions.documentsEdit)];
const documentDelete = [authenticate, requirePermission(permissions.documentsDelete)];
const documentShare = [authenticate, requirePermission(permissions.documentsShare)];

function params(request: { params: unknown }) {
  return request.params as { organizationId: string; documentId?: string; folderId?: string; versionId?: string; linkId?: string; token?: string; kind?: string; id?: string; commentId?: string; requestId?: string };
}

function fieldValue(data: { fields: Record<string, unknown> }, name: string): string | undefined {
  const entry = data.fields[name];
  const first = Array.isArray(entry) ? entry[0] : entry;
  return first && typeof first === "object" && "value" in first && typeof first.value === "string" ? first.value : undefined;
}

async function actorFor(request: FastifyRequest) {
  const { organizationId } = params(request);
  return getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

function resourceKind(value?: string): "document" | "folder" {
  if (value !== "document" && value !== "folder") throw new AppError(400, "INVALID_RESOURCE_TYPE", "The resource type is invalid.");
  return value;
}

function sendFile(reply: FastifyReply, file: { stream: Readable; name: string; mimeType: string; size?: number }) {
  const fallback = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/[\r\n"]/g, "_");
  reply.header("Content-Type", file.mimeType);
  if (file.size !== undefined) reply.header("Content-Length", file.size);
  reply.header("Content-Disposition", `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  reply.header("X-Content-Type-Options", "nosniff");
  return reply.send(file.stream);
}

export const documentRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/documents", { preHandler: documentView }, async (request) => {
    const query = listDocumentsSchema.parse(request.query);
    return listDocuments(await actorFor(request), query);
  });

  app.get("/organizations/:organizationId/documents/shared", { preHandler: documentView }, async (request) => {
    return listSharedDocuments(await actorFor(request));
  });

  app.get("/organizations/:organizationId/documents/delta", { preHandler: documentView }, async (request) => {
    return listDocumentDelta(await actorFor(request), documentDeltaSchema.parse(request.query));
  });

  app.post("/organizations/:organizationId/documents/bulk-download", { preHandler: documentView }, async (request, reply) => {
    const input = bulkDownloadSchema.parse(request.body);
    const archive = await downloadDocumentsZip(await actorFor(request), input);
    const fallback = archive.name.replace(/[^a-zA-Z0-9._ -]/g, "_");
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Length", archive.buffer.length);
    reply.header("Content-Disposition", `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(archive.name)}`);
    return reply.send(archive.buffer);
  });

  app.get("/organizations/:organizationId/documents/:documentId", { preHandler: documentView }, async (request) => {
    const actor = await actorFor(request);
    void trackDocumentView(actor, params(request).documentId!).catch(() => undefined);
    return getDocumentDetail(actor, params(request).documentId!);
  });

  app.get(
    "/organizations/:organizationId/documents/:documentId/events",
    { preHandler: documentView, config: { rateLimit: false } },
    async (request, reply) => {
      const actor = await actorFor(request);
      await requireDocument(actor, params(request).documentId!, "view");
      await openRealtimeStream(request, reply, {
        tenantId: actor.organizationId,
        membershipId: actor.membershipId,
        userId: actor.userId,
        resource: { type: "document", id: params(request).documentId! }
      });
    }
  );

  app.get("/organizations/:organizationId/documents/:documentId/activity", { preHandler: documentView }, async (request) => {
    return getDocumentActivity(await actorFor(request), params(request).documentId!);
  });

  app.get("/organizations/:organizationId/documents/:documentId/download", { preHandler: documentView }, async (request, reply) => {
    return sendFile(reply, await downloadDocument(await actorFor(request), params(request).documentId!));
  });

  app.post("/organizations/:organizationId/folders", { preHandler: documentEdit }, async (request, reply) => {
    const input = createFolderSchema.parse(request.body);
    const folder = await createFolder(await actorFor(request), input.name, input.parentId ?? null);
    return reply.status(201).send(folder);
  });

  // Nexora Docs & Sheets — create an in-app editable document (doc or sheet)
  app.post("/organizations/:organizationId/editor-documents", { preHandler: documentEdit }, async (request, reply) => {
    const input = createEditorDocumentSchema.parse(request.body);
    const document = await createEditorDocument(await actorFor(request), input);
    return reply.status(201).send(document);
  });

  // Nexora Docs & Sheets — read editor JSON content (view permission)
  app.get("/organizations/:organizationId/documents/:documentId/editor-content", { preHandler: documentView }, async (request) => {
    return getEditorContent(await actorFor(request), params(request).documentId!);
  });

  // Nexora Docs & Sheets — save editor JSON content (edit permission)
  app.put("/organizations/:organizationId/documents/:documentId/editor-content", { preHandler: documentEdit }, async (request) => {
    const input = saveEditorContentSchema.parse(request.body);
    return saveEditorContent(await actorFor(request), params(request).documentId!, input);
  });

  app.post("/organizations/:organizationId/documents", { preHandler: documentEdit }, async (request, reply) => {
    const { folderId } = request.query as { folderId?: string };
    const data = await request.file({ limits: { files: 1 } });
    if (!data) throw new AppError(400, "FILE_REQUIRED", "A file is required.");
    const filename = data.filename.split(/[\\/]/).pop()?.trim();
    if (!filename) throw new AppError(400, "INVALID_FILE_NAME", "The file name is invalid.");
    const pathField = data.fields["path"];
    const pathEntry = Array.isArray(pathField) ? pathField[0] : pathField;
    const uploadPath = pathEntry && "value" in pathEntry && typeof pathEntry.value === "string" ? pathEntry.value : undefined;
    const document = await uploadDocument(await actorFor(request), data.file, filename, data.mimetype, folderId ?? null, { path: uploadPath });
    if (data.file.truncated) throw new AppError(413, "FILE_TOO_LARGE", "The file exceeds the maximum allowed size.");
    return reply.status(201).send(document);
  });

  app.post("/organizations/:organizationId/documents/:documentId/versions", { preHandler: documentEdit }, async (request, reply) => {
    const data = await request.file({ limits: { files: 1 } });
    if (!data) throw new AppError(400, "FILE_REQUIRED", "A file is required.");
    const filename = data.filename.split(/[\\/]/).pop()?.trim();
    if (!filename) throw new AppError(400, "INVALID_FILE_NAME", "The file name is invalid.");
    const versionType = fieldValue(data, "versionType");
    if (versionType && versionType !== "major" && versionType !== "minor") throw new AppError(400, "VALIDATION_ERROR", "The version type is invalid.");
    return reply.status(201).send(await uploadDocumentVersion(await actorFor(request), params(request).documentId!, data.file, filename, data.mimetype, { versionType: versionType as "major" | "minor" | undefined }));
  });

  app.get("/organizations/:organizationId/documents/:documentId/versions/:versionId/download", { preHandler: documentView }, async (request, reply) => {
    return sendFile(reply, await downloadDocumentVersion(await actorFor(request), params(request).documentId!, params(request).versionId!));
  });

  app.post("/organizations/:organizationId/documents/:documentId/versions/:versionId/restore", { preHandler: documentEdit }, async (request) => {
    return restoreDocumentVersion(await actorFor(request), params(request).documentId!, params(request).versionId!);
  });

  app.get("/organizations/:organizationId/documents/:documentId/share-targets", { preHandler: documentShare }, async (request) => {
    return getDocumentShareTargets(await actorFor(request), params(request).documentId!);
  });

  app.post("/organizations/:organizationId/documents/:documentId/shares", { preHandler: documentShare }, async (request, reply) => {
    const input = documentShareSchema.parse(request.body);
    await shareDocument(await actorFor(request), params(request).documentId!, input.targetType, input.targetId, input.permission);
    return reply.status(204).send();
  });

  app.get("/organizations/:organizationId/documents/:documentId/share-links", { preHandler: documentShare }, async (request) => {
    return listDocumentShareLinks(await actorFor(request), params(request).documentId!);
  });

  app.post("/organizations/:organizationId/documents/:documentId/share-links", { preHandler: documentShare }, async (request, reply) => {
    return reply.status(201).send(await createDocumentShareLink(await actorFor(request), params(request).documentId!, shareLinkSchema.parse(request.body)));
  });

  app.delete("/organizations/:organizationId/documents/:documentId/share-links/:linkId", { preHandler: documentShare }, async (request, reply) => {
    await revokeDocumentShareLink(await actorFor(request), params(request).documentId!, params(request).linkId!);
    return reply.status(204).send();
  });

  app.get("/organizations/:organizationId/folders/:folderId/share-links", { preHandler: documentShare }, async (request) => {
    return listFolderShareLinks(await actorFor(request), params(request).folderId!);
  });

  app.post("/organizations/:organizationId/folders/:folderId/share-links", { preHandler: documentShare }, async (request, reply) => {
    return reply.status(201).send(await createFolderShareLink(await actorFor(request), params(request).folderId!, folderShareLinkSchema.parse(request.body)));
  });

  app.delete("/organizations/:organizationId/folders/:folderId/share-links/:linkId", { preHandler: documentShare }, async (request, reply) => {
    await revokeFolderShareLink(await actorFor(request), params(request).folderId!, params(request).linkId!);
    return reply.status(204).send();
  });

  app.post("/organizations/:organizationId/documents/:documentId/publish", { preHandler: documentEdit }, async (request) => {
    const input = publishDocumentSchema.parse(request.body ?? undefined);
    return publishDocument(await actorFor(request), params(request).documentId!, input?.note);
  });

  app.post("/organizations/:organizationId/documents/:documentId/approve", { preHandler: documentView }, async (request) => {
    const input = decidePublishSchema.parse(request.body ?? undefined);
    return decideDocumentPublish(await actorFor(request), params(request).documentId!, true, input?.note);
  });

  app.post("/organizations/:organizationId/documents/:documentId/reject", { preHandler: documentView }, async (request) => {
    const input = decidePublishSchema.parse(request.body ?? undefined);
    return decideDocumentPublish(await actorFor(request), params(request).documentId!, false, input?.note);
  });

  app.post("/organizations/:organizationId/documents/:documentId/record", { preHandler: documentShare }, async (request) => {
    return setDocumentRecord(await actorFor(request), params(request).documentId!, setRecordSchema.parse(request.body).isRecord);
  });

  app.post("/organizations/:organizationId/documents/:documentId/legal-hold", { preHandler: documentShare }, async (request) => {
    const input = setLegalHoldSchema.parse(request.body);
    return setDocumentLegalHold(await actorFor(request), params(request).documentId!, input.legalHold, input.reason);
  });

  app.patch("/organizations/:organizationId/documents/:documentId", { preHandler: documentEdit }, async (request) => {
    const input = updateItemSchema.parse(request.body);
    return updateDocument(await actorFor(request), params(request).documentId!, { name: input.name, folderId: input.folderId });
  });

  app.patch("/organizations/:organizationId/folders/:folderId", { preHandler: documentEdit }, async (request) => {
    const input = updateItemSchema.parse(request.body);
    return updateFolder(await actorFor(request), params(request).folderId!, { name: input.name, parentId: input.parentId });
  });

  app.post("/organizations/:organizationId/documents/:documentId/copy", { preHandler: documentEdit }, async (request, reply) => {
    const input = copyItemSchema.parse(request.body);
    const document = await copyDocument(await actorFor(request), params(request).documentId!, input.folderId ?? null);
    return reply.status(201).send(document);
  });

  app.post("/organizations/:organizationId/folders/:folderId/copy", { preHandler: documentEdit }, async (request, reply) => {
    const input = copyItemSchema.parse(request.body);
    const folder = await copyFolder(await actorFor(request), params(request).folderId!, input.parentId ?? null);
    return reply.status(201).send(folder);
  });

  app.delete("/organizations/:organizationId/documents/:documentId", { preHandler: documentDelete }, async (request, reply) => {
    await deleteDocument(await actorFor(request), params(request).documentId!);
    return reply.status(204).send();
  });

  app.delete("/organizations/:organizationId/folders/:folderId", { preHandler: documentDelete }, async (request, reply) => {
    await deleteFolder(await actorFor(request), params(request).folderId!);
    return reply.status(204).send();
  });

  app.get("/organizations/:organizationId/trash", { preHandler: documentView }, async (request) => {
    return listTrash(await actorFor(request));
  });

  app.post("/organizations/:organizationId/trash/:kind/:id/restore", { preHandler: documentDelete }, async (request, reply) => {
    await restoreTrashItem(await actorFor(request), resourceKind(params(request).kind), params(request).id!);
    return reply.status(204).send();
  });

  app.delete("/organizations/:organizationId/trash/:kind/:id", { preHandler: documentDelete }, async (request, reply) => {
    await purgeTrashItem(await actorFor(request), resourceKind(params(request).kind), params(request).id!);
    return reply.status(204).send();
  });

  app.delete("/organizations/:organizationId/trash", { preHandler: documentDelete }, async (request, reply) => {
    await emptyTrash(await actorFor(request));
    return reply.status(204).send();
  });

  app.get("/organizations/:organizationId/documents/:documentId/comments", { preHandler: documentView }, async (request) => {
    return listDocumentComments(await actorFor(request), params(request).documentId!);
  });

  app.post("/organizations/:organizationId/documents/:documentId/comments", { preHandler: documentView }, async (request, reply) => {
    const comment = await createDocumentComment(await actorFor(request), params(request).documentId!, createDocumentCommentSchema.parse(request.body).body);
    return reply.status(201).send(comment);
  });

  app.delete("/organizations/:organizationId/documents/:documentId/comments/:commentId", { preHandler: documentView }, async (request, reply) => {
    await deleteDocumentComment(await actorFor(request), params(request).documentId!, params(request).commentId!);
    return reply.status(204).send();
  });

  app.post("/organizations/:organizationId/documents/:documentId/checkout", { preHandler: documentEdit }, async (request) => {
    return checkOutDocument(await actorFor(request), params(request).documentId!);
  });

  app.post("/organizations/:organizationId/documents/:documentId/checkin", { preHandler: documentEdit }, async (request) => {
    return checkInDocument(await actorFor(request), params(request).documentId!);
  });

  app.get("/organizations/:organizationId/folders/:folderId/metadata-fields", { preHandler: documentView }, async (request) => {
    return getFolderMetadataFields(await actorFor(request), params(request).folderId!);
  });

  app.put("/organizations/:organizationId/folders/:folderId/metadata-fields", { preHandler: documentEdit }, async (request) => {
    const input = setFolderMetadataFieldsSchema.parse(request.body);
    return setFolderMetadataFields(await actorFor(request), params(request).folderId!, input.fields.map((field) => ({ ...field, options: field.options ?? null })));
  });

  app.patch("/organizations/:organizationId/documents/:documentId/metadata", { preHandler: documentEdit }, async (request) => {
    const input = updateDocumentMetadataSchema.parse(request.body);
    return updateDocumentMetadata(await actorFor(request), params(request).documentId!, input.values);
  });

  app.get("/organizations/:organizationId/documents/templates", { preHandler: documentView }, async (request) => {
    return listTemplates(await actorFor(request));
  });

  app.get("/organizations/:organizationId/documents/recent", { preHandler: documentView }, async (request) => {
    return listRecentDocuments(await actorFor(request));
  });

  app.get("/organizations/:organizationId/documents/favorites", { preHandler: documentView }, async (request) => {
    return listFavorites(await actorFor(request));
  });

  app.post("/organizations/:organizationId/documents/:documentId/pin", { preHandler: documentEdit }, async (request) => {
    return setPinned(await actorFor(request), "document", params(request).documentId!, setPinnedSchema.parse(request.body).pinned);
  });

  app.post("/organizations/:organizationId/folders/:folderId/pin", { preHandler: documentEdit }, async (request) => {
    return setPinned(await actorFor(request), "folder", params(request).folderId!, setPinnedSchema.parse(request.body).pinned);
  });

  app.patch("/organizations/:organizationId/folders/:folderId/governance", { preHandler: documentEdit }, async (request) => {
    return updateFolderGovernance(await actorFor(request), params(request).folderId!, updateGovernanceSchema.parse(request.body));
  });

  app.post("/organizations/:organizationId/documents/:documentId/autofill-metadata", { preHandler: documentEdit }, async (request) => {
    return autofillDocumentMetadata(await actorFor(request), params(request).documentId!);
  });

  app.get("/organizations/:organizationId/documents/access/:kind/:id", { preHandler: documentShare }, async (request) => {
    return getAccessPanel(await actorFor(request), resourceKind(params(request).kind), params(request).id!);
  });

  app.post("/organizations/:organizationId/documents/access/:kind/:id/inherit", { preHandler: documentShare }, async (request) => {
    const input = setInheritanceSchema.parse(request.body);
    return setInheritance(await actorFor(request), resourceKind(params(request).kind), params(request).id!, input.inherit);
  });

  app.post("/organizations/:organizationId/access-requests", { preHandler: authenticate }, async (request, reply) => {
    const request_ = await requestAccess(await actorFor(request), requestAccessSchema.parse(request.body));
    return reply.status(201).send(request_);
  });

  app.get("/organizations/:organizationId/access-requests", { preHandler: authenticate }, async (request) => {
    return listAccessRequests(await actorFor(request), listAccessRequestsSchema.parse(request.query));
  });

  app.post("/organizations/:organizationId/access-requests/:requestId/decide", { preHandler: documentShare }, async (request) => {
    return decideAccessRequest(await actorFor(request), params(request).requestId!, decideAccessSchema.parse(request.body));
  });

  app.post("/organizations/:organizationId/documents/:documentId/template", { preHandler: documentEdit }, async (request) => {
    const input = setTemplateSchema.parse(request.body);
    return setDocumentTemplate(await actorFor(request), params(request).documentId!, input.isTemplate);
  });

  app.post("/organizations/:organizationId/folders/:folderId/template", { preHandler: documentEdit }, async (request) => {
    const input = setTemplateSchema.parse(request.body);
    return setFolderTemplate(await actorFor(request), params(request).folderId!, input.isTemplate);
  });

  app.post("/organizations/:organizationId/documents/templates/:documentId/instantiate", { preHandler: documentEdit }, async (request, reply) => {
    const input = instantiateSchema.parse(request.body ?? {});
    const document = await instantiateDocument(await actorFor(request), params(request).documentId!, { folderId: input.folderId, name: input.name });
    return reply.status(201).send(document);
  });

  app.post("/organizations/:organizationId/folders/templates/:folderId/instantiate", { preHandler: documentEdit }, async (request, reply) => {
    const input = instantiateSchema.parse(request.body ?? {});
    const folder = await instantiateFolder(await actorFor(request), params(request).folderId!, { parentId: input.parentId, name: input.name });
    return reply.status(201).send(folder);
  });

  app.put("/organizations/:organizationId/:kind/:id/favorite", { preHandler: documentView }, async (request, reply) => {
    const kind = resourceKind(params(request).kind);
    const favorite = (request.body as { favorite?: unknown })?.favorite;
    if (typeof favorite !== "boolean") throw new AppError(400, "VALIDATION_ERROR", "The favorite value must be boolean.");
    await setFavorite(await actorFor(request), kind, params(request).id!, favorite);
    return reply.status(204).send();
  });

  app.put("/organizations/:organizationId/:kind/:id/permissions", { preHandler: documentShare }, async (request, reply) => {
    await setPermission(await actorFor(request), resourceKind(params(request).kind), params(request).id!, permissionSchema.parse(request.body));
    return reply.status(204).send();
  });

  // Share-link endpoints are unauthenticated and may verify a password — keep a
  // tighter per-IP limit than the global one to slow brute-force attempts.
  const shareRateLimit = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

  app.get("/shares/:token", shareRateLimit, async (request) => {
    return getPublicDocumentShare(params(request).token!, request.headers["x-share-password"] as string | undefined);
  });

  app.get("/shares/:token/download", shareRateLimit, async (request, reply) => {
    return sendFile(reply, await downloadPublicDocumentShare(params(request).token!, request.headers["x-share-password"] as string | undefined));
  });

  app.get("/shares/:token/browse", shareRateLimit, async (request) => {
    return browsePublicFolderShare(params(request).token!, undefined, request.headers["x-share-password"] as string | undefined);
  });

  app.get("/shares/:token/browse/:folderId", shareRateLimit, async (request) => {
    return browsePublicFolderShare(params(request).token!, params(request).folderId, request.headers["x-share-password"] as string | undefined);
  });

  app.get("/shares/:token/files/:documentId/download", shareRateLimit, async (request, reply) => {
    return sendFile(reply, await downloadPublicShareFile(params(request).token!, params(request).documentId!, request.headers["x-share-password"] as string | undefined));
  });

  app.post("/shares/:token/uploads", shareRateLimit, async (request, reply) => {
    const data = await request.file({ limits: { files: 1 } });
    if (!data) throw new AppError(400, "FILE_REQUIRED", "A file is required.");
    const filename = data.filename.split(/[\\/]/).pop()?.trim();
    if (!filename) throw new AppError(400, "INVALID_FILE_NAME", "The file name is invalid.");
    return reply.status(201).send(await uploadPublicFolderFile(params(request).token!, request.headers["x-share-password"] as string | undefined, data.file, filename, data.mimetype));
  });

  app.post("/shares/:token/versions", shareRateLimit, async (request, reply) => {
    const data = await request.file({ limits: { files: 1 } });
    if (!data) throw new AppError(400, "FILE_REQUIRED", "A file is required.");
    const filename = data.filename.split(/[\\/]/).pop()?.trim();
    if (!filename) throw new AppError(400, "INVALID_FILE_NAME", "The file name is invalid.");
    return reply.status(201).send(await uploadPublicDocumentVersion(params(request).token!, request.headers["x-share-password"] as string | undefined, data.file, filename, data.mimetype));
  });
};
