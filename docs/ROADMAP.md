# Roadmap

Each milestone is small enough to implement, test, and commit on its own, and leaves the app in a working state. Milestones are sequential — later ones depend on earlier ones being done. Requirement IDs reference [REQUIREMENTS.md](./REQUIREMENTS.md). Items explicitly out of v1 are listed at the bottom and are not scheduled.

## M1 — Monorepo & Tooling Scaffolding

- npm workspaces (`apps/mobile`, `apps/api`, `packages/shared`).
- `apps/api`: Express + TypeScript skeleton, env validation (fail-fast on boot), `/health` endpoint.
- `apps/mobile`: Expo + Expo Router + TypeScript skeleton, TanStack Query and Zustand installed and wired (unused).
- PostgreSQL via Docker Compose locally; Prisma initialized with an empty schema.
- ESLint/Prettier/`tsc --noEmit` configured across all workspaces.

**Exit criteria**: `npm run dev` boots both apps; mobile can reach the API health check; lint/typecheck clean; nothing else yet.

## M2 — Authentication

- Delivers FR-1–FR-6.
- `User` and `RefreshToken` Prisma models + migration.
- Endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- Password hashing, JWT issuance/verification middleware, refresh rotation + family revocation (EC-9).
- Mobile: register/login screens, SecureStore session storage, API client with automatic refresh-on-401.
- Tests: unit tests on the auth service (hashing, token rotation logic); integration tests on all five endpoints including EC-9 and EC-10.

**Exit criteria**: a user can register and log in on-device; refresh and logout work; reusing a revoked refresh token is rejected.

## M3 — Core Task CRUD

- Delivers FR-7 (initial subset: title, description, status only — priority/category/dates come in M4), FR-9, FR-10 (self-owned case), FR-11, FR-12.
- `Task` model (creator = assignee only at this stage; no assignment yet).
- Endpoints: `POST /tasks`, `GET /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id`, `DELETE /tasks/:id`.
- Mobile: task list, create/edit form, complete/delete actions.
- Tests: unit tests on status-transition rules (FR-12); integration tests on full CRUD + authorization (can't touch another user's task).

**Exit criteria**: a user can fully manage their own simple tasks end-to-end on-device.

## M4 — Extended Task Attributes

- Delivers the rest of FR-7 and FR-8: `priority`, `category`, `scheduledAt`, `deadline`.
- Migration adding the new columns/enum; validation schema updates in `packages/shared`.
- Mobile: form fields and list/detail display for the new attributes.
- Tests: validation edge cases (EC-11 empty title still rejected; invalid enum values rejected).

**Exit criteria**: a task can carry all v1 fields; existing M3 tests still pass unchanged against the extended model.

## M5 — Today View & Schedule View

- Delivers FR-14, FR-15, FR-17.
- Endpoints: `GET /tasks/today`, `GET /tasks/schedule`.
- Mobile: Today and Schedule screens/tabs.
- Tests: unit tests on the Today-view query logic (scheduled-today ∪ due-today ∪ overdue, deduplicated); integration test with client-supplied day boundaries (EC-8).

**Exit criteria**: Today and Schedule views show correct data across a day boundary in a non-UTC timezone, verified in tests.

## M6 — Search & Filter (Own Tasks)

- Delivers FR-16.
- `GET /tasks` gains `status`/`priority`/`category`/`q` query params.
- Mobile: filter controls and search box on the task list.
- Tests: integration tests per filter and in combination.

**Exit criteria**: a user can narrow their task list by any supported filter combination.

## M7 — User Search & Product Identity

