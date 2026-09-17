# Architecture

## 1. Repository Structure

npm workspaces monorepo, no build-orchestration tool (Turborepo/Nx) for v1 — the project is small enough that plain `npm run` scripts per workspace are sufficient. Revisit if build/test times become painful.

```
taskflow/
├── apps/
│   ├── mobile/          # Expo / React Native / TypeScript app
│   └── api/              # Node / Express / TypeScript API
├── packages/
│   └── shared/           # Types & Zod schemas shared between mobile and api
├── docs/
├── package.json           # workspace root
└── tsconfig.base.json
```

`packages/shared` holds Zod schemas for every request/response shape, imported by both `apps/api` (to validate) and `apps/mobile` (to type API calls and parse responses). This is the single most important structural decision for keeping the two apps honest with each other without a code generator.

## 2. Mobile App Architecture (`apps/mobile`)

### Layering

- **Screens (`app/`, Expo Router)** — route-level components (Today, Schedule, Task Detail, Inbox, Search, etc.). Own layout and navigation only; no business logic or direct API calls.
- **Features (`src/features/<feature>/`)** — feature-scoped hooks, components, and API-call wrappers: `src/features/tasks`, `src/features/assignments`, `src/features/users`. TanStack Query hooks live here (`useTodayTasks`, `useCreateTask`, `useInbox`, `useRespondToAssignment`, `useUserSearch`, etc.).
- **API client (`src/api/`)** — a thin typed HTTP client (fetch wrapper) that attaches the auth header, handles the access/refresh token flow, and parses responses against the shared Zod schemas. No React or Query code here.
- **State**:
  - **Server state** (tasks, assignments, user profile, search results) lives in **TanStack Query** — it owns caching, refetch-on-focus, and invalidation after mutations. This is the primary source of truth for anything that originates from the API.
  - **Client/UI state** — the current session's access token in memory, active filter selections on the task list, form drafts, UI toggles — lives in **Zustand**, used only where a screen genuinely needs shared local state; a screen with only its own `useState` doesn't get a store. Zustand never caches server data, to avoid two caches disagreeing.
- **Persistence**: the refresh token lives in Expo SecureStore, not Zustand/AsyncStorage, since it's a credential.

### Data flow

`Screen → feature hook (TanStack Query) → API client → Express API`. Mutations invalidate the relevant query keys on success (e.g. accepting an assignment invalidates the Inbox, Today, and Schedule queries at once). Combined with refetch-on-focus, this is how the "no offline, no push" v1 model stays simple: the client re-asks the server for truth after any state-changing action and whenever the app regains focus.

## 3. API Architecture (`apps/api`)

### Layering

```
Route (Express router)
  → Middleware (auth: verify JWT, attach req.user)
  → Validation (Zod schema on req.body/params/query, from packages/shared)
  → Controller (translates HTTP <-> domain call, no business logic)
  → Service (business logic: authorization checks, state transitions)
  → Repository (Prisma calls only — no business logic)
  → PostgreSQL
```

- **Routes** wire HTTP verbs/paths to controllers and declare applicable middleware.
- **Middleware** handles cross-cutting concerns: JWT verification, request logging, error translation.
- **Validation** happens once, at the boundary, with shared Zod schemas. Everything past this layer assumes its input shape is already correct.
- **Controllers** are thin: parse the validated request, call one service method, shape the HTTP response. No business-rule branching here.
- **Services** hold domain logic — authorization decisions (REQUIREMENTS.md §2), state transitions (DATABASE.md §6), and transaction boundaries. E.g. `AssignmentService.accept(assignmentId, userId, scheduledAt?)` checks `userId` is the recipient, the assignment is `PENDING`, and performs the transactional update.
- **Repositories** are the only layer that imports the Prisma client, keeping Prisma out of business logic and services unit-testable against a fake repository.

### API Boundaries

Resource-oriented REST, grouped by domain. Every route except `/auth/register` and `/auth/login` requires `Authorization: Bearer <accessToken>`.

**Auth**
| Method & Path | Purpose |
|---|---|
| `POST /auth/register` | Create an account |
| `POST /auth/login` | Exchange credentials for access + refresh tokens |
| `POST /auth/refresh` | Rotate refresh token, issue new access token |
| `POST /auth/logout` | Revoke current refresh token |
| `GET /auth/me` | Current user's profile |

