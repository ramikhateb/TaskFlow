import { randomUUID } from "node:crypto";
import type { RefreshToken, User } from "@prisma/client";
import type { RefreshTokenRepository, UserRepository } from "../../src/services/authService";

/**
 * In-memory stand-ins for the Prisma-backed repositories, matching their
 * interfaces exactly, so authService can be unit tested with no database.
 */
export function createFakeRepositories() {
  const users: User[] = [];
  const tokens: RefreshToken[] = [];

  const userRepository: UserRepository = {
    async findByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async findByUsername(username) {
      return users.find((u) => u.username === username) ?? null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async create(data) {
      const user: User = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        username: data.username,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      users.push(user);
      return user;
    },
  };

  const refreshTokenRepository: RefreshTokenRepository = {
    async create(data) {
      const token: RefreshToken = {
        id: randomUUID(),
        tokenHash: data.tokenHash,
        userId: data.userId,
        familyId: data.familyId,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
        revokedAt: null,
      };
      tokens.push(token);
      return token;
    },
    async findByTokenHash(tokenHash) {
      return tokens.find((t) => t.tokenHash === tokenHash) ?? null;
    },
    async revoke(id) {
      const token = tokens.find((t) => t.id === id);
      if (!token) throw new Error("not found");
      token.revokedAt = new Date();
      return token;
    },
    async revokeFamily(familyId) {
      let count = 0;
      for (const token of tokens) {
        if (token.familyId === familyId && !token.revokedAt) {
          token.revokedAt = new Date();
          count += 1;
        }
      }
      return { count };
    },
  };

  return { users, tokens, userRepository, refreshTokenRepository };
}
