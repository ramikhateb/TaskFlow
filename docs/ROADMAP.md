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

## M9 — Inbox, Accept & Decline

- Delivers FR-25–FR-29, EC-3, EC-6 (decline/accept side).
- Endpoints: `GET /assignments/inbox`, `POST /assignments/:id/accept`, `POST /assignments/:id/decline`.
- Mobile: Inbox screen with accept/decline actions.
- Tests: integration tests for accept and decline transactions, concurrent double-response (EC-3), and reassignment after decline (EC-6).

**Exit criteria**: the full "assign → Inbox → accept/decline" loop works end-to-end between two real accounts; `assigneeId` changes only on accept, and is unaffected by decline.

## M10 — Post-Acceptance Scheduling & Creator Visibility

- Delivers FR-30–FR-32.
- `accept` endpoint accepts an optional `scheduledAt`.
- Read endpoints updated so the original creator retains read-only access to a task they no longer hold (FR-32).
- Mobile: schedule-on-accept UI; creator's read-only view of tasks they created but don't own.
- Tests: integration tests confirming deadline/priority/category persist unchanged through acceptance, and that the creator can read but not write after handoff.

**Exit criteria**: the full journey in PRODUCT.md ("assign → accept → scheduled") works exactly as described, with correct creator/assignee visibility on both sides.

## M11 — Authorization & Edge-Case Hardening

- Cross-cutting pass explicitly re-verifying every rule in REQUIREMENTS.md §2 and every edge case in §3 with targeted tests (some will already be covered by earlier milestones — this milestone closes any gaps rather than re-deriving from scratch).
- Includes EC-7 (delete with assignment history) and any timing/race conditions not yet covered.

**Exit criteria**: a checklist pass over REQUIREMENTS.md §2/§3 with a test reference for every line.

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
