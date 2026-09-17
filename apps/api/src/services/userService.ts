import type { User } from "@prisma/client";
import type { PublicUser } from "@taskflow/shared";

// Narrow interface (matching the repository module's shape) so this service
// can be unit tested against a fake, with no Prisma import here at all —
// same pattern as taskService/authService.
export interface UserRepository {
  search(query: string, excludeUserId: string): Promise<User[]>;
}

export interface UserServiceDeps {
  userRepository: UserRepository;
}

const SEARCH_RESULT_LIMIT = 20;

function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, username: user.username };
}

// FR-19a: deterministic product ordering — exact username match, then
// username prefix match, then other username substring matches, then name
// matches. Applied here in the service (not as a Prisma orderBy) because
// Prisma has no native conditional/CASE ordering without dropping into raw
// SQL, which would be more complexity than a v1 discovery feature warrants;
// the repository already bounds the candidate set (see
// userRepository.SEARCH_CANDIDATE_LIMIT), so this only ever sorts a small,
// already-matched set — the same "fetch bounded candidates in the
// repository, classify/rank in the service" split used for Today in M5.
function tierFor(user: User, query: string): number {
  if (user.username === query) return 0;
  if (user.username.startsWith(query)) return 1;
  if (user.username.includes(query)) return 2;
  return 3; // matched only via name (the repository's OR already guarantees a match)
}

export function rankSearchResults(users: User[], normalizedQuery: string): User[] {
  return [...users].sort((a, b) => {
    const tierDiff = tierFor(a, normalizedQuery) - tierFor(b, normalizedQuery);
    if (tierDiff !== 0) return tierDiff;
    return a.username.localeCompare(b.username); // stable, deterministic tiebreak
  });
}

export function createUserService({ userRepository }: UserServiceDeps) {
  // `query` has already been trimmed/lowercased/"@"-stripped by
  // userSearchQuerySchema at the API boundary.
  async function search(callerId: string, query: string): Promise<PublicUser[]> {
    const candidates = await userRepository.search(query, callerId);
    const ranked = rankSearchResults(candidates, query);
    return ranked.slice(0, SEARCH_RESULT_LIMIT).map(toPublicUser);
  }

  return { search };
}

export type UserService = ReturnType<typeof createUserService>;
