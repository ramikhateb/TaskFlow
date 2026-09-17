# Database Design

## 1. Technology

PostgreSQL, accessed exclusively through Prisma ORM from the repository layer described in [ARCHITECTURE.md](./ARCHITECTURE.md). Migrations are managed with `prisma migrate`, committed to version control.

## 2. Design Goals

The schema is written to satisfy the MVP ([REQUIREMENTS.md](./REQUIREMENTS.md)) while staying additive-friendly for the features explicitly deferred in [PRODUCT.md](./PRODUCT.md) — recurring tasks, push notifications, collaboration/teams, and smart scheduling. §7 below shows, for each, that it needs new tables/columns rather than a redesign of what follows. Nothing in the MVP schema is speculative — every field and table maps to a concrete v1 requirement.

## 3. Entity Overview

- **User** — an account.
- **Task** — a unit of work. Has a fixed `creator` and a current `assignee` (the person responsible for completing it — possibly the same person, possibly not).
- **TaskAssignment** — one proposal to transfer assignee-ship of a task from a sender to a recipient, with its own lifecycle. A task can accumulate several of these over its life (declined/cancelled ones are history, not deleted).
- **RefreshToken** — a revocable credential backing the JWT refresh flow, rotated on each use.

### Creator vs. Assignee

This is the schema's central design decision, directly implementing PRODUCT.md requirement 11 ("the original creator should be distinguishable from the person responsible for completing the task"):

- `Task.creatorId` — **immutable**, set once at creation, always the original author, required (`NOT NULL`).
- `Task.assigneeId` — **always represents whoever is currently responsible** for the task, required (`NOT NULL`). It is set to the creator at creation and changes **only** when a `TaskAssignment` is `ACCEPTED` — never when one is merely created, cancelled, or declined.

For a self-created task these are always equal. Every *mutation* authorization rule in REQUIREMENTS.md §2 keys off `assigneeId`, not `creatorId`. **(M10)** *Read* authorization is wider: `GET /tasks/:id` allows `creatorId` too (FR-32) — `TaskService.findVisibleTaskOrThrow` (assignee OR creator) versus `findOwnTaskOrThrow` (assignee only, used by `PATCH`/`DELETE`, unchanged since M3) are two distinct functions specifically so `creatorId` can never leak into a mutation check by sharing one. This read grant is also not blanket "creator sees everything the assignee sees": `Task.scheduledAt` is the current assignee's personal planning state, so a creator-only viewer is served `null` for it regardless of the real stored value (see §6's "What each assignment state means for the task" table and ARCHITECTURE.md's "Creator-safe task-detail contract"). "Distinguishable... responsible for completing" (PRODUCT.md) now means: the creator can always find and read what they made, without that visibility ever amounting to renewed responsibility or renewed insight into the new owner's schedule.

**Invariant:** `assigneeId` is never null and never changes except as a direct, same-transaction consequence of a `TaskAssignment` transitioning to `ACCEPTED`. Creating an assignment (→ `PENDING`), cancelling it, or declining it leave `assigneeId` untouched — the current assignee stays responsible for the task throughout. This means a task always has exactly one responsible party, with no in-between "unowned" state to reason about, even while an assignment is being decided.

**Historical participation is not standing access (M10, EC-16):** in a transfer chain (Rami creates → Daniel accepts → Daniel reassigns to Sarah, who accepts), Daniel appears in `TaskAssignment` history twice (as `toUserId` then as `fromUserId`) but is currently neither `Task.creatorId` nor `Task.assigneeId` — `findVisibleTaskOrThrow` therefore reports the same `NotFoundError` for him as for a total stranger. Only the two columns on `Task` itself — never a join against assignment history — decide current task-read access; a row in `TaskAssignment` naming someone is a historical fact, not a standing grant.

### Why assignment history isn't collapsed into the `Task` row

A task can be assigned, declined, and reassigned to someone else later (EC-6). Modeling each attempt as its own `TaskAssignment` row — rather than a couple of nullable columns on `Task` — keeps a full, queryable history and avoids overloading `Task` with fields that only make sense mid-assignment. `TaskAssignment.taskId` is intentionally **not unique** on its own, because the table legitimately holds many non-pending rows per task over time (CANCELLED/DECLINED/ACCEPTED history is kept, never deleted or overwritten).