- Delivers FR-1a (username), updated FR-1/FR-6, FR-18 (updated: username/name, not email), FR-19, FR-19a.
- `User.username` added: unique, case-insensitively normalized, required going forward. Existing (pre-M7) rows backfilled via a deterministic script — see DATABASE.md §8 for the nullable-add → backfill → make-required sequence.
- Registration now collects name, username, email, password. Login is unchanged (still email + password) — email remains the sole authentication identifier; username is purely for discovery/collaboration.
- Endpoint: `GET /users/search` — matches username/name substrings, **never** email; excludes the caller; query bounded 2-50 chars; results capped at 20, deterministically ordered (exact username → prefix → other substring → name match).
- New shared `PublicUser` contract (`id`/`name`/`username` only) — distinct from the authenticated user's own `UserProfile` (which still includes `email`).
- Mobile: registration screen collects username with validation feedback; reusable user-search component (used later by M8's assignment flow); Profile screen shows the user's own `@username`.
- Tests: registration (valid/duplicate/case-insensitive-duplicate/invalid-chars/too-short/too-long username), search (username/name match, case-insensitivity, `@`-prefix handling, ordering, self-exclusion, query-length bounds, result cap, email never searched/returned), and a full regression pass confirming M2-M6 behavior is unchanged.

**Exit criteria**: a user can find another registered user by name or username (never email), see only their `id`/`name`/`username`, and existing email/password login/registration-adjacent flows continue to work exactly as before.

## M8 — Task Assignment — Create & Cancel

- Delivers FR-13, FR-20, FR-21, FR-22, FR-23, FR-24, EC-1, EC-2, EC-4, EC-5, EC-6 (history preservation for create/cancel).
- `TaskAssignment` model + migration (DATABASE.md §4), including a hand-written **partial unique index** (`taskId` `WHERE status = 'PENDING'`) as the real concurrency guarantee behind FR-21 — see DATABASE.md §8 for why a service-layer check-then-insert alone was rejected.
- Endpoints (nested under `/tasks`, not a flat `/assignments` root — see ARCHITECTURE.md §3): `POST /tasks/:taskId/assignments`, `POST /tasks/:taskId/assignments/:assignmentId/cancel`. `GET /tasks/:id` additively gains a `pendingAssignment` field. No `GET /assignments/sent` or other list endpoint yet (M9).
- `TaskAssignmentResponse` embeds `fromUser`/`toUser` as M7's `PublicUser` (no email exposure).
- FR-13/EC-5: `PATCH`/`DELETE /tasks/:id` reject with 409 while the task has a `PENDING` assignment, via the same atomic-conditional-write pattern as FR-21 (DATABASE.md §8) — not a service-only check. `TaskAssignment.task`'s FK is `onDelete: Cascade` (EC-7) so a delete, once actually reachable, takes its now-history assignment rows with it.
- Mobile: "Assign to someone" flow on the task detail screen reusing M7's `UserSearchField` exactly; a pending-assignment banner (name/@username) with a cancel button, computed from the task detail query's new field — no new query key, no assignment state on the task list/Today/Schedule. While pending, the edit form's fields and the Save/complete/delete actions are visibly disabled with an inline explanation, mirroring the server-side freeze.
- Tests: unit tests on every rejection path (self-assign, already-pending, non-assignee sender, wrong task status, mutation-while-pending) plus simulated-race tests; integration tests including a real 5-concurrent-request race on create (exactly 1×201, 4×409), a deterministic all-rejected concurrent-PATCH-while-pending race, a create-vs-patch race (self-consistency, not full serializability — see DATABASE.md §8), and history preservation across cancel → re-assign.

**Exit criteria**: a user can send a task to another user as a pending request and cancel it before response; `Task.assigneeId` never changes as a result; duplicate concurrent PENDING assignments on the same task are impossible even under a real race; and a task with a PENDING assignment is frozen against edits/status-changes/deletion (server-enforced) while remaining fully visible and readable in Tasks/Today/Schedule.

## M9 — Inbox, Accept & Decline + Recipient Scheduling

- Delivers FR-25, FR-26, FR-27, FR-28, FR-30, FR-31, EC-3, EC-6 (decline/accept side). Pulls FR-30 (recipient scheduling) forward from its originally-planned M10 slot — Option B scheduling is part of what makes "accept" a complete, usable action, not a separate step. **Does not** deliver FR-29 (sent-assignments list) or FR-32 (creator read-only visibility after transfer) — both explicitly deferred, see M10 below.
- Endpoints: `GET /assignments/inbox` (recipient's `PENDING` requests, newest first, via the existing `@@index([toUserId, status])` — no pagination, no `userId` query param), `POST /assignments/:assignmentId/accept` (body: `{ scheduledAt: string | null }`, required not optional), `POST /assignments/:assignmentId/decline`. Flat under `/assignments`, not nested under `/tasks/:taskId` like M8's create/cancel — see ARCHITECTURE.md §3.
- The acceptance transaction (`taskAssignmentRepository.acceptPendingAssignment`) flips `TaskAssignment` to `ACCEPTED` and writes `Task.assigneeId`/`scheduledAt` in one Prisma interactive transaction, using the same atomic-conditional-`updateMany` idiom as M8's `cancelIfPending` for both writes — see DATABASE.md §8. This is also what makes accept/decline/cancel mutually exclusive under concurrency (EC-3): all three gate on `WHERE status = 'PENDING'` against the same row, so ordinary Postgres row-locking resolves any race between them with no extra locking.
- FR-30: the recipient's `scheduledAt` choice always replaces the sender's previous value (a specific timestamp, or `null` for "schedule later") — the sender's prior `scheduledAt` is never read by the accept path. Validated against the task's existing `deadline` server-side (EC-13) before the transaction runs; "schedule later" is always valid regardless of deadline.
- `InboxAssignmentResponse`/`InboxTaskSummary`: a dedicated contract, not a reuse of `TaskAssignmentResponse`/`TaskResponse` — deliberately excludes the sender's `scheduledAt` (personal planning state, about to be replaced) and `toUser` (always the caller). See ARCHITECTURE.md §3.
- Mobile: Inbox added as a fifth tab (Today/Schedule/Tasks/Inbox/Profile); a request-detail screen (`app/(app)/inbox-detail/[id].tsx`, hidden-from-tab-bar stack sibling, same pattern as `tasks/`) showing sender/task/message with Decline/Accept actions; Accept opens an inline scheduling step (reusing M4's `DateTimeField`) offering "choose a date/time" or "schedule later" before actually submitting.
- Tests: unit tests on every accept/decline authorization and state-conflict path, scheduling validation (before/after deadline, schedule-later, sender's value replaced), and a double-accept concurrency simulation; integration tests for the Inbox query (visibility, ordering, exclusions, field shape), decline, accept, scheduling, Today/Schedule reuse post-acceptance, sender-side access loss, and four concurrency races fired as real concurrent HTTP requests (double-accept, accept-vs-decline, accept-vs-cancel, decline-vs-cancel, plus a three-way race) — all resolving to exactly one terminal state with `assigneeId` agreeing with the winner.

**Exit criteria**: the full "assign → Inbox → accept (with scheduling) / decline" loop works end-to-end between two real accounts; `assigneeId` changes only on `ACCEPTED`, is unaffected by `DECLINED`/`CANCELLED`, and no concurrent pair of resolution attempts can both succeed.

## M10 — Sent Assignments & Creator Visibility After Transfer

- Delivers FR-29, FR-32, EC-16 (historical participation ≠ standing access), EC-17 (documents, doesn't fix, the existing EC-7 cascade's effect on Sent history). No schema change/migration — both features are read paths over the M8 schema; see DATABASE.md §8.
- Endpoint: `GET /assignments/sent` — every assignment the caller has sent (`fromUserId` from the JWT only), **all** statuses (unlike Inbox's PENDING-only), newest first. No status filter (not requested; a client narrows locally if it wants to). `SentAssignmentResponse`/`SentAssignmentsResponse` are dedicated contracts reusing Inbox's task-summary mapping (`toTaskSummary`) — same "no scheduledAt" rule, for the same reason.
- `GET /tasks/:id` read authorization widened to assignee OR creator (`TaskService.findVisibleTaskOrThrow`, new) while `PATCH`/`DELETE` stay assignee-only (`findOwnTaskOrThrow`, unchanged since M3) — two separate functions, deliberately, so `creatorId` can never leak into a mutation check. The response additively gains `assignee`/`creator` (`PublicUser`) and a server-computed `viewer: { isAssignee, isCreator, canEdit, canDelete }`; `scheduledAt` is masked to `null` for a non-assignee (creator-only) viewer specifically, since it's the current assignee's personal planning state — `completedAt` and everything else remain visible.
- Transfer chains verified explicitly: a historical intermediate assignee/sender (neither the original creator nor the current assignee) gets the same enumeration-safe 404 as an unrelated stranger on the current task, but can still see their own historical row in their own Sent list — "has a `TaskAssignment` row" and "may read the current task" are kept as two separate authorization questions.
- Mobile: Sent added as a second view on the existing Inbox tab (an in-screen Incoming/Sent toggle, not a sixth tab or a new route) — readable status labels (Pending/Accepted/Declined/Cancelled), never color-only; a PENDING row keeps the existing M8 cancel action inline; tapping any row opens the existing `/tasks/:id` screen, which now renders a distinct read-only view (no Save/Mark Done/Delete/editable fields, no scheduledAt, an "Assigned to X · @y" notice) whenever `viewer.isAssignee` is `false`.
- Tests: unit + integration coverage for Sent (visibility, all four statuses, multi-row history, ordering, no email/no scheduledAt) and creator visibility (read/write matrix for creator/assignee/unrelated user, scheduledAt masking, list-isolation across Tasks/Today/Schedule/search, and the full transfer-chain scenario) — full list in the M10 report.

**Exit criteria**: the full journey in PRODUCT.md ("assign → accept → scheduled") has correct creator/assignee visibility on both sides; a user can review the assignments they've sent regardless of outcome; and none of M10's read-access widening leaks into assignee-scoped list views or into mutation authorization.

## M11 — Authorization, Security, State-Machine, and Edge-Case Hardening

A cross-cutting audit pass, not a feature milestone: every documented authorization, privacy, mass-assignment, state-machine, and concurrency invariant from M2-M10 was re-verified against the actual running system (cross-user attack matrix with 4 named accounts, malicious/malformed payloads, an exhaustive 9-combination assignment-state negative-transition matrix, a direct repository-level audit of the M9 acceptance transaction's rollback behavior, expired-token/expired-refresh-token coverage, and explicit response-privacy negative assertions across every collaboration endpoint). The audit found the existing M2-M10 implementation already correct in every case tested — no authorization bypass, mass-assignment, or state-machine violation was reproduced. The gaps closed were in **test coverage**, not application logic, plus two small mobile UX fixes (surfacing a `PATCH`/`DELETE`/cancel failure inline instead of silently doing nothing on a stale/raced action, matching the error-surfacing pattern already used elsewhere).
- Also verified directly against both Postgres databases (not just `prisma migrate status`, which only proves a migration *ran*): the `TaskAssignment_one_pending_per_task` partial unique index, all documented indexes, and every FK's cascade/restrict behavior — now a durable `$queryRaw`-based regression test, not a one-time manual check.
- EC-17 (hard-delete cascades assignment history) reviewed only, per the fix policy — confirmed to still match schema/docs, not redesigned into soft-deletion.
- No schema change, no new migration — this milestone touches tests and two small mobile UI fixes only.

**Exit criteria**: every core domain invariant in the M11 audit brief has at least one integration test exercising it directly against the real API and database; all M2-M10 regression tests remain green; no invariant violation found remains unfixed.

## M12 — Polish & Store Readiness

- Empty/loading/error states across all screens; form validation surfaced in UI.
- App icons, splash screens, store metadata, EAS build configuration for iOS/Android.
- Baseline accessibility pass (labels, contrast, dynamic type).
- Security review against ARCHITECTURE.md §6 before any store submission.

**Exit criteria**: an EAS build installs and runs on a physical iOS and Android device; app is submittable to TestFlight / Play internal testing.

## Deferred — Not Scheduled Yet

Out of v1 per PRODUCT.md; each would get its own milestone if/when prioritized. DATABASE.md §7 shows each has an additive schema path from the MVP design:

- Recurring tasks.
- Push notifications / real-time (WebSockets) updates.
- Offline-first support.
- AI / smart scheduling.
- Chat / comments.
- Teams / workspaces, shared task ownership.
- Sub-tasks, attachments.
- Password reset, email verification, OAuth login.
- Category as a managed entity, full-text search at scale.
