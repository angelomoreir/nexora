import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import {
  createFormSchema,
  listFormsSchema,
  listSubmissionsSchema,
  submitFormSchema,
  updateFormSchema
} from "./form.schemas.js";
import {
  createForm,
  deleteForm,
  duplicateForm,
  exportSubmissionsCsv,
  getActor,
  getForm,
  listForms,
  listSubmissions,
  submitForm,
  updateForm
} from "./form.service.js";

const formsView = [authenticate, requirePermission(permissions.formsView)];
const formsManage = [authenticate, requirePermission(permissions.formsManage)];

function params(request: { params: unknown }) {
  return request.params as { organizationId: string; formId: string };
}

async function actorFor(request: FastifyRequest) {
  const { organizationId } = params(request);
  return getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const formRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/forms", { preHandler: formsView }, async (request) => {
    return listForms(await actorFor(request), listFormsSchema.parse(request.query));
  });

  app.get("/organizations/:organizationId/forms/:formId", { preHandler: formsView }, async (request) => {
    return getForm(await actorFor(request), params(request).formId);
  });

  app.post("/organizations/:organizationId/forms", { preHandler: formsManage }, async (request, reply) => {
    return reply.status(201).send(await createForm(await actorFor(request), createFormSchema.parse(request.body)));
  });

  app.patch("/organizations/:organizationId/forms/:formId", { preHandler: formsManage }, async (request) => {
    return updateForm(await actorFor(request), params(request).formId, updateFormSchema.parse(request.body));
  });

  app.post("/organizations/:organizationId/forms/:formId/duplicate", { preHandler: formsManage }, async (request, reply) => {
    const body = (request.body ?? {}) as { name?: string };
    return reply.status(201).send(await duplicateForm(await actorFor(request), params(request).formId, body.name));
  });

  app.delete("/organizations/:organizationId/forms/:formId", { preHandler: formsManage }, async (request, reply) => {
    await deleteForm(await actorFor(request), params(request).formId);
    return reply.status(204).send();
  });

  app.get("/organizations/:organizationId/forms/:formId/submissions", { preHandler: formsView }, async (request) => {
    return listSubmissions(await actorFor(request), params(request).formId, listSubmissionsSchema.parse(request.query));
  });

  app.post("/organizations/:organizationId/forms/:formId/submissions", { preHandler: authenticate }, async (request, reply) => {
    const { organizationId, formId } = params(request);
    const actor = await getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
    const result = await submitForm(actor, organizationId, formId, submitFormSchema.parse(request.body).values);
    return reply.status(201).send(result);
  });

  app.get("/organizations/:organizationId/forms/:formId/submissions/export.csv", { preHandler: formsView }, async (request, reply: FastifyReply) => {
    const actor = await actorFor(request);
    const form = await getForm(actor, params(request).formId);
    const all = await listSubmissions(actor, params(request).formId, { page: 1, pageSize: 10000 });
    const csv = exportSubmissionsCsv(form.fields, all.submissions);
    const filename = `${form.name.replace(/[^a-zA-Z0-9._-]/g, "_")}-respostas.csv`;
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(csv);
  });
};