**(M8 update)** The business rule "at most one `PENDING` assignment per task" (FR-21) **is** enforced as a structural database constraint, not only in the service layer — see "Enforcing at-most-one-PENDING-per-task" in §8 below for the mechanism and why a plain service-layer check-then-insert was rejected as unsafe under concurrency.

### Why category is a plain string, not a table, in v1

FR-16 only needs exact-match filtering on whatever label a user has typed before; there's no requirement yet for per-user category management (rename, color, delete-and-reassign). A free-text, indexed column satisfies that with no extra moving parts. §7 shows the migration path to a real `Category` entity is additive whenever that's needed.

## 4. Schema (Prisma)

```prisma
enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
  CANCELLED
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}

enum AssignmentStatus {
  PENDING
  ACCEPTED
  DECLINED
  CANCELLED
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  // M7: public product identity (discovery/collaboration) — private email
  // stays the sole authentication credential. Always stored pre-normalized
  // (trim, strip leading "@", lowercase — see @taskflow/shared
  // normalizeUsername), so this plain @unique constraint *is* the
  // case-insensitive uniqueness enforcement; no citext/collation needed.
  username     String   @unique
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tasksCreated        Task[]           @relation("TaskCreator")
  tasksAssigned       Task[]           @relation("TaskAssignee")
  assignmentsSent     TaskAssignment[] @relation("AssignmentFrom")
  assignmentsReceived TaskAssignment[] @relation("AssignmentTo")
  refreshTokens       RefreshToken[]

  @@index([name])
}

model Task {
  id          String       @id @default(cuid())
  title       String
  description String?
  priority    TaskPriority @default(MEDIUM)
  category    String?
  status      TaskStatus   @default(TODO)
  scheduledAt DateTime?
  deadline    DateTime?

  creatorId String
  creator   User   @relation("TaskCreator", fields: [creatorId], references: [id])

  // Always the current responsible party; changes only when a TaskAssignment
  // is ACCEPTED (see §4/§6). Never null, never cleared while pending.
  assigneeId String
  assignee   User   @relation("TaskAssignee", fields: [assigneeId], references: [id])

  assignments TaskAssignment[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([assigneeId, status])
  @@index([assigneeId, scheduledAt])
  @@index([assigneeId, deadline])
  @@index([assigneeId, category])
  @@index([creatorId])
}

model TaskAssignment {
  id      String           @id @default(cuid())
  status  AssignmentStatus @default(PENDING)
  message String?

  taskId String
  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)

  fromUserId String
  fromUser   User   @relation("AssignmentFrom", fields: [fromUserId], references: [id])

  toUserId String
  toUser   User   @relation("AssignmentTo", fields: [toUserId], references: [id])

  createdAt   DateTime  @default(now())
  respondedAt DateTime?

  @@index([taskId, status])
  @@index([toUserId, status])
  @@index([fromUserId, status])
}

model RefreshToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  familyId  String
  expiresAt DateTime
  createdAt DateTime  @default(now())
  revokedAt DateTime?

  @@index([userId])
  @@index([familyId])
}
```

Notes:

- `RefreshToken.familyId` groups all tokens descended from one login, so reuse of a rotated-out token (EC-9) can revoke the entire family in one query rather than tracking a linked list of predecessors.
- `RefreshToken` stores a hash of the token value, never the raw value.
- `Task.category` and `Task.priority` are denormalized/enum choices deliberately, per §3 above and §7 below.
- `TaskAssignment.task`'s `onDelete: Cascade` (M8) implements EC-7: deleting a task removes its assignment history with it. This is safe specifically because deletion itself is blocked outright while a `PENDING` row exists (FR-13/EC-5, §6) — every `TaskAssignment` row still attached to a task at the moment it's actually deleted is therefore pure history (`CANCELLED`, or a future `ACCEPTED`/`DECLINED`), never a row anyone still needs to act on.

## 5. Indexing Rationale