**Tasks**
| Method & Path | Purpose |
|---|---|
| `GET /tasks` | List own tasks; query: `status`, `priority`, `category`, `q`, `cursor` |
| `GET /tasks/today` | Today view (FR-14) — server computes the union, given client day boundaries |
| `GET /tasks/schedule` | Schedule view (FR-15); query: `from`, `to` (UTC instants) |
| `POST /tasks` | Create a task (creator = assignee) |
| `GET /tasks/:id` | Task detail (assignee or creator only) |
| `PATCH /tasks/:id` | Update fields, including `status` (assignee only, no pending assignment) |
| `DELETE /tasks/:id` | Delete (assignee only, no pending assignment) |

**Users**
| Method & Path | Purpose |
|---|---|
| `GET /users/search` | Search by username or display-name substring — **never email**; query: `q` (2-50 chars after normalization). Authenticated only; excludes the caller; results capped at 20 (FR-18/FR-19a) |

**Assignments**
| Method & Path | Purpose |
|---|---|
| `POST /assignments` | Create (`taskId`, `toUserId`, optional `message`) |
| `GET /assignments/inbox` | Assignments received; query: `status` (default `PENDING`) |
| `GET /assignments/sent` | Assignments sent; query: `status` |
| `POST /assignments/:id/accept` | Accept; optional `scheduledAt` in body |
| `POST /assignments/:id/decline` | Decline |
| `POST /assignments/:id/cancel` | Cancel (sender only, pre-response) |

Accept/decline/cancel are modeled as action endpoints rather than a generic `PATCH /assignments/:id` because each transition has different side effects (only `accept` touches `Task.assigneeId`, and optionally `scheduledAt` — see DATABASE.md §6). A single generic PATCH would hide that these aren't interchangeable field writes.

List endpoints return `{ data: T[], nextCursor?: string }` (cursor pagination). Timestamps are ISO 8601 UTC on the wire; the mobile app converts to device-local time for display and computes day boundaries client-side before sending them to `/tasks/today` and `/tasks/schedule` (per DATABASE.md EC-8).

## 4. Error Handling Strategy

Services throw typed domain errors; a single error-handling middleware maps them to a consistent JSON shape and HTTP status. Controllers never construct error responses by hand.

| Error type | HTTP status | Example |
|---|---|---|
| `ValidationError` | 400 | Zod schema failure (includes field-level detail) |
| `UnauthenticatedError` | 401 | Missing/invalid/expired access token |
| `ForbiddenError` | 403 | Authenticated, but not authorized for this task/assignment (REQUIREMENTS.md §2) |
| `NotFoundError` | 404 | Task/assignment/user id doesn't exist or isn't visible to the caller |
| `ConflictError` | 409 | Duplicate email, pending assignment already exists, double accept/decline, refresh token reuse |
| `InternalError` | 500 | Unexpected failure; logged with a correlation id, generic message returned to the client |

Response shape:

```json
{ "error": { "code": "FORBIDDEN", "message": "...", "details": {} } }
```

A `NotFoundError` is deliberately returned (rather than `ForbiddenError`) when a user references a task/assignment they have no visibility into at all, so as not to confirm the id's existence to someone with no relationship to it; a `ForbiddenError` is used when the resource is visible but the action isn't permitted (e.g. trying to edit a task you can only read).

## 5. Testing Strategy

Applied per milestone in [ROADMAP.md](./ROADMAP.md) — every milestone ships with the tests covering what it adds, not as a separate later phase.

- **Unit tests (services)** — Jest, against a fake/mock repository. Cover business logic and authorization branches: state transitions, "no pending assignment" checks, self-assignment rejection, etc. Fast, no database.
- **Integration tests (API)** — Jest + Supertest against a real Postgres instance (Dockerized, migrated fresh per test run) and the real Prisma client. Cover full request → response behavior including validation, auth middleware, and the error-mapping table above. This is where transactional correctness (DATABASE.md §6) and concurrency edge cases (EC-3, EC-9) are exercised.
- **Contract checks** — since `apps/mobile` and `apps/api` both import the same `packages/shared` Zod schemas, `tsc --noEmit` across the workspace is itself a meaningful contract check; no separate codegen/diffing step is needed.
- **Mobile component tests** — React Native Testing Library, targeted at the flows with real logic: task form validation, Inbox accept/decline, Today/Schedule filtering. Not a full-coverage mandate — screens that are pure layout aren't tested this way.
- **Manual/device verification** — each milestone with a UI component is run on an iOS and Android simulator/device before being considered done, per the project's development principles.
- End-to-end (Detox or similar) and CI pipeline automation are deferred past v1; not needed at this project's current size, and premature before the app has enough surface area to justify the maintenance cost.

