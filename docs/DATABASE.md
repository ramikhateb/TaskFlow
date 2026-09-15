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

For a self-created task these are always equal. Every authorization rule in REQUIREMENTS.md §2 keys off `assigneeId`, not `creatorId` — the creator's rights past a successful handoff are read-only (FR-32), which is exactly what "distinguishable... responsible for completing" means in practice.

**Invariant:** `assigneeId` is never null and never changes except as a direct, same-transaction consequence of a `TaskAssignment` transitioning to `ACCEPTED`. Creating an assignment (→ `PENDING`), cancelling it, or declining it leave `assigneeId` untouched — the current assignee stays responsible for the task throughout. This means a task always has exactly one responsible party, with no in-between "unowned" state to reason about, even while an assignment is being decided.

### Why assignment history isn't collapsed into the `Task` row

A task can be assigned, declined, and reassigned to someone else later (EC-6). Modeling each attempt as its own `TaskAssignment` row — rather than a couple of nullable columns on `Task` — keeps a full, queryable history and avoids overloading `Task` with fields that only make sense mid-assignment. `TaskAssignment.taskId` is intentionally **not unique**; the business rule "at most one `PENDING` assignment per task" (FR-21) is enforced in the service layer within a transaction, not as a structural constraint, because the table legitimately holds many non-pending rows per task over time.

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
  task   Task   @relation(fields: [taskId], references: [id])

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

## 5. Indexing Rationale

| Index | Serves |
|---|---|
| `Task(assigneeId, status)` | "List my tasks, optionally by status" (FR-16) |
| `Task(assigneeId, scheduledAt)` | Schedule view (FR-15), Today's "scheduled for today" clause (FR-14) |
| `Task(assigneeId, deadline)` | Today's "due today / overdue" clause (FR-14) |
| `Task(assigneeId, category)` | Category filter (FR-16) |
| `Task(creatorId)` | Creator's read-only view of tasks they authored but don't hold |
| `TaskAssignment(toUserId, status)` | Inbox (FR-28) |
| `TaskAssignment(fromUserId, status)` | Sent-assignments list (FR-29) |
| `TaskAssignment(taskId, status)` | Enforcing "no other pending assignment on this task" (FR-21) |
| `User(name)` | User search (FR-18) — combined with an `email` lookup (already unique-indexed) |

Free-text title/description search (FR-16) uses `ILIKE`/`contains` in v1, which is adequate at MVP scale without a dedicated search index; see §7 for the future full-text-search path.

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

### Transactional boundaries

- **Create assignment**: insert `TaskAssignment` (`PENDING`). No write to `Task` at all — `assigneeId` is untouched, so the task's responsible party never has a gap.
- **Decline / cancel**: update `TaskAssignment.status`/`respondedAt` only. Again, no write to `Task`.
- **Accept**: update `TaskAssignment.status`/`respondedAt` **and** `Task.assigneeId := toUserId` in a single Prisma transaction, so the assignment can never be observed as `ACCEPTED` while the task still shows the old assignee, or vice versa.

The accept transaction additionally applies `scheduledAt` if the recipient supplied one (FR-30), so acceptance and initial scheduling can't be observed as separate, inconsistent steps.

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

## 8. Migration Strategy

`prisma migrate dev` in development, with every migration file committed and reviewed like any other code change. `prisma migrate deploy` runs in CI/CD against staging/production. No manual schema edits outside of migrations.
