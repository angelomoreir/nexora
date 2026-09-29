import type { FastifyReply } from "fastify";
import { env } from "../config/env.js";

export const ACCESS_COOKIE = "nexora_access";
export const REFRESH_COOKIE = "nexora_refresh";

const secure = env.NODE_ENV === "production";

export function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  reply.setCookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: env.JWT_ACCESS_TTL_MINUTES * 60
  });
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400
  });
}

export function clearAuthCookies(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { httpOnly: true, secure, sameSite: "lax", path: "/" });
  reply.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure, sameSite: "lax", path: "/api/v1/auth" });
}
