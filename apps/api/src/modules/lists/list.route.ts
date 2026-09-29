import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import {
  createItemSchema,
  createListSchema,
  duplicateListSchema,
  listItemsSchema,
  listListsSchema,
  updateItemSchema,
  updateListSchema
} from "./list.schemas.js";
import {
  createItem,
  createList,
  deleteItem,
  deleteItems,
  deleteList,
  duplicateList,
  exportCsv,
  getAllItemsForExport,
  getList,
  getActor,
  listItems,
  listLists,
  updateItem,
  updateList
} from "./list.service.js";

const listsView = [authenticate, requirePermission(permissions.listsView)];
const listsManage = [authenticate, requirePermission(permissions.listsManage)];

function params(request: { params: unknown }) {
  return request.params as { organizationId: string; listId: string; itemId: string };
}

async function actorFor(request: FastifyRequest) {
  const { organizationId } = params(request);
  return getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const listRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/lists", { preHandler: listsView }, async (request) => {
    return listLists(await actorFor(request), listListsSchema.parse(request.query));
  });

  app.get("/organizations/:organizationId/lists/:listId", { preHandler: listsView }, async (request) => {
    return getList(await actorFor(request), params(request).listId);
  });

  app.post("/organizations/:organizationId/lists", { preHandler: listsManage }, async (request, reply) => {
    const list = await createList(await actorFor(request), createListSchema.parse(request.body));
    return reply.status(201).send(list);
  });

  app.patch("/organizations/:organizationId/lists/:listId", { preHandler: listsManage }, async (request) => {
    return updateList(await actorFor(request), params(request).listId, updateListSchema.parse(request.body));
  });

  app.post("/organizations/:organizationId/lists/:listId/duplicate", { preHandler: listsManage }, async (request, reply) => {
    const input = duplicateListSchema.parse(request.body ?? {});
    return reply.status(201).send(await duplicateList(await actorFor(request), params(request).listId, input.name));
  });

  app.delete("/organizations/:organizationId/lists/:listId", { preHandler: listsManage }, async (request, reply) => {
    await deleteList(await actorFor(request), params(request).listId);
    return reply.status(204).send();
  });

  app.get("/organizations/:organizationId/lists/:listId/items", { preHandler: listsView }, async (request) => {
    return listItems(await actorFor(request), params(request).listId, listItemsSchema.parse(request.query));
  });

  app.post("/organizations/:organizationId/lists/:listId/items", { preHandler: listsManage }, async (request, reply) => {
    return reply.status(201).send(await createItem(await actorFor(request), params(request).listId, createItemSchema.parse(request.body).values));
  });

  app.patch("/organizations/:organizationId/lists/:listId/items/:itemId", { preHandler: listsManage }, async (request) => {
    return updateItem(await actorFor(request), params(request).listId, params(request).itemId, updateItemSchema.parse(request.body).values);
  });

  app.delete("/organizations/:organizationId/lists/:listId/items/:itemId", { preHandler: listsManage }, async (request, reply) => {
    await deleteItem(await actorFor(request), params(request).listId, params(request).itemId);
    return reply.status(204).send();
  });

  app.post("/organizations/:organizationId/lists/:listId/items/delete-batch", { preHandler: listsManage }, async (request, reply) => {
    const body = request.body as { itemIds?: unknown };
    if (!Array.isArray(body.itemIds) || body.itemIds.some((id) => typeof id !== "string")) {
      throw new AppError(400, "VALIDATION_ERROR", "itemIds must be an array of strings.");
    }
    await deleteItems(await actorFor(request), params(request).listId, body.itemIds as string[]);
    return reply.status(204).send();
  });

  app.get("/organizations/:organizationId/lists/:listId/export.csv", { preHandler: listsView }, async (request, reply: FastifyReply) => {
    const actor = await actorFor(request);
    const { list, items } = await getAllItemsForExport(actor, params(request).listId);
    const csv = exportCsv(list, items);
    const filename = `${list.name.replace(/[^a-zA-Z0-9._-]/g, "_")}.csv`;
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(csv);
  });
};
