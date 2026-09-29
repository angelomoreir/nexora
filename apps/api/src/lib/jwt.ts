import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env.js";

const issuer = "nexora-api";
const audience = "nexora-web";
const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export async function createAccessToken(userId: string, sessionId: string) {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_MINUTES}m`)
    .sign(secret);
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secret, { issuer, audience });
  if (!payload.sub || typeof payload.sid !== "string") {
    throw new Error("Token session is missing");
  }
  return { userId: payload.sub, sessionId: payload.sid };
}
