import type {
  FormDefinitionDto,
  FormFieldDefinition,
  FormStatus,
  FormSubmissionDto,
  FormSubmissionsResponse,
  FormSummaryDto,
  FormsResponse
} from "@nexora/contracts";
import type { FormDefinition, FormSubmission } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { fireWorkflowEvent } from "../workflows/automation.service.js";

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

function parseFields(schemaJson: string): FormFieldDefinition[] {
  try {
    const parsed = JSON.parse(schemaJson) as FormFieldDefinition[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toSummaryDto(form: FormDefinition & { _count?: { submissions: number } }): FormSummaryDto {
  const fields = parseFields(form.schemaJson);
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    status: form.status as FormStatus,
    fieldCount: fields.length,
    submissionCount: form._count?.submissions ?? 0,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString()
  };
}

function toDefinitionDto(form: FormDefinition & { _count?: { submissions: number } }): FormDefinitionDto {
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    status: form.status as FormStatus,
    fields: parseFields(form.schemaJson),
    submissionCount: form._count?.submissions ?? 0,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString()
  };
}

function toSubmissionDto(sub: FormSubmission & { submitter: { id: string; name: string; avatar: string | null } | null }): FormSubmissionDto {
  let values: Record<string, unknown> = {};
  try {
    values = JSON.parse(sub.valuesJson) as Record<string, unknown>;
  } catch {
    values = {};
  }
  return {
    id: sub.id,
    values,
    submitter: sub.submitter ? { id: sub.submitter.id, name: sub.submitter.name, avatar: sub.submitter.avatar } : null,
    submittedAt: sub.submittedAt.toISOString()
  };
}

export interface ListFormsInput {
  search?: string;
  status?: FormStatus;
  sort: "name" | "updatedAt" | "createdAt";
  order: "asc" | "desc";
}

export async function listForms(actor: ActorContext, input: ListFormsInput): Promise<FormsResponse> {
  const where = {
    tenantId: actor.organizationId,
    name: input.search ? { contains: input.search, mode: "insensitive" as const } : undefined,
    status: input.status
  };
  const orderBy: Record<string, "asc" | "desc"> = { [input.sort]: input.order };
  const [forms, total] = await Promise.all([
    prisma.formDefinition.findMany({ where, orderBy, include: { _count: { select: { submissions: true } } } }),
    prisma.formDefinition.count({ where })
  ]);
  return { forms: forms.map(toSummaryDto), total };
}

export async function getForm(actor: ActorContext, formId: string): Promise<FormDefinitionDto> {
  const form = await prisma.formDefinition.findFirst({
    where: { id: formId, tenantId: actor.organizationId },
    include: { _count: { select: { submissions: true } } }
  });
  if (!form) throw new AppError(404, "FORM_NOT_FOUND", "The form was not found.");
  return toDefinitionDto(form);
}

export interface CreateFormInput {
  name: string;
  description?: string | null;
  fields: FormFieldDefinition[];
}

export async function createForm(actor: ActorContext, input: CreateFormInput): Promise<FormDefinitionDto> {
  const existing = await prisma.formDefinition.findFirst({ where: { tenantId: actor.organizationId, name: input.name } });
  if (existing) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A form with this name already exists.");

  const form = await prisma.formDefinition.create({
    data: {
      tenantId: actor.organizationId,
      name: input.name,
      description: input.description ?? null,
      schemaJson: JSON.stringify(input.fields),
      status: "DRAFT",
      createdById: actor.userId
    },
    include: { _count: { select: { submissions: true } } }
  });
  await audit(actor, "form.created", form.id, { name: form.name });
  return toDefinitionDto(form);
}

export async function updateForm(
  actor: ActorContext,
  formId: string,
  input: Partial<CreateFormInput & { status: FormStatus }>
): Promise<FormDefinitionDto> {
  const form = await prisma.formDefinition.findFirst({ where: { id: formId, tenantId: actor.organizationId } });
  if (!form) throw new AppError(404, "FORM_NOT_FOUND", "The form was not found.");

  if (input.name && input.name !== form.name) {
    const clash = await prisma.formDefinition.findFirst({
      where: { tenantId: actor.organizationId, name: input.name, NOT: { id: formId } }
    });
    if (clash) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A form with this name already exists.");
  }

  if (input.status === "PUBLISHED" && parseFields(form.schemaJson).filter((f) => f.type !== "heading" && f.type !== "separator").length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "A form must have at least one input field before publishing.");
  }

  const updated = await prisma.formDefinition.update({
    where: { id: formId },
    data: {
      name: input.name,
      description: input.description,
      schemaJson: input.fields ? JSON.stringify(input.fields) : undefined,
      status: input.status
    },
    include: { _count: { select: { submissions: true } } }
  });
  await audit(actor, "form.updated", form.id, { name: updated.name, status: updated.status });
  return toDefinitionDto(updated);
}

