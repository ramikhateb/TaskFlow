import type { User } from "@prisma/client";
import { createUserService, rankSearchResults } from "../../src/services/userService";
import { createFakeUserRepository } from "../helpers/fakeUserRepository";

function buildService() {
  const { users, addUser, userRepository } = createFakeUserRepository();
  const service = createUserService({ userRepository });
  return { service, users, addUser, userRepository };
}

let userCounter = 0;
function makeUser(overrides: Partial<User> = {}): User {
  userCounter += 1;
  return {
    id: `user-${userCounter}`,
    email: `user${userCounter}@example.com`,
    passwordHash: "hash",
    name: `User ${userCounter}`,
    username: `user${userCounter}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("rankSearchResults (FR-19a)", () => {
  it("orders exact username match before prefix, other-substring, and name-only matches", () => {
    const exact = makeUser({ username: "rami" });
    const prefix = makeUser({ username: "ramikhateb" });
    const otherSubstring = makeUser({ username: "the_rami_fan" });
    const nameOnly = makeUser({ username: "zzz", name: "Rami Khateb" });

    const ranked = rankSearchResults([nameOnly, otherSubstring, prefix, exact], "rami");

    expect(ranked).toEqual([exact, prefix, otherSubstring, nameOnly]);
  });

  it("breaks ties within a tier deterministically by username", () => {
    const b = makeUser({ username: "ramib" });
    const a = makeUser({ username: "ramia" });

    expect(rankSearchResults([b, a], "rami")).toEqual([a, b]);
  });
});

describe("userService.search", () => {
  it("matches by username substring", async () => {
    const { service, addUser } = buildService();
    const match = addUser({ name: "Someone Else", username: "ramikhateb" });
    addUser({ name: "Unrelated", username: "someoneelse" });

    const results = await service.search("caller-id", "rami");

    expect(results.map((u) => u.id)).toEqual([match.id]);
  });

  it("matches by display name substring", async () => {
    const { service, addUser } = buildService();
    const match = addUser({ name: "Rami Khateb", username: "handle123" });
    addUser({ name: "Unrelated", username: "other" });

    const results = await service.search("caller-id", "rami");

    expect(results.map((u) => u.id)).toEqual([match.id]);
  });

  it("excludes the authenticated caller from results", async () => {
    const { service, addUser } = buildService();
    const caller = addUser({ name: "Rami Khateb", username: "ramikhateb" });

    const results = await service.search(caller.id, "rami");

    expect(results).toEqual([]);
  });

  it("returns only id, name, and username — never email or passwordHash", async () => {
    const { service, addUser } = buildService();
    addUser({ name: "Rami Khateb", username: "ramikhateb" });

    const results = await service.search("caller-id", "rami");

    expect(results[0]).toEqual({
      id: expect.any(String),
      name: "Rami Khateb",
      username: "ramikhateb",
    });
    expect(Object.keys(results[0]!)).toEqual(["id", "name", "username"]);
  });

  it("returns an empty array when nothing matches", async () => {
    const { service, addUser } = buildService();
    addUser({ name: "Someone", username: "someone" });

    const results = await service.search("caller-id", "nonexistent-zzz");

    expect(results).toEqual([]);
  });
});
