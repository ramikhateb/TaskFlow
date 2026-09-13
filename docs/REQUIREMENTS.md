# Requirements

Scope: v1, as defined in [PRODUCT.md](./PRODUCT.md). Anything not listed here is out of scope for the current milestone. Requirement IDs (`FR-x`, `NFR-x`, `EC-x`) are referenced from [ROADMAP.md](./ROADMAP.md) to trace which milestone delivers what.

## 1. Functional Requirements

### 1.1 Authentication & Accounts

- FR-1 A visitor can register with an email, password, and display name; emails are unique.
- FR-2 A registered user can log in with email + password and receive an access token and a refresh token.
- FR-3 A user can use a valid refresh token to obtain a new access token without re-entering credentials; each refresh rotates the refresh token (the old one is invalidated).
- FR-4 A user can log out, which revokes their current refresh token.
- FR-5 Passwords are stored only as salted hashes, never in plain text or logs.
- FR-6 An authenticated user can fetch their own profile (id, email, name).

Deferred: password reset, email verification, OAuth/social login, multi-device session management UI.

### 1.2 Task Fields & Lifecycle

- FR-7 A task has: `title` (required), `description` (optional), `priority` (`LOW`/`MEDIUM`/`HIGH`/`URGENT`, defaults to `MEDIUM`), `category` (optional free-text label), `scheduledAt` (optional date/time), `deadline` (optional date/time), and `status` (`TODO`/`IN_PROGRESS`/`DONE`/`CANCELLED`, defaults to `TODO`).
- FR-8 `scheduledAt` (when the assignee plans to work on it) and `deadline` (when it must be done by) are independent fields; neither implies the other.
- FR-9 An authenticated user can create a task for themselves (creator = assignee).
- FR-10 The assignee of a task can update any of its fields.
- FR-11 The assignee of a task can mark it complete (status → `DONE`) or delete it.
- FR-12 Status transitions are restricted to: `TODO ⇄ IN_PROGRESS ⇄ DONE`, and any of `TODO`/`IN_PROGRESS`/`DONE` → `CANCELLED`. `CANCELLED` is terminal.
- FR-13 A task with a `PENDING` assignment (see §1.4) cannot be edited, completed, or deleted by anyone until that assignment is resolved (accepted/declined/cancelled).

### 1.3 Today View, Schedule View, Search & Filter

- FR-14 The Today view returns the authenticated user's tasks (as assignee) where `scheduledAt` falls today, or `deadline` falls today, or `deadline` is in the past and status is not `DONE`/`CANCELLED` (overdue) — deduplicated if a task matches more than one condition.
- FR-15 The Schedule view returns the authenticated user's tasks (as assignee) with `scheduledAt` within a given date range, ordered by `scheduledAt`.
- FR-16 A user can list their own tasks (as assignee) filtered by any combination of `status`, `priority`, `category`, and a free-text search over `title`/`description`.
- FR-17 "Today" is computed against day boundaries the client supplies (as UTC instants), so it reflects the user's device-local calendar day, not the server's.

### 1.4 User Search

- FR-18 An authenticated user can search for other users by name or email substring, receiving only `id`, `name`, and `email` for matches.
- FR-19 Search results exclude the requesting user themselves.

### 1.5 Task Assignment

- FR-20 The assignee of a task can assign it to exactly one other registered user (selected via user search), optionally with a short message.
- FR-21 Creating an assignment requires no other assignment on that task currently be `PENDING`.
- FR-22 Creating an assignment sets it to `PENDING`; the task's `assigneeId` is **not** changed by this — the sender remains the responsible party until (and unless) the assignment is accepted.
- FR-23 A user cannot assign a task to themselves.
- FR-24 The user who created a `PENDING` assignment can cancel it before the recipient responds; the assignment becomes `CANCELLED` and `assigneeId` is unaffected (it never changed).
- FR-25 The recipient of a `PENDING` assignment can accept it: in the same transaction, the assignment becomes `ACCEPTED` and the task's `assigneeId` changes to the recipient.
- FR-26 The recipient of a `PENDING` assignment can decline it: the assignment becomes `DECLINED` and `assigneeId` is unaffected (it never changed) — responsibility was never transferred, so there's nothing to revert.
- FR-27 Only the recipient may accept/decline; only the sender may cancel; both must be `PENDING` to act on.
- FR-28 A user can view their Inbox: assignments sent to them, filterable by status (default `PENDING`).
- FR-29 A user can view assignments they've sent, filterable by status.

### 1.6 Scheduling After Acceptance

- FR-30 When accepting an assignment, the recipient may optionally set the task's `scheduledAt` in the same action, or leave it unset and schedule later.
- FR-31 The task's `deadline`, `priority`, `category`, `title`, and `description` as set by the creator carry over unchanged through the assignment; the new assignee can edit them afterward like any task they're the assignee of.
- FR-32 The original creator retains permanent read access to the task (title, status, assignee, deadline) after assignment, but not write access, unless they are also the current assignee.

### 1.7 In-App Notifications (v1: no push)

- FR-33 On app foreground/focus, the client refetches Inbox and sent-assignment data so counts/lists reflect the latest server state.
- FR-34 No push notifications, email, or SMS are sent for any event in v1.

## 2. Authorization Rules

