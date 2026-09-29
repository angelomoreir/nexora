import type { FastifyPluginAsync } from "fastify";
import { prisma, transactionOptions } from "../../lib/prisma.js";
import { authenticate } from "../auth/auth.guard.js";
import { getSession } from "../auth/auth.service.js";
import { createOrganizationSchema } from "./organization.schemas.js";
import { createOrganizationForUser } from "./organization.service.js";

export const organizationRoute: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authenticate);

  app.get("/", async (request) => (await getSession(request.auth!.userId)).organizations);

  app.post("/", async (request, reply) => {
    const { name } = createOrganizationSchema.parse(request.body);
    const organization = await prisma.$transaction(
      (transaction) => createOrganizationForUser(transaction, request.auth!.userId, name),
      transactionOptions
    );
    return reply.status(201).send({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status
    });
  });
};
