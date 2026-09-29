import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    auth: {
      userId: string;
      sessionId: string;
      isSuperAdmin: boolean;
    } | null;
  }
}
