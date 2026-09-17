import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";

export function findByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export function findByUsername(username: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { username } });
}

export function findById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export function create(data: {
  email: string;
  passwordHash: string;
  name: string;
  username: string;
}): Promise<User> {
  return prisma.user.create({ data });
}

// M7: candidate set for search. The WHERE clause (the actual filtering) runs
// in Postgres — this never fetches the whole table. SEARCH_CANDIDATE_LIMIT
// is deliberately larger than the final result limit the caller applies
// (see userService.search): ranking the *matched* candidates into the
// documented tier order (exact > prefix > other-substring > name) happens
// in the service layer, not here (ARCHITECTURE.md's repository-is-Prisma-only
// rule) — this just needs to hand over enough matches for that ranking to be
// meaningful. See docs/DATABASE.md §5 for why a plain btree index only
// partially accelerates this query.
const SEARCH_CANDIDATE_LIMIT = 50;

export function search(query: string, excludeUserId: string): Promise<User[]> {
  return prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      OR: [
        { username: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { username: "asc" },
    take: SEARCH_CANDIDATE_LIMIT,
  });
}
