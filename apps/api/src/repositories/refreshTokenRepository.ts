import type { RefreshToken } from "@prisma/client";
import { prisma } from "../lib/prisma";

export function create(data: {
  tokenHash: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
}): Promise<RefreshToken> {
  return prisma.refreshToken.create({ data });
}

export function findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
  return prisma.refreshToken.findUnique({ where: { tokenHash } });
}

export function revoke(id: string): Promise<RefreshToken> {
  return prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

/** Revokes every not-yet-revoked token in the family (EC-9 reuse response). */
export function revokeFamily(familyId: string): Promise<{ count: number }> {
  return prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