export async function deleteForm(actor: ActorContext, formId: string): Promise<void> {
  const form = await prisma.formDefinition.findFirst({ where: { id: formId, tenantId: actor.organizationId } });
  if (!form) throw new AppError(404, "FORM_NOT_FOUND", "The form was not found.");
  await prisma.formDefinition.delete({ where: { id: formId } });
  await audit(actor, "form.deleted", form.id, { name: form.name });
}

export async function duplicateForm(actor: ActorContext, formId: string, customName?: string): Promise<FormDefinitionDto> {
  const source = await prisma.formDefinition.findFirst({ where: { id: formId, tenantId: actor.organizationId } });
  if (!source) throw new AppError(404, "FORM_NOT_FOUND", "The form was not found.");

  const baseName = customName ?? `${source.name} (cópia)`;
  let name = baseName;
  let suffix = 1;
  while (await prisma.formDefinition.findFirst({ where: { tenantId: actor.organizationId, name } })) {
    name = `${baseName} ${++suffix}`;
  }

  const copy = await prisma.formDefinition.create({
    data: {
      tenantId: actor.organizationId,
      name,
      description: source.description,
      schemaJson: source.schemaJson,
      status: "DRAFT",
      createdById: actor.userId
    },
    include: { _count: { select: { submissions: true } } }
  });
  await audit(actor, "form.duplicated", copy.id, { name: copy.name, sourceId: formId });
  return toDefinitionDto(copy);
}

export interface ListSubmissionsInput {
  page: number;
  pageSize: number;
}

export async function listSubmissions(
  actor: ActorContext,
  formId: string,
  input: ListSubmissionsInput
): Promise<FormSubmissionsResponse> {
  const form = await prisma.formDefinition.findFirst({ where: { id: formId, tenantId: actor.organizationId } });
  if (!form) throw new AppError(404, "FORM_NOT_FOUND", "The form was not found.");

  const where = { tenantId: actor.organizationId, formDefinitionId: formId } as const;
  const [submissions, total] = await Promise.all([
    prisma.formSubmission.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { submitter: { select: { id: true, name: true, avatar: true } } }
    }),
    prisma.formSubmission.count({ where })
  ]);

  return {
    submissions: submissions.map(toSubmissionDto),
    total,
    page: input.page,
    pageSize: input.pageSize
  };
}

export async function submitForm(
  actor: ActorContext | null,
  organizationId: string,
  formId: string,
  values: Record<string, unknown>
): Promise<FormSubmissionDto> {
  const form = await prisma.formDefinition.findFirst({ where: { id: formId, tenantId: organizationId } });
  if (!form) throw new AppError(404, "FORM_NOT_FOUND", "The form was not found.");
  if (form.status !== "PUBLISHED") {
    throw new AppError(403, "FORM_NOT_PUBLISHED", "This form is not accepting submissions.");
  }

  const fields = parseFields(form.schemaJson);
  const validated = validateSubmission(fields, values);

  const submission = await prisma.formSubmission.create({
    data: {
      tenantId: organizationId,
      formDefinitionId: formId,
      valuesJson: JSON.stringify(validated),
      submittedById: actor?.userId ?? null
    },
    include: { submitter: { select: { id: true, name: true, avatar: true } } }
  });
  // Anonymous submissions have no member context to run workflows as.
  if (actor) {
    const context: Record<string, unknown> = { formId, formName: form.name, submissionId: submission.id };
    for (const field of fields) {
      if (field.type === "heading" || field.type === "separator") continue;
      if (!(field.id in validated)) continue;
      context[`submission.${field.id}`] = validated[field.id];
      const labelKey = `submission.${field.label}`;
      if (!(labelKey in context)) context[labelKey] = validated[field.id];
    }
    await fireWorkflowEvent(actor, "form.submitted", context);
  }
  return toSubmissionDto(submission);
}

