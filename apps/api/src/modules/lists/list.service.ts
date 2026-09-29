import type {
  ListDefinitionDto,
  ListFieldDto,
  ListFieldOption,
  ListFieldType,
  ListItemDto,
  ListItemsResponse,
  ListSummaryDto,
  ListsResponse
} from "@nexora/contracts";
import type { ListDefinition, ListField, ListItem } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { dispatchToSubscribers, type SubscriptionDispatchPayload } from "../subscriptions/subscription.service.js";
import { fireWorkflowEvent } from "../workflows/automation.service.js";

interface ActorContext {
  organizationId: string;
  userId: string;
  membershipId: string;
  isSuperAdmin: boolean;
}

const FIELD_TYPES: ListFieldType[] = [
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
];

export async function getActor(organizationId: string, userId: string, isSuperAdmin: boolean): Promise<ActorContext> {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return { organizationId, userId, membershipId: membership.id, isSuperAdmin };
}

type FieldWithRelations = ListField & { relationList?: { id: string; name: string } | null };

function parseOptions(field: ListField): ListFieldOption[] | null {
  if (field.type !== "choice" || !field.optionsJson) return null;
  try {
    const parsed = JSON.parse(field.optionsJson) as ListFieldOption[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toFieldDto(field: FieldWithRelations): ListFieldDto {
  return {
    id: field.id,
    name: field.name,
    slug: field.slug,
    type: field.type as ListFieldType,
    required: field.required,
    options: parseOptions(field),
    relationListId: field.relationListId,
    order: field.order
  };
}

function toListSummaryDto(list: ListDefinition & { _count?: { fields: number; items: number } }): ListSummaryDto {
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    icon: list.icon,
    fieldCount: list._count?.fields ?? 0,
    itemCount: list._count?.items ?? 0,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString()
  };
}

function toListDefinitionDto(
  list: ListDefinition & { fields: FieldWithRelations[]; _count?: { items: number } }
): ListDefinitionDto {
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    icon: list.icon,
    fields: list.fields.sort((a, b) => a.order - b.order).map(toFieldDto),
    itemCount: list._count?.items ?? 0,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString()
  };
}

function toItemDto(item: ListItem & { creator: { id: string; name: string; avatar: string | null } }): ListItemDto {
  let values: Record<string, unknown> = {};
  try {
    values = JSON.parse(item.valuesJson) as Record<string, unknown>;
  } catch {
    values = {};
  }
  return {
    id: item.id,
    values,
    creator: item.creator,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

export interface ListListInput {
  search?: string;
  sort: "name" | "updatedAt" | "createdAt";
  order: "asc" | "desc";
}

export async function listLists(actor: ActorContext, input: ListListInput): Promise<ListsResponse> {
  const where = { tenantId: actor.organizationId, name: input.search ? { contains: input.search, mode: "insensitive" as const } : undefined };
  const orderBy: Record<string, "asc" | "desc"> = { [input.sort]: input.order };
  const [lists, total] = await Promise.all([
    prisma.listDefinition.findMany({
      where,
      orderBy,
      include: { _count: { select: { fields: true, items: true } } }
    }),
    prisma.listDefinition.count({ where })
  ]);
  return { lists: lists.map(toListSummaryDto), total };
}

export async function getList(actor: ActorContext, listId: string): Promise<ListDefinitionDto> {
  const list = await prisma.listDefinition.findFirst({
    where: { id: listId, tenantId: actor.organizationId },
    include: { fields: { include: { relationList: { select: { id: true, name: true } } } }, _count: { select: { items: true } } }
  });
  if (!list) throw new AppError(404, "LIST_NOT_FOUND", "The list was not found.");
  return toListDefinitionDto(list);
}

export interface CreateListInput {
  name: string;
  description?: string | null;
  icon?: string | null;
  fields: Array<{
    name: string;
    slug: string;
    type: ListFieldType;
    required: boolean;
    options?: ListFieldOption[] | null;
    relationListId?: string | null;
    order: number;
  }>;
}

export async function createList(actor: ActorContext, input: CreateListInput): Promise<ListDefinitionDto> {
  await validateRelationTargets(actor, input.fields);
  const existing = await prisma.listDefinition.findFirst({ where: { tenantId: actor.organizationId, name: input.name } });
  if (existing) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A list with this name already exists.");

  const list = await prisma.listDefinition.create({
    data: {
      tenantId: actor.organizationId,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      createdById: actor.userId,
      fields: {
        create: input.fields.map((field) => ({
          tenantId: actor.organizationId,
          name: field.name,
          slug: field.slug,
          type: field.type,
          required: field.required,
          optionsJson: field.options ? JSON.stringify(field.options) : null,
          relationListId: field.relationListId ?? null,
          order: field.order
        }))
      }
    },
    include: { fields: { include: { relationList: { select: { id: true, name: true } } } }, _count: { select: { items: true } } }
  });

  await audit(actor, "list.created", list.id, { name: list.name });
  return toListDefinitionDto(list);
}

export async function updateList(
  actor: ActorContext,
  listId: string,
  input: Partial<CreateListInput>
): Promise<ListDefinitionDto> {
  const list = await prisma.listDefinition.findFirst({
    where: { id: listId, tenantId: actor.organizationId },
    include: { fields: true }
  });
  if (!list) throw new AppError(404, "LIST_NOT_FOUND", "The list was not found.");

  if (input.name && input.name !== list.name) {
    const clash = await prisma.listDefinition.findFirst({
      where: { tenantId: actor.organizationId, name: input.name, NOT: { id: listId } }
    });
    if (clash) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A list with this name already exists.");
  }

  if (input.fields) {
    await validateRelationTargets(actor, input.fields, listId);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.fields) {
      await tx.listField.deleteMany({ where: { listDefinitionId: listId } });
      await tx.listField.createMany({
        data: input.fields.map((field) => ({
          tenantId: actor.organizationId,
          listDefinitionId: listId,
          name: field.name,
          slug: field.slug,
          type: field.type,
          required: field.required,
          optionsJson: field.options ? JSON.stringify(field.options) : null,
          relationListId: field.relationListId ?? null,
          order: field.order
        }))
      });
    }
    return tx.listDefinition.update({
      where: { id: listId },
      data: {
        name: input.name,
        description: input.description,
        icon: input.icon
      },
      include: { fields: { include: { relationList: { select: { id: true, name: true } } } }, _count: { select: { items: true } } }
    });
  });

  await audit(actor, "list.updated", list.id, { name: updated.name });
  return toListDefinitionDto(updated);
}

export async function deleteList(actor: ActorContext, listId: string): Promise<void> {
  const list = await prisma.listDefinition.findFirst({ where: { id: listId, tenantId: actor.organizationId } });
  if (!list) throw new AppError(404, "LIST_NOT_FOUND", "The list was not found.");
  await prisma.listDefinition.delete({ where: { id: listId } });
  await audit(actor, "list.deleted", list.id, { name: list.name });
}

export async function duplicateList(
  actor: ActorContext,
  listId: string,
  customName?: string
): Promise<ListDefinitionDto> {
  const source = await prisma.listDefinition.findFirst({
    where: { id: listId, tenantId: actor.organizationId },
    include: { fields: true }
  });
  if (!source) throw new AppError(404, "LIST_NOT_FOUND", "The list was not found.");

  const baseName = customName ?? `${source.name} (cópia)`;
  let name = baseName;
  let suffix = 1;
  while (await prisma.listDefinition.findFirst({ where: { tenantId: actor.organizationId, name } })) {
    name = `${baseName} ${++suffix}`;
  }

  const copy = await prisma.listDefinition.create({
    data: {
      tenantId: actor.organizationId,
      name,
      description: source.description,
      icon: source.icon,
      createdById: actor.userId,
      fields: {
        create: source.fields.map((field) => ({
          tenantId: actor.organizationId,
          name: field.name,
          slug: field.slug,
          type: field.type,
          required: field.required,
          optionsJson: field.optionsJson,
          relationListId: field.relationListId,
          order: field.order
        }))
      }
    },
    include: { fields: { include: { relationList: { select: { id: true, name: true } } } }, _count: { select: { items: true } } }
  });

  await audit(actor, "list.duplicated", copy.id, { name: copy.name, sourceId: listId });
  return toListDefinitionDto(copy);
}

export interface ListItemsInput {
  search?: string;
  sort?: string;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

export async function listItems(
  actor: ActorContext,
  listId: string,
  input: ListItemsInput
): Promise<ListItemsResponse> {
  const list = await prisma.listDefinition.findFirst({
    where: { id: listId, tenantId: actor.organizationId },
    include: { fields: true }
  });
  if (!list) throw new AppError(404, "LIST_NOT_FOUND", "The list was not found.");

  const where = { tenantId: actor.organizationId, listDefinitionId: listId } as const;
  const total = await prisma.listItem.count({ where });

  // Sorting by field value: we sort in memory because valuesJson is opaque.
  const take = input.pageSize;
  const skip = (input.page - 1) * input.pageSize;

  let items: Array<ListItem & { creator: { id: string; name: string; avatar: string | null } }>;
  if (input.sort) {
    const field = list.fields.find((f) => f.slug === input.sort);
    if (!field) throw new AppError(400, "INVALID_SORT_FIELD", `The sort field "${input.sort}" does not exist.`);
    const all = await prisma.listItem.findMany({
      where,
      include: { creator: { select: { id: true, name: true, avatar: true } } }
    });
    all.sort((a, b) => {
      const av = extractValue(a, input.sort!);
      const bv = extractValue(b, input.sort!);
      return compareValues(av, bv, input.order);
    });
    items = all.slice(skip, skip + take);
  } else {
    items = await prisma.listItem.findMany({
      where,
      orderBy: { createdAt: input.order === "asc" ? "asc" : "desc" },
      skip,
      take,
      include: { creator: { select: { id: true, name: true, avatar: true } } }
    });
  }

  return {
    items: items.map(toItemDto),
    total,
    page: input.page,
    pageSize: input.pageSize
  };
}

function extractValue(item: ListItem, slug: string): unknown {
  try {
    const values = JSON.parse(item.valuesJson) as Record<string, unknown>;
    return values[slug];
  } catch {
    return undefined;
  }
}

function compareValues(a: unknown, b: unknown, order: "asc" | "desc"): number {
  const factor = order === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return -1 * factor;
  if (b == null) return 1 * factor;
  if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
  const as = String(a);
  const bs = String(b);
  return as.localeCompare(bs) * factor;
}

export async function createItem(
  actor: ActorContext,
  listId: string,
  values: Record<string, unknown>
): Promise<ListItemDto> {
  const list = await prisma.listDefinition.findFirst({
    where: { id: listId, tenantId: actor.organizationId },
    include: { fields: true }
  });
  if (!list) throw new AppError(404, "LIST_NOT_FOUND", "The list was not found.");

  const validated = validateItemValues(list.fields, values);
  const item = await prisma.listItem.create({
    data: {
      tenantId: actor.organizationId,
      listDefinitionId: listId,
      valuesJson: JSON.stringify(validated),
      createdById: actor.userId
    },
    include: { creator: { select: { id: true, name: true, avatar: true } } }
  });
  await audit(actor, "list.item.created", listId, { itemId: item.id });
  await safeDispatch(actor.organizationId, "list", listId, "item.added", {
    actorMembershipId: actor.membershipId,
    title: "Novo item na lista",
    body: `Um novo item foi adicionado à lista "${list.name}".`,
    data: { listId, itemId: item.id }
  });
  await safeDispatchWebhooks(actor.organizationId, "list.item.added", { listId, itemId: item.id, listName: list.name });
  await fireWorkflowEvent(actor, "list.item.created", { listId, itemId: item.id, listName: list.name });
  return toItemDto(item);
}

export async function updateItem(
  actor: ActorContext,
  listId: string,
  itemId: string,
  values: Record<string, unknown>
): Promise<ListItemDto> {
  const list = await prisma.listDefinition.findFirst({
    where: { id: listId, tenantId: actor.organizationId },
    include: { fields: true }
  });
  if (!list) throw new AppError(404, "LIST_NOT_FOUND", "The list was not found.");

  const existing = await prisma.listItem.findFirst({ where: { id: itemId, tenantId: actor.organizationId, listDefinitionId: listId } });
  if (!existing) throw new AppError(404, "LIST_ITEM_NOT_FOUND", "The list item was not found.");

  const validated = validateItemValues(list.fields, values);
  const item = await prisma.listItem.update({
    where: { id: itemId },
    data: { valuesJson: JSON.stringify(validated) },
    include: { creator: { select: { id: true, name: true, avatar: true } } }
  });
  await audit(actor, "list.item.updated", listId, { itemId: item.id });
  return toItemDto(item);
}

export async function deleteItem(actor: ActorContext, listId: string, itemId: string): Promise<void> {
  const existing = await prisma.listItem.findFirst({ where: { id: itemId, tenantId: actor.organizationId, listDefinitionId: listId } });
  if (!existing) throw new AppError(404, "LIST_ITEM_NOT_FOUND", "The list item was not found.");
  await prisma.listItem.delete({ where: { id: itemId } });
  await audit(actor, "list.item.deleted", listId, { itemId });
}

export async function deleteItems(actor: ActorContext, listId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const result = await prisma.listItem.deleteMany({
    where: { id: { in: itemIds }, tenantId: actor.organizationId, listDefinitionId: listId }
  });
  await audit(actor, "list.items.deleted", listId, { count: result.count });
}

export async function getAllItemsForExport(actor: ActorContext, listId: string): Promise<{ list: ListDefinitionDto; items: ListItemDto[] }> {
  const list = await getList(actor, listId);
  const all = await listItems(actor, listId, { page: 1, pageSize: 10000, order: "asc" });
  return { list, items: all.items };
}

export function exportCsv(list: ListDefinitionDto, items: ListItemDto[]): string {
  const headers = list.fields.map((field) => escapeCsv(field.name));
  const rows = items.map((item) =>
    list.fields
      .map((field) => {
        const value = item.values[field.slug];
        return escapeCsv(formatCsvValue(field.type, value));
      })
      .join(",")
  );
  return [headers.join(","), ...rows].join("\r\n");
}

function formatCsvValue(type: ListFieldType, value: unknown): string {
  if (value == null) return "";
  switch (type) {
    case "boolean":
      return value ? "true" : "false";
    case "date":
    case "datetime":
      return value instanceof Date ? value.toISOString() : String(value);
    case "currency":
    case "number":
      return typeof value === "number" ? String(value) : String(value);
    case "choice":
      return String(value);
    case "user":
    case "relation":
    case "file":
      return typeof value === "string" ? value : String(value);
    default:
      return String(value);
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

function validateItemValues(
  fields: ListField[],
  values: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const slug = field.slug;
    const raw = values[slug];
    const type = field.type as ListFieldType;
    if (raw == null || raw === "") {
      if (field.required) {
        throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" is required.`);
      }
      continue;
    }
    result[slug] = validateFieldValue(field, type, raw);
  }
  // Reject unknown fields to keep data clean.
  const known = new Set(fields.map((f) => f.slug));
  for (const key of Object.keys(values)) {
    if (!known.has(key)) {
      throw new AppError(400, "VALIDATION_ERROR", `Unknown field "${key}".`);
    }
  }
  return result;
}

function validateFieldValue(field: ListField, type: ListFieldType, raw: unknown): unknown {
  switch (type) {
    case "text":
    case "longtext":
      if (typeof raw !== "string") throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" must be text.`);
      return raw.slice(0, type === "longtext" ? 10_000 : 1000);
    case "number": {
      const num = Number(raw);
      if (!Number.isFinite(num)) throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" must be a number.`);
      return num;
    }
    case "currency": {
      const num = Number(raw);
      if (!Number.isFinite(num)) throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" must be a currency value.`);
      return Math.round(num * 100) / 100;
    }
    case "boolean":
      return Boolean(raw);
    case "date":
    case "datetime": {
      const date = new Date(typeof raw === "string" ? raw : String(raw));
      if (Number.isNaN(date.getTime())) throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" must be a valid date.`);
      return date.toISOString();
    }
    case "email": {
      if (typeof raw !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" must be a valid email.`);
      }
      return raw;
    }
    case "url": {
      if (typeof raw !== "string") throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" must be a URL.`);
      try {
        new URL(raw);
      } catch {
        throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" must be a valid URL.`);
      }
      return raw;
    }
    case "choice": {
      const options = parseOptions(field);
      const allowed = options?.map((o) => o.value) ?? [];
      if (typeof raw !== "string" || !allowed.includes(raw)) {
        throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" has an invalid choice.`);
      }
      return raw;
    }
    case "user":
    case "relation":
    case "file":
      if (typeof raw !== "string" || raw.trim().length === 0) {
        throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" must be a valid reference id.`);
      }
      return raw;
    default:
      throw new AppError(400, "VALIDATION_ERROR", `Field "${field.name}" has an unsupported type.`);
  }
}

async function validateRelationTargets(
  actor: ActorContext,
  fields: Array<{ type: ListFieldType; relationListId?: string | null }>,
  excludeListId?: string
): Promise<void> {
  const relationTargets = fields
    .filter((f) => f.type === "relation" && f.relationListId)
    .map((f) => f.relationListId!) as string[];
  if (relationTargets.length === 0) return;
  const valid = await prisma.listDefinition.findMany({
    where: { id: { in: relationTargets }, tenantId: actor.organizationId },
    select: { id: true }
  });
  const validIds = new Set(valid.map((v) => v.id));
  for (const target of relationTargets) {
    if (!validIds.has(target)) {
      throw new AppError(400, "INVALID_RELATION_TARGET", "The relation target list does not exist.");
    }
    if (excludeListId && target === excludeListId) {
      throw new AppError(400, "INVALID_RELATION_TARGET", "A list cannot reference itself.");
    }
  }
}

// Subscription fan-out must never break the main operation.
async function safeDispatch(tenantId: string, targetType: "folder" | "document" | "list" | "task" | "project", targetId: string, event: string, payload: SubscriptionDispatchPayload) {
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

async function audit(actor: ActorContext, action: string, resourceId: string, context?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      tenantId: actor.organizationId,
      actorId: actor.membershipId,
      action,
      resourceType: "list",
      resourceId,
      contextJson: context ? JSON.stringify(context) : null
    }
  });
}

export { FIELD_TYPES };
