/**
 * M7 migration step 2 of 3: backfill `username` for every User row created
 * before usernames existed (M1-M6 dev/test data). Run once, after the
 * "add_username_nullable" migration and before the "require_username"
 * migration that adds NOT NULL + re-affirms uniqueness.
 *
 * Strategy: derive a candidate from the email local-part (the part before
 * "@") — not because email is meant to be public, but because it's the only
 * existing per-user text on hand for a *local development* backfill, and the
 * result (a username) is what becomes visible, not the source email itself.
 * The instructions this migration follows explicitly sanction deterministic,
 * data-derived usernames for local dev as long as they satisfy the real
 * rules and are unique — this does both, sanitizing the candidate through
 * the exact same `usernameSchema` real registrations are validated against,
 * and appending a numeric suffix on collision.
 *
 * Usage: npx tsx prisma/backfillUsernames.ts
 */
import { PrismaClient } from "@prisma/client";
import { usernameSchema } from "@taskflow/shared";

const prisma = new PrismaClient();

function sanitizeCandidate(localPart: string): string {
  const stripped = localPart.toLowerCase().replace(/[^a-z0-9_.]/g, "");
  const startingWithAlnum = stripped.replace(/^[^a-z0-9]+/, "");
  const base = startingWithAlnum.length > 0 ? startingWithAlnum : "user";
  return base.length >= 3 ? base.slice(0, 20) : base.padEnd(3, "0");
}

async function isTaken(username: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({ where: { username } });
  return existing !== null;
}

async function uniqueUsernameFor(base: string): Promise<string> {
  if (!(await isTaken(base))) {
    return base;
  }
  let suffix = 2;
  for (;;) {
    const candidate = `${base}${suffix}`.slice(0, 20);
    if (!(await isTaken(candidate))) {
      return candidate;
    }
    suffix += 1;
  }
}

async function main() {
  const usersWithoutUsername = await prisma.user.findMany({
    where: { username: null },
    select: { id: true, email: true },
  });

  console.log(`Backfilling ${usersWithoutUsername.length} user(s) with no username...`);

  for (const user of usersWithoutUsername) {
    const localPart = user.email.split("@")[0] ?? "user";
    const base = sanitizeCandidate(localPart);
    const candidate = await uniqueUsernameFor(base);

    // Belt-and-suspenders: validate the generated value against the exact
    // same rules a real registration would have to pass.
    const result = usernameSchema.safeParse(candidate);
    if (!result.success) {
      throw new Error(
        `Generated username "${candidate}" for user ${user.id} failed validation: ${result.error.message}`,
      );
    }

    await prisma.user.update({ where: { id: user.id }, data: { username: result.data } });
    console.log(`  ${user.id} -> ${result.data}`);
  }

  console.log("Backfill complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
