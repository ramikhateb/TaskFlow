import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import type { UserRepository } from "../../src/services/userService";

/**
 * In-memory stand-in for the Prisma-backed user repository's search method,
 * matching userService's narrow interface exactly, so it can be unit tested
 * with no database.
 */
export function createFakeUserRepository() {
  const users: User[] = [];

  function addUser(overrides: Partial<User> & { name: string; username: string }): User {
    const user: User = {
      id: randomUUID(),
      email: `${overrides.username}@example.com`,
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    users.push(user);
    return user;
  }

  const userRepository: UserRepository & { findById(id: string): Promise<User | null> } = {
    async search(query, excludeUserId) {
      return users.filter(
        (u) =>
          u.id !== excludeUserId &&
          (u.username.toLowerCase().includes(query) || u.name.toLowerCase().includes(query)),
      );
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
  };

  return { users, addUser, userRepository };
}
