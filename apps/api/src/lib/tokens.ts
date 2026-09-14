import { randomBytes, randomUUID, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Env } from "../env";

export interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(
  userId: string,
  env: Pick<Env, "JWT_ACCESS_SECRET" | "JWT_ACCESS_TTL_SECONDS">,
): string {
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
}

/** Throws if the token is missing, malformed, expired, or has a bad signature. */
export function verifyAccessToken(
  token: string,
  env: Pick<Env, "JWT_ACCESS_SECRET">,
): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === "string" || typeof decoded.sub !== "string") {
    throw new Error("Malformed access token payload");
  }
  return { sub: decoded.sub };
}

/** Cryptographically random opaque refresh token — never a JWT, never logged. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash is ever persisted; the raw value lives solely on-device. */
export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateFamilyId(): string {
  return randomUUID();
}