| Index | Serves |
|---|---|
| `Task(assigneeId, status)` | "List my tasks, optionally by status" (FR-16) |
| `Task(assigneeId, scheduledAt)` | Schedule view (FR-15), Today's "scheduled for today" clause (FR-14) |
| `Task(assigneeId, deadline)` | Today's "due today / overdue" clause (FR-14) |
| `Task(assigneeId, category)` | Category filter (FR-16) |
| `Task(creatorId)` | **(still unused as of M10)** Anticipates a future "tasks I created" list endpoint; FR-32's actual `GET /tasks/:id` read grant fetches by primary key (`id`) and checks `creatorId` in the service layer afterward, so it doesn't hit this index at all yet. Kept rather than dropped — see §7's additive-path philosophy. |
| `TaskAssignment(toUserId, status)` | Inbox (FR-28) — `WHERE toUserId = ? AND status = 'PENDING'` uses the full composite index |
| `TaskAssignment(fromUserId, status)` | Sent (FR-29, M10) — `findSentByUser`'s `WHERE fromUserId = ?` (no status filter) uses just the leading column of this composite index; a btree index is usable by any prefix of its columns, so no separate single-column index was needed |
| `TaskAssignment(taskId, status)` | Fast lookup of a task's current `PENDING` assignment (read path, e.g. `GET /tasks/:id`'s `pendingAssignment` field) |
| `TaskAssignment_one_pending_per_task` (partial unique on `taskId` `WHERE status = 'PENDING'`) | The actual structural enforcement of "no other pending assignment on this task" (FR-21) — see §8 |
| `User(name)` | User search (FR-18) — display-name substring match |
| `User(username)` (from `@unique`) | Exact-match lookups (registration uniqueness checks); also partially serves username search — see caveat below |

Free-text title/description search (FR-16) and username/name search (FR-18) both use `ILIKE`/`contains` in v1, which is adequate at MVP scale without a dedicated search index; see §7 for the future full-text-search path. **Caveat on the username/name indexes**: `User(username)`'s unique btree index accelerates exact matches (used for uniqueness checks) and, depending on the database's collation, may partially accelerate a `startsWith` prefix query — but Prisma's `contains` (arbitrary substring, which is what `GET /users/search` and `GET /tasks?q=` both use) cannot use a plain btree index at all; Postgres falls back to a sequential scan. This is an accepted v1 tradeoff (small expected user/task counts, personal-app scope), not an oversight — §7 shows the additive path (`pg_trgm` + GIN) if it's ever needed.

## 6. Task & Assignment State Transitions

### Task status

```
TODO ⇄ IN_PROGRESS ⇄ DONE
  │           │          │
  └────────┴──────────┴──▶ CANCELLED   (terminal)
```

Enforced in the `TaskService`, not the database — a `CHECK` constraint was considered and rejected as unnecessary rigidity for a rule that's naturally expressed and tested in application code (see [ARCHITECTURE.md](./ARCHITECTURE.md)).

### Assignment lifecycle

```
          create assignment                (task.assigneeId unchanged — sender stays responsible)
                │
                ▼
            PENDING ──────accept──────▶ ACCEPTED  (task.assigneeId := toUserId, same transaction)
                │
                ├──────decline─────▶ DECLINED   (task.assigneeId unchanged)
                │
                └──────cancel──────▶ CANCELLED  (task.assigneeId unchanged)   [by sender, pre-response]
```

`ACCEPTED`, `DECLINED`, `CANCELLED` are terminal for that row; a later assignment is a new row (EC-6). Only the `accept` transition ever writes `Task.assigneeId` — creating, declining, and cancelling are pure `TaskAssignment` state changes.

**Implementation status:** M8 implemented `create` and `cancel` (`PENDING`/`CANCELLED`) plus FR-13/EC-5's mutation freeze. M9 adds `accept`/`decline` and the resulting `Task.assigneeId` write — all four transitions (create/cancel/accept/decline) are now implemented; only M10's post-acceptance creator visibility (FR-32) and a sent-assignments list (FR-29) remain outstanding.

### What each assignment state means for the task (FR-13/EC-5)