| Action | Who is allowed |
|---|---|
| Read a task | Current assignee, or the creator (read-only if not also the assignee) |
| Create a task | Any authenticated user (for themselves) |
| Update / complete / delete a task | Current assignee only, and only when the task has no `PENDING` assignment |
| Create an assignment on a task | Current assignee only, and only if no `PENDING` assignment exists on it already |
| Cancel an assignment | The sender (`fromUserId`), only while `PENDING` |
| Accept / decline an assignment | The recipient (`toUserId`), only while `PENDING` |
| Read an assignment | The sender or the recipient |
| Search users | Any authenticated user |

All checks are enforced server-side in the service layer (see [ARCHITECTURE.md](./ARCHITECTURE.md)), independent of client UI. No endpoint infers the acting user from anything other than the verified JWT.

## 3. Important Edge Cases

- **EC-1 Self-assignment.** Assigning a task to oneself is rejected with a validation error (FR-23).
- **EC-2 Assigning to a nonexistent user.** Rejected as a validation/not-found error before any state changes.
- **EC-3 Double response.** Accepting or declining an assignment that is no longer `PENDING` (already resolved, or resolved concurrently) returns a conflict error; the second of two racing requests must not apply.
- **EC-4 Second assignment while one is pending.** Attempting to create a new assignment on a task that already has a `PENDING` assignment is rejected (FR-21).
- **EC-5 Edits during a pending assignment.** Any edit/delete/complete attempt on a task with a `PENDING` assignment is rejected (FR-13), even though `assigneeId` still points at a valid, current assignee — the task is deliberately frozen while a transfer decision is outstanding, so the state the recipient is evaluating can't shift out from under them, and so acceptance always hands off a stable task. The only valid actions on it are cancel/accept/decline.
- **EC-6 Reassignment after decline/cancel.** Once an assignment is `DECLINED` or `CANCELLED`, the (unchanged) assignee can create a new assignment — to the same or a different user — producing a new `TaskAssignment` row; history of prior attempts is preserved, not overwritten.
- **EC-7 Deleting a task with assignment history.** Deleting a task is only possible when it has no `PENDING` assignment (FR-13), and removes/cascades its historical assignment rows.
- **EC-8 Timezone boundaries.** "Today" and date-range filters use client-supplied UTC boundaries (FR-17), so a task at 11:30pm local time is correctly included/excluded even though the server has no notion of the user's timezone.
- **EC-9 Refresh token reuse.** Using a refresh token after it has been rotated or revoked (logout) is rejected; detecting reuse of a rotated-out token revokes the entire token family as a precaution.
- **EC-10 Duplicate email registration.** Registration with an already-used email is rejected with a clear, non-account-enumerating message distinct from login's generic "invalid credentials" (login intentionally does not reveal whether the email exists).
- **EC-11 Empty/whitespace title.** Rejected at the validation layer (Zod), never reaching the service/database.
- **EC-12 Category free text.** Category has no fixed vocabulary in v1; filtering is by exact string match on whatever value the user has used before (see [DATABASE.md](./DATABASE.md) for the future dedicated-entity path).

## 4. Non-Functional Requirements

### Security

- All endpoints except registration/login require a valid JWT access token.
- All input validated at the API boundary with Zod (shared schemas with mobile) before reaching business logic.
- Passwords hashed with bcrypt or argon2; refresh tokens stored server-side as hashes so they're revocable.
- Refresh tokens rotate on every use; reuse of an invalidated token revokes the whole token family (EC-9).
- No endpoint trusts a client-supplied user id for authorization — the acting user always comes from the verified access token.
- Generic, non-enumerating error messages on login; user search (FR-18) is an intentional, authenticated-only discovery surface and doesn't weaken this, since it requires being logged in.

### Performance

- Standard API responses (list/detail/create/update) complete in well under 500ms under normal load on target infrastructure.
- List/search endpoints are paginated (cursor-based) rather than returning unbounded result sets.
- Today/Schedule/search queries are covered by database indexes (see [DATABASE.md](./DATABASE.md) §5) sized for the query patterns they serve.

### Reliability

- Task/assignment state transitions that touch multiple rows (e.g. assign, accept, decline, cancel) are atomic database transactions.
- The API returns structured, predictable error responses (see [ARCHITECTURE.md](./ARCHITECTURE.md) §Error Handling) so the client can handle failures consistently.

### Maintainability

- Strict separation of UI, validation, business logic, and data access layers (see ARCHITECTURE.md); no layer is skipped.
- Shared Zod schemas/types between mobile and API prevent contract drift.

### Platform Support

- iOS and Android via a single Expo/React Native codebase; current Expo SDK; two most recent major OS versions.

### Accessibility

- Interactive elements carry accessible labels; task status/priority is never conveyed by color alone.

## 5. Testing Strategy

See [ARCHITECTURE.md](./ARCHITECTURE.md) §Testing Strategy for the layered approach (unit tests on services, integration tests on API routes, targeted mobile component tests) and what each milestone is expected to cover.

## 6. Out of Scope (v1)

Restated from [PRODUCT.md](./PRODUCT.md): recurring tasks, push/real-time notifications, offline-first support, AI/smart scheduling, chat/comments, teams/workspaces, sub-tasks/attachments, password reset, email verification, OAuth.
