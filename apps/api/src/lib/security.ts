import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";

const dummyPasswordHash = argon2.hash("nexora-invalid-credential", { type: argon2.argon2id });

export function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1
  });
}

export function verifyPassword(passwordHash: string, password: string) {
  return argon2.verify(passwordHash, password);
}

export async function verifyDummyPassword(password: string) {
  return argon2.verify(await dummyPasswordHash, password);
}

export function createOpaqueToken() {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
