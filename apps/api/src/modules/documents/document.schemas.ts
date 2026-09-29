import { z } from "zod";

const nullableId = z.string().min(1).nullable().optional();

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: nullableId
});

export const updateItemSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  folderId: nullableId,
  parentId: nullableId
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const copyItemSchema = z.object({
  folderId: nullableId,
  parentId: nullableId
});

export const permissionSchema = z.object({
  membershipId: z.string().min(1),
  view: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
  share: z.boolean()
});

export const documentShareSchema = z.object({
  targetType: z.enum(["USER", "TEAM", "ORGANIZATION"]),
  targetId: z.string().min(1),
  permission: z.enum(["READ", "EDIT"])
});

export const shareLinkSchema = z.object({
  expiresInHours: z.number().int().min(1).max(720),
  password: z.string().min(8).max(128).optional(),
  permission: z.enum(["READ", "EDIT"])
});

export const folderShareLinkSchema = z.object({
  expiresInHours: z.number().int().min(1).max(720),
  password: z.string().min(8).max(128).optional(),
  permission: z.enum(["READ", "UPLOAD"])
});

export const bulkDownloadSchema = z.object({
  documentIds: z.array(z.string().min(1)).max(200).default([]),
  folderIds: z.array(z.string().min(1)).max(50).default([])
}).refine((value) => value.documentIds.length + value.folderIds.length > 0, "At least one item is required");

export const publishDocumentSchema = z.object({
  note: z.string().trim().max(500).optional()
}).optional();

export const decidePublishSchema = z.object({
  note: z.string().trim().max(500).optional()
}).optional();

export const listDocumentsSchema = z.object({
  folderId: z.string().min(1).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(["name", "updatedAt", "size", "type", "owner"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  filter: z.enum(["all", "documents", "folders", "favorites"]).default("all"),
  type: z.string().trim().max(100).optional(),
  meta: z.string().trim().max(200).optional(), // "slug:value" metadata refiner
  sensitivity: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).optional(),
  publishStatus: z.enum(["PUBLISHED", "DRAFT", "PENDING", "REJECTED"]).optional()
});

export const documentDeltaSchema = z.object({
  cursor: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional()
});

export const setRecordSchema = z.object({
  isRecord: z.boolean()
});

export const setLegalHoldSchema = z.object({
  legalHold: z.boolean(),
  reason: z.string().trim().max(500).optional()
});

export const createDocumentCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000)
});

const metadataFieldOption = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120)
});

export const metadataFieldInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes."),
  type: z.enum(["text", "longtext", "number", "currency", "date", "datetime", "boolean", "choice", "email", "url", "user"]),
  required: z.boolean().default(false),
  options: z.array(metadataFieldOption).max(200).nullable().optional(),
  order: z.number().int().min(0).default(0)
}).superRefine((value, ctx) => {
  if (value.type === "choice" && (!value.options || value.options.length === 0)) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "Choice fields require at least one option." });
  }
  if (value.type !== "choice") {
    value.options = null;
  }
});

export const setFolderMetadataFieldsSchema = z.object({
  fields: z.array(metadataFieldInputSchema).max(100).default([])
}).superRefine((value, ctx) => {
  const slugs = new Set<string>();
  for (const field of value.fields) {
    if (slugs.has(field.slug)) {
      ctx.addIssue({ code: "custom", path: ["fields"], message: `Duplicate field slug: ${field.slug}` });
    }
    slugs.add(field.slug);
  }
});

export const updateDocumentMetadataSchema = z.object({
  values: z.record(z.string(), z.unknown())
});

export const setTemplateSchema = z.object({
  isTemplate: z.boolean()
});

export const instantiateSchema = z.object({
  folderId: nullableId,
  parentId: nullableId,
  name: z.string().trim().min(1).max(255).optional()
});

export const setPinnedSchema = z.object({
  pinned: z.boolean()
});

export const setInheritanceSchema = z.object({
  inherit: z.boolean()
});

export const requestAccessSchema = z.object({
  resourceType: z.enum(["document", "folder"]),
  resourceId: z.string().min(1),
  message: z.string().trim().max(1000).optional()
});

export const decideAccessSchema = z.object({
  approve: z.boolean(),
  access: z.enum(["view", "edit"]).optional()
});

export const listAccessRequestsSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
});

export const updateGovernanceSchema = z.object({
  retentionMode: z.enum(["NONE", "RETAIN", "BLOCK_DELETE"]).optional(),
  retentionDays: z.number().int().min(1).max(36500).nullable().optional(),
  sensitivity: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).optional(),
  requireApproval: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const createEditorDocumentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  kind: z.enum(["DOC", "SHEET"]),
  folderId: nullableId
});

export const saveEditorContentSchema = z.object({
  content: z.unknown(),
  plainText: z.string().max(200_000).optional()
});