| Assignment state | `assigneeId` | Who's responsible | Read / list visibility | Task mutations |
|---|---|---|---|---|
| No assignment / none `PENDING` | unchanged | current assignee | normal | allowed |
| `PENDING` | **unchanged** | current assignee (unchanged) | normal — task still appears in Tasks/Today/Schedule exactly as before | **frozen**: edit, status change (including complete), cancel-the-task, and delete are all rejected with `ConflictError` (409). The sender may still cancel the *assignment* — that's the one action available that isn't a plain read. |
| `CANCELLED` | unchanged | current assignee (unchanged) | normal | allowed again, immediately |
| `DECLINED` | unchanged | current assignee (unchanged) — decline restores full normal control, same as cancel | normal | allowed again, immediately |
| `ACCEPTED` | **changes to the recipient**, atomically with the transition | recipient | normal for the recipient (now the assignee); **(M10)** the original creator additionally retains permanent read-only access (FR-32) — `scheduledAt` masked to `null` for them, everything else visible — but never regains list visibility (Tasks/Today/Schedule/search stay assignee-scoped) | allowed again, for the new assignee only — the creator, even with read access, can never `PATCH`/`DELETE` |

The freeze is enforced in `TaskService.updateTask`/`deleteTask`, which only ever call `TaskRepository.updateIfNotPending`/`deleteIfNotPending` — see §8's "Enforcing the pending-assignment mutation freeze" for the concurrency mechanism, which mirrors FR-21's own database-level guarantee rather than relying on a service-level check alone.

Note that the creator's read-only access above is not actually gated by *this* table's assignment states at all — it follows purely from `Task.creatorId` vs. `Task.assigneeId` (§3), independent of whatever `TaskAssignment` row(s) exist or their status. It's listed on the `ACCEPTED` row only because that's the transition that first makes creator ≠ assignee true.

### Transactional boundaries

- **Create assignment**: insert `TaskAssignment` (`PENDING`). No write to `Task` at all — `assigneeId` is untouched, so the task's responsible party never has a gap.
- **Decline / cancel**: update `TaskAssignment.status`/`respondedAt` only. Again, no write to `Task`.
- **Accept**: update `TaskAssignment.status`/`respondedAt` **and** `Task.assigneeId := toUserId` in a single Prisma transaction, so the assignment can never be observed as `ACCEPTED` while the task still shows the old assignee, or vice versa.

The accept transaction always applies the recipient's `scheduledAt` choice (FR-30) — a specific value, or `null` for "schedule later"; the field is required, not optional, so there's no default to reason about — so acceptance and initial scheduling can't be observed as separate, inconsistent steps. The sender's prior `scheduledAt` is never read by this path at all; it's simply overwritten with whatever the recipient's request body contains.

This is simpler than the alternative (clearing `assigneeId` on create and restoring it on decline/cancel): only one transition — accept — ever needs to touch `Task` at all, and there is never a window where a task has no responsible party.

## 7. Extensibility: Deferred Features and Their Additive Schema Path

None of these are built in v1. They're listed to show the current design doesn't box them out.

| Future feature | Schema change | Why it's additive |
|---|---|---|
| **Recurring tasks** | New `RecurringTaskTemplate` table (owner, title, defaults, recurrence rule) + nullable `Task.templateId` FK | `Task` stays a single concrete occurrence; a scheduler process reads templates and inserts ordinary `Task` rows. No existing column changes. |
| **Push notifications** | New `DeviceToken` table (`userId`, `platform`, `token`, `createdAt`) | Purely additive; notification-sending reads existing `TaskAssignment` events, no change to task/assignment tables. |
| **Collaboration / teams** | New `Workspace` + `WorkspaceMembership` tables, nullable `Task.workspaceId` | `Task` ownership model (`creatorId`/`assigneeId`) is unchanged; a workspace is an optional extra grouping, not a replacement for per-user assignee-ship. |
| **Smart scheduling** | Likely no schema change (reads `priority`/`deadline`/`scheduledAt`); at most an additive `estimatedDurationMinutes` on `Task` | It's a read-side algorithm over existing fields, not a new data relationship. |
| **Category as a managed entity** | New `Category` table (`userId`, `name`, `color`) + `Task.categoryId` replacing the string, with a data migration copying distinct strings into rows | Only needed if per-user category management (rename/delete/color) becomes a requirement; today's string field is a strict subset of that model. |
| **Full-text task search at scale** | Postgres `tsvector` column + GIN index on `Task` | Additive column/index; `ILIKE` queries are simply replaced, no relational changes. |
| **Full-text/fuzzy user search at scale** | `pg_trgm` extension + GIN index on `User.username`/`User.name`, or a dedicated search index | Additive; today's `ILIKE`/`contains` approach (see §5 caveat) is a strict subset with no relational changes needed to replace it. |