## 6. Security Considerations

- **Transport**: HTTPS only outside local development.
- **Secrets**: JWT signing secret and database URL come from environment variables (validated at boot, per §7), never committed; least-privilege database credentials.
- **Passwords**: bcrypt/argon2 with a modern cost factor; never logged.
- **Tokens**: short-lived access tokens (~15 min target); refresh tokens stored server-side as hashes, rotated on every use, with reuse-of-a-retired-token revoking the whole family (DATABASE.md §4, EC-9).
- **Authorization**: enforced exclusively in the service layer from the verified token's user id — never from a client-supplied id, header, or body field.
- **Enumeration resistance**: login returns a generic "invalid credentials" message regardless of whether the email exists (EC-10); this is separate from — and not undermined by — the authenticated-only user search feature (FR-18), which is an intentional discovery surface, not an unauthenticated one.
- **Identity separation (M7)**: email is the private authentication credential; username is the public product identity used for discovery. User search matches and returns only `id`/`name`/`username` — email is never a search predicate and never appears in a search response, so the discovery surface can't be used to check whether a given email address has an account. Query-length bounds and a result cap (FR-19a) further limit this endpoint's use for account enumeration. Production hardening consideration (not implemented in v1, no rate-limiting infrastructure exists in this architecture yet): rate-limit `GET /users/search` per user/IP.
- **Input validation**: every mutating and parameterized endpoint validated by Zod before touching business logic; Prisma's parameterized queries prevent SQL injection by construction.
- **Dependency hygiene**: `npm audit` (or equivalent) as part of the CI gate once CI is introduced (see ROADMAP.md M1).
- **CORS**: API restricts allowed origins to known clients (Expo dev client / EAS build origins); not left open by default.

## 7. Environment & Config Strategy

- `apps/api` reads configuration (database URL, JWT secrets, token TTLs, port) from environment variables, validated at process startup with a Zod schema so the process fails fast on misconfiguration rather than at first request.
- `apps/mobile` uses Expo's env/config system (`app.config.ts` + `EXPO_PUBLIC_*` vars) to select the API base URL per environment (local/dev/staging/prod). No secrets live in the mobile bundle — only a public API base URL.
- Local development runs PostgreSQL via Docker Compose.

## 8. Key Architectural Decisions (recap)

| Decision | Choice | Rationale |
|---|---|---|
| Collaboration model | 1:1 user-to-user assignment, no teams/workspaces | Matches v1 product scope; DATABASE.md §7 shows teams can be added additively later |
| Creator vs. assignee | Two separate, always-populated FKs on `Task`; `assigneeId` changes only on assignment `ACCEPTED` | Directly implements the product's "distinguishable roles" requirement; keeps "who's responsible" well-defined at all times, including while an assignment is pending |
| Notifications | In-app, refetch-on-focus only | No push infra needed for v1; TanStack Query refetch + invalidation covers the UX need |
| Offline support | None — online-only | Avoids local persistence + conflict resolution complexity before it's needed |
| Recurrence / smart scheduling | Deferred | Adds real complexity; DATABASE.md §7 shows both are additive later |
| Category | Free-text string, not an entity | No per-user category management requirement yet; upgrade path is additive |
| Server state vs. UI state | TanStack Query owns server data; Zustand owns client/UI state only, and only where actually shared | Prevents two disagreeing caches; keeps each tool doing one job |
| Shared types | `packages/shared` Zod schemas imported by both apps | Single source of truth for request/response shapes without a codegen step |
| Refresh tokens | Opaque, hashed, rotated per use, family-revocable | Enables revocation and reuse detection, unlike self-contained JWTs |
| Assignment transitions | Dedicated action endpoints (`/accept`, `/decline`, `/cancel`), not generic PATCH | Each transition has side effects beyond a field write; hiding that behind PATCH would be misleading |
| Monorepo tooling | npm workspaces, no Turborepo/Nx | Project is small enough that extra build orchestration isn't justified yet |
| Identity model (M7) | Email = private auth credential (login only); username = public product identity (discovery/collaboration only) | Keeps the sign-in credential out of any surface visible to other users; search/public-profile responses never contain email, so there's no code path where the two are conflated |
| Username uniqueness | Always store pre-normalized (trimmed, lowercased, "@" stripped) + a plain Postgres `@unique` constraint | Case-insensitive uniqueness without a `citext` extension or collation trick — two different-case inputs normalize to the same stored string before the constraint ever sees them |
