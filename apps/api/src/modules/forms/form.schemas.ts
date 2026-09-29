import { z } from "zod";

const fieldType = z.enum([
  "text",
  "longtext",
  "number",
  "currency",
  "email",
  "phone",
  "date",
  "select",
  "radio",
  "checkbox",
  "upload",
  "heading",
  "separator"
]);

const fieldOption = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120)
});

export const formFieldSchema = z.object({
  id: z.string().min(1),
  type: fieldType,
  label: z.string().trim().min(1).max(200),
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(200).optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(fieldOption).max(200).nullable().optional(),
  order: z.number().int().min(0).default(0)
}).superRefine((value, ctx) => {
  const needsOptions = value.type === "select" || value.type === "radio" || value.type === "checkbox";
  if (needsOptions && (!value.options || value.options.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "This field type requires at least one option." });
  }
  if (!needsOptions) {
    value.options = null;
  }
  const isLayout = value.type === "heading" || value.type === "separator";
  if (isLayout) {
    value.required = false;
    value.placeholder = undefined;
    value.defaultValue = undefined;
  }
});

export const createFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(480).nullable().optional(),
  fields: z.array(formFieldSchema).max(200).default([])
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  for (const field of value.fields) {
    if (ids.has(field.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields"], message: `Duplicate field id: ${field.id}` });
    }
    ids.add(field.id);
  }
});

export const updateFormSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(480).nullable().optional(),
  fields: z.array(formFieldSchema).max(200).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const listFormsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  sort: z.enum(["name", "updatedAt", "createdAt"]).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc")
});

export const listSubmissionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25)
});

export const submitFormSchema = z.object({
  values: z.record(z.string(), z.unknown())
});