## 8. Migration Strategy

`prisma migrate dev` in development, with every migration file committed and reviewed like any other code change. `prisma migrate deploy` runs in CI/CD against staging/production. No manual schema edits outside of migrations.

### Adding a required, unique column to a populated table (M7 example)

`User.username` had to become required and unique on a table that already had rows (every account created in M1-M6). Doing this in one migration would fail the moment Postgres tried to enforce `NOT NULL` against existing `NULL`s. The safe sequence, used here and worth repeating for any future required column on a populated table:

1. **Add nullable.** `username String?` (still `@unique` — Postgres allows multiple `NULL`s in a unique index, so this is non-destructive) — migration `add_username_nullable`.
2. **Backfill.** A one-off script (`apps/api/prisma/backfillUsernames.ts`) fills in every row where `username IS NULL`. For local/dev data (no real users yet), it derives a candidate from the email local-part, sanitizes it through the exact same `usernameSchema` real registrations use, and appends a numeric suffix on collision until it's unique. Nothing is deleted or recreated.
3. **Require.** `username String` (drop the `?`) — migration `require_username`. By this point every row already satisfies `NOT NULL` and the unique constraint, so this migration is a no-op risk-wise; it only formalizes what's already true.

This pattern generalizes beyond usernames: nullable-add → backfill script → make-required, always as separate migrations, never one migration that assumes existing rows already comply.

### Enforcing "at most one PENDING assignment per task" as a database constraint (M8)

FR-21 requires that creating a `TaskAssignment` fail if the task already has one `PENDING`. A service-layer "check, then insert if nothing found" is **not** safe under concurrency: two requests can both pass the check before either has inserted, and both then insert — Postgres has no way to know they were supposed to be mutually exclusive unless a constraint says so.

Prisma's `schema.prisma` DSL has no syntax for a **partial/filtered unique index** (unique only where a `WHERE` clause holds) — still true as of Prisma 5.22.0, the version used here — so this constraint is added by hand in the migration's raw SQL, alongside the Prisma-generated statements:

```sql
CREATE UNIQUE INDEX "TaskAssignment_one_pending_per_task"
  ON "TaskAssignment" ("taskId")
  WHERE "status" = 'PENDING';
```

This is a real Postgres constraint: it allows unlimited non-`PENDING` rows per `taskId` (preserving history, per EC-6) while guaranteeing at most one `PENDING` row, enforced atomically by the database itself regardless of how many requests race. A second concurrent insert doesn't wait and silently fail — it's rejected outright by the index with error code `P2002`, which the repository catches and translates into a domain `DuplicatePendingAssignmentError` → `ConflictError` (409).

The service layer still runs its own `findPendingByTaskId` pre-check before attempting the insert — not as the safety guarantee (the index is), but so the common, non-racing case gets a clean error without relying on catching a database exception, and so the error message can be specific without probing Postgres error internals in the hot path. Verified empirically: firing 5 concurrent `POST /tasks/:taskId/assignments` requests at the same task yields exactly one `201` and four `409`s, with exactly one `PENDING` row in the database afterward.

Because `schema.prisma` cannot express this index, it is **not** reflected in the `model TaskAssignment { ... }` block in §4 above — same limitation as any Prisma-DSL-only view of the schema. Anyone regenerating migrations from the Prisma schema alone (e.g. `prisma migrate diff --from-empty`) would need to re-add this index by hand; it is not something `prisma db pull`/introspection would reconstruct from the DSL either, though it *would* show up in `prisma db pull` against the live database, since it's a real index Postgres knows about.

### Enforcing the pending-assignment mutation freeze (FR-13/EC-5, M8)

The same "don't rely on a service-level check alone" principle applies to FR-13/EC-5: blocking task mutations while a `PENDING` assignment exists is enforced as an **atomic conditional write**, not a check-then-act service call.

`TaskRepository.updateIfNotPending`/`deleteIfNotPending` use Prisma's relational `none` filter, which compiles the "no pending assignment" condition directly into the `UPDATE`/`DELETE` statement's own `WHERE` clause (a `NOT EXISTS` subquery against `TaskAssignment`), e.g. conceptually:

```sql
UPDATE "Task" SET ...
WHERE id = $1
  AND NOT EXISTS (
    SELECT 1 FROM "TaskAssignment" WHERE "taskId" = $1 AND status = 'PENDING'
  );
```

"Is there a pending assignment" and "apply the edit" happen as one statement — the same compare-and-swap idiom as `cancelIfPending` above, and structurally analogous to FR-21's partial unique index (a real database-level check, not just an application-level one). `TaskService` still runs a `findPendingByTaskId` pre-check first, purely for a clean, immediate `ConflictError` in the non-racing case — exactly mirroring how the create-assignment pre-check relates to its own database guarantee.

**Concurrency guarantee, precisely stated:** this closes the check-then-act race for any two operations whose executions don't overlap within the same in-flight database statement — in practice, this covers effectively all real concurrent access, since each statement's Postgres snapshot is taken at execution start and the two statements involved (the assignment `INSERT`, the task `UPDATE`/`DELETE`) are each a single round trip with no user-controlled delay in between. What it does **not** close: if a task mutation's `UPDATE` and a concurrent assignment `INSERT` are dispatched by Postgres closely enough that the `UPDATE`'s snapshot is taken microseconds before the `INSERT` commits, the `UPDATE` can still succeed — because the two statements touch different tables and never contend for the same row lock, there's no mechanism forcing them into a serialized order the way two `UPDATE`s on the same `Task` row would be. Fully closing this would require the assignment-creation transaction to also take an explicit `SELECT ... FOR UPDATE` lock on the `Task` row before inserting, forcing a genuine wait/serialization against any concurrent task mutation.

**Why that's not implemented now:** unlike FR-21's race (which is triggerable by two different concurrent requests attempting the same action, and was given the stronger database-constraint treatment for exactly that reason), this residual window requires the *same* principal — only the task's current assignee can create an assignment on it — to fire two conflicting requests within a sub-millisecond window of each other. The realistic trigger is a double-tap or two-tabs-open self-collision, not an adversarial or cross-user scenario, and the outcome of losing the race is a last-write-wins style edge case, not a security or data-integrity breach. Given that, explicit row locking (with its added latency and cross-table deadlock surface between `Task` and `TaskAssignment`) is deferred rather than added speculatively — worth revisiting if usage patterns ever show otherwise, e.g. before a security hardening pass (see ARCHITECTURE.md §6).

Verified empirically two ways: (1) firing 5 concurrent `PATCH` requests against a task with an *already-committed* `PENDING` assignment — fully deterministic, since the assignment's commit strictly precedes all five — and confirming all 5 are rejected with 409; (2) racing a `PATCH` against a concurrent assignment-`POST` on a fresh task and confirming the database ends up in a self-consistent state either way (the task's stored fields match whichever result the `PATCH` actually got, `assigneeId` is unchanged, and exactly one `PENDING` row exists) — this does not, and cannot, distinguish the benign ordering from the theoretical sub-statement race described above, since both look identical in the end state.

### The M9 acceptance transaction and its concurrency guarantee

