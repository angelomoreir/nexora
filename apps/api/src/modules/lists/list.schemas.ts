import { z } from "zod";

const fieldType = z.enum([
  "text",
  "longtext",
  "number",
  "currency",
  "date",
  "datetime",
  "boolean",
  "choice",
  "email",
  "url",
  "user",
  "relation",
  "file"
]);

const fieldOption = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120)
});

export const listFieldSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes."),
  type: fieldType,
  required: z.boolean().default(false),
  options: z.array(fieldOption).max(200).nullable().optional(),
  relationListId: z.string().min(1).nullable().optional(),
  order: z.number().int().min(0).default(0)
}).superRefine((value, ctx) => {
  if (value.type === "choice" && (!value.options || value.options.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Choice fields require at least one option." });
  }
  if (value.type === "relation" && !value.relationListId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["relationListId"], message: "Relation fields require a target list." });
  }
  if (value.type !== "choice") {
    value.options = null;
  }
  if (value.type !== "relation") {
    value.relationListId = null;
  }
});

export const createListSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(480).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  fields: z.array(listFieldSchema).max(100).default([])
}).superRefine((value, ctx) => {
  const slugs = new Set<string>();
  for (const field of value.fields) {
    if (slugs.has(field.slug)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields"], message: `Duplicate field slug: ${field.slug}` });
    }
    slugs.add(field.slug);
  }
});

export const updateListSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(480).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  fields: z.array(listFieldSchema).max(100).optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const listListsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  sort: z.enum(["name", "updatedAt", "createdAt"]).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc")
});

export const listItemsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(80).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25)
});

export const createItemSchema = z.object({
  values: z.record(z.string(), z.unknown())
});

export const updateItemSchema = z.object({
  values: z.record(z.string(), z.unknown())
});

export const duplicateListSchema = z.object({
  name: z.string().trim().min(1).max(120).optional()
});