function validateSubmission(fields: FormFieldDefinition[], values: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const known = new Set(fields.map((f) => f.id));

  for (const field of fields) {
    if (field.type === "heading" || field.type === "separator") continue;
    const raw = values[field.id];
    if (raw == null || raw === "") {
      if (field.required) {
        throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" is required.`);
      }
      if (field.defaultValue != null) {
        result[field.id] = field.defaultValue;
      }
      continue;
    }
    result[field.id] = validateFieldValue(field, raw);
  }

  for (const key of Object.keys(values)) {
    if (!known.has(key)) {
      throw new AppError(400, "VALIDATION_ERROR", `Unknown field "${key}".`);
    }
  }
  return result;
}

function validateFieldValue(field: FormFieldDefinition, raw: unknown): unknown {
  switch (field.type) {
    case "text":
      if (typeof raw !== "string") throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" must be text.`);
      return raw.slice(0, 1000);
    case "longtext":
      if (typeof raw !== "string") throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" must be text.`);
      return raw.slice(0, 10_000);
    case "number": {
      const num = Number(raw);
      if (!Number.isFinite(num)) throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" must be a number.`);
      return num;
    }
    case "currency": {
      const num = Number(raw);
      if (!Number.isFinite(num)) throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" must be a currency value.`);
      return Math.round(num * 100) / 100;
    }
    case "email": {
      if (typeof raw !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" must be a valid email.`);
      }
      return raw;
    }
    case "phone": {
      if (typeof raw !== "string") throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" must be a phone number.`);
      const cleaned = raw.replace(/[\s()-]/g, "");
      if (!/^\+?\d{4,20}$/.test(cleaned)) {
        throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" must be a valid phone number.`);
      }
      return raw;
    }
    case "date": {
      const date = new Date(typeof raw === "string" ? raw : String(raw));
      if (Number.isNaN(date.getTime())) throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" must be a valid date.`);
      return date.toISOString();
    }
    case "select":
    case "radio": {
      const allowed = field.options?.map((o) => o.value) ?? [];
      if (typeof raw !== "string" || !allowed.includes(raw)) {
        throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" has an invalid selection.`);
      }
      return raw;
    }
    case "checkbox": {
      const allowed = new Set(field.options?.map((o) => o.value) ?? []);
      const arr = Array.isArray(raw) ? raw : [raw];
      for (const item of arr) {
        if (typeof item !== "string" || !allowed.has(item)) {
          throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" has an invalid selection.`);
        }
      }
      return arr;
    }
    case "upload": {
      if (typeof raw !== "string") throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" must be a file reference.`);
      return raw.slice(0, 500);
    }
    default:
      throw new AppError(400, "VALIDATION_ERROR", `Field "${field.label}" has an unsupported type.`);
  }
}

export function exportSubmissionsCsv(fields: FormFieldDefinition[], submissions: FormSubmissionDto[]): string {
  const dataFields = fields.filter((f) => f.type !== "heading" && f.type !== "separator");
  const headers = ["Submetido em", "Submetido por", ...dataFields.map((f) => escapeCsv(f.label))];
  const rows = submissions.map((sub) => {
    const date = new Date(sub.submittedAt).toLocaleString("pt-PT");
    const submitter = sub.submitter?.name ?? "Anónimo";
    const values = dataFields.map((field) => {
      const value = sub.values[field.id];
      return escapeCsv(formatCsvValue(field.type, value));
    });
    return [escapeCsv(date), escapeCsv(submitter), ...values].join(",");
  });
  return [headers.join(","), ...rows].join("\r\n");
}

function formatCsvValue(type: string, value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join("; ");
  switch (type) {
    case "boolean": return value ? "true" : "false";
    case "currency":
    case "number": return typeof value === "number" ? String(value) : String(value);
    case "date":
    case "datetime": return value instanceof Date ? value.toISOString() : String(value);
    default: return String(value);
  }
}

function escapeCsv(value: string): string {
  // Prevent CSV formula injection — prefix dangerous characters
  let escaped = value;
  if (/^[=+\-@]/.test(escaped)) {
    escaped = `'${escaped}`;
  }
  if (/[",\r\n]/.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}

async function audit(actor: ActorContext, action: string, resourceId: string, context?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      tenantId: actor.organizationId,
      actorId: actor.membershipId,
      action,
      resourceType: "form",
      resourceId,
      contextJson: context ? JSON.stringify(context) : null
    }
  });
}