FR-25 requires that accepting an assignment update two rows — `TaskAssignment.status`/`respondedAt` and `Task.assigneeId`/`scheduledAt` — such that neither can ever be observed without the other. `taskAssignmentRepository.acceptPendingAssignment` does this with a single Prisma **interactive transaction** (`prisma.$transaction(async (tx) => {...})`, a real `BEGIN`/`COMMIT`/`ROLLBACK` — not the `$transaction([...])` batch form, which can't express "only do the second write if the first one actually matched"):

```ts
return await prisma.$transaction(async (tx) => {
  const assignmentUpdate = await tx.taskAssignment.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "ACCEPTED", respondedAt: new Date() },
  });
  if (assignmentUpdate.count === 0) throw new AssignmentNotPendingError();

  const taskUpdate = await tx.task.updateMany({
    where: { id: taskId, assigneeId: fromUserId },
    data: { assigneeId: toUserId, scheduledAt },
  });
  if (taskUpdate.count === 0) throw new AssignmentNotPendingError();

  return tx.taskAssignment.findUniqueOrThrow({ where: { id }, include });
});
```

Both writes reuse the same atomic-conditional-`updateMany` idiom as `cancelIfPending`/`declineIfPending`/`updateIfNotPending`: a `WHERE` clause tied to the exact state being transitioned *from*, not a read-then-write. If either affects zero rows, the callback throws, Prisma rolls back the whole transaction, and the repository function returns `null` — the service maps that to `ConflictError`. The `Task` write's `assigneeId: fromUserId` clause is defense in depth, not the primary guard: structurally, `assigneeId` can only equal `fromUserId` while this assignment is `PENDING` (the partial unique index guarantees no sibling `PENDING` row could have already raced it to `ACCEPTED`), but the transfer is still conditioned on it explicitly rather than assumed.

**Why this closes EC-3 for every pair of resolution attempts, not just double-accept:** cancel (M8), decline, and accept's *first* write all gate on the identical condition — `UPDATE "TaskAssignment" ... WHERE id = ? AND status = 'PENDING'` — against the identical row. Postgres takes a row lock on a match; a second concurrent statement against that same row (whether it's another accept, a decline, or a cancel) blocks until the first transaction commits or rolls back, then re-evaluates its own `WHERE` clause against the new committed state (ordinary `UPDATE` semantics under `READ COMMITTED` — no `SERIALIZABLE` isolation or explicit locking needed). Since the row's `status` is no longer `'PENDING'`, the second statement's `updateMany` matches zero rows, and whichever transition it belongs to correctly reports `ConflictError`. This is the "one coherent state machine" property: because every resolution path shares the identical guard on the identical row, they compose correctly with each other automatically, not by virtue of any one of them knowing the other two exist.

Verified empirically as real concurrent HTTP requests (not just a unit-level simulation) in `tests/integration/inbox.integration.test.ts`: 5 simultaneous accepts on the same assignment → exactly 1×200, 4×409; accept raced against decline → exactly one 200; accept raced against a sender cancel → exactly one 200; decline raced against cancel → exactly one 200; and a three-way race (accept + decline + cancel all at once) → the assignment always lands in exactly one of `ACCEPTED`/`DECLINED`/`CANCELLED`, and `Task.assigneeId` always agrees with whichever one won (the recipient only for `ACCEPTED`, the sender for either of the other two) — never a contradictory combination.

### M10: Sent (FR-29) and creator visibility (FR-32) needed no schema change

Both of M10's features are read paths over the existing `Task`/`TaskAssignment` schema exactly as designed back in M8 — `Task.creatorId`/`assigneeId` already distinguished the two roles, and `TaskAssignment` already recorded every sender/recipient pair with its own status. M10 added no table, no column, and no migration: `findSentByUser` is a new *query* (`WHERE fromUserId = ?`, all statuses) against the same table `findInboxForRecipient` already used, and creator read-access is a widened *authorization check* (`findVisibleTaskOrThrow`) against the same `Task` row `findOwnTaskOrThrow` already fetched. This is exactly the additive-schema outcome §2's design goals aimed for.

### Assignment history and task deletion: an accepted v1 limitation, revisited for Sent (EC-17)

M8 gave `TaskAssignment.task` an `onDelete: Cascade` FK so that deleting a task (only reachable with no `PENDING` assignment in the way) takes its assignment history with it, rather than either blocking the delete or leaving orphaned rows. That was a reasonable call *at the time*, before any UI read that history back. M10's Sent list is the first feature where a deleted task's history being gone is actually user-visible: if Rami sends a task to Daniel, Daniel declines, and Rami then deletes the task (he's still the assignee — decline never transferred anything), that assignment vanishes from Rami's own Sent list too, not just from the (now-nonexistent) task.

This was evaluated as part of M10, not overlooked: fixing it properly would mean either (a) snapshotting the task's fields onto the `TaskAssignment` row at creation/resolution time (so Sent/Inbox never depended on the live `Task` row surviving), or (b) soft-deleting tasks instead of hard-deleting them. Both are genuine schema changes — new columns or a new `deletedAt`-style lifecycle affecting every existing task query — not something to introduce as a side effect of a read-only history feature. Given the actual v1 usage pattern (a personal/small-group delegation tool, not an audit-trail product), and that the user is only ever surprised by the *absence* of a row, never shown incorrect data, this is documented as a known limitation and explicitly deferred rather than fixed speculatively — see the M10 report for the recommendation to revisit if a future milestone specifically wants durable assignment history independent of task lifetime.
