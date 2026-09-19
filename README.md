# Nudge

Turn intentions into progress. Nudge is a personal task manager with one thing most to-do apps don't have: **assignment with consent**. You can hand a task to someone else, but it only lands on their schedule if they explicitly accept it — nothing is ever imposed on a recipient's calendar.

_Internally the codebase, database, and npm packages still use the working name "taskflow" (e.g. `@taskflow/api`, the `taskflow` database) — only the user-facing product name changed to Nudge. See [docs/RELEASE.md](docs/RELEASE.md) for why those weren't renamed too._

See [docs/PRODUCT.md](docs/PRODUCT.md) for the full product vision and v1 scope.

## What it does (v1)

- Email/password auth with a separate public `@username` used for discovery (email is never searchable).
- Full task CRUD: title, description, priority, category, `scheduledAt` (when you plan to do it), `deadline` (when it's due), and status.
- **Today** (overdue / scheduled today / due today) and **Schedule** (plan-ahead) views.
- Search and filter your own tasks by status, priority, category, and free text.
- Assign a task to exactly one other user; they see it in their **Inbox** and choose to accept (picking when it goes on their schedule) or decline — the sender stays responsible until then.
- **Sent** view of every assignment you've made, and permanent (read-only) creator visibility into a task even after it's been handed off.

Full requirements and edge cases: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Architecture & stack

- **Monorepo**: npm workspaces, no build orchestrator — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- `apps/api` — Node/Express/TypeScript, layered `Route → Middleware → Validation → Controller → Service → Repository → PostgreSQL`, Prisma ORM.
- `apps/mobile` — Expo/React Native/TypeScript, Expo Router for navigation, TanStack Query for server state, Zustand for local UI state only.
- `packages/shared` — Zod schemas and types imported by both apps, so request/response shapes can't drift between them.
- PostgreSQL via Docker Compose locally.

Schema and indexing rationale: [docs/DATABASE.md](docs/DATABASE.md). Milestone-by-milestone build history: [docs/ROADMAP.md](docs/ROADMAP.md).

## Prerequisites

- Node.js 20+ and npm
- Docker (for local PostgreSQL)
- Expo Go on a physical device, or an iOS/Android simulator, to run the mobile app

## Setup

```bash
npm install
```

### 1. Database

```bash
docker compose up -d
```

Starts Postgres on `localhost:5432` with the credentials in `docker-compose.yml` (local dev only — not secrets).

### 2. API environment

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and set a real `JWT_ACCESS_SECRET` (32+ characters — the app fails fast at boot if it's missing or too short):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`DATABASE_URL` in the example already points at the Docker Compose database above.

### 3. Run migrations

```bash
cd apps/api
npx prisma migrate dev
```

This also creates `taskflow_test`, a separate database the integration test suite runs against — see `apps/api/tests/setupEnv.ts`.

### 4. Mobile environment

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

The default (`http://localhost:3000`) works for the iOS simulator out of the box. For an Android emulator, use `http://10.0.2.2:3000`. **For a physical device via Expo Go**, set it to your machine's LAN IP instead (e.g. `http://192.168.1.23:3000`) — find it with `ipconfig getifaddr en0` (macOS) or `ipconfig` (Windows), and make sure the phone is on the same Wi-Fi network as your machine.

## Running it

```bash
npm run dev
```

Runs the API (`http://localhost:3000`) and Expo dev server together. Or run them independently:

```bash
npm run dev -w apps/api       # API only
npm run dev -w apps/mobile    # Expo only
```

Scan the QR code with Expo Go (physical device) or press `i`/`a` for a simulator/emulator.

## Tests & quality checks

```bash
npm run test          # all workspaces (API integration+unit, mobile unit)
npm run typecheck      # tsc --noEmit across all workspaces
npm run lint           # eslint
npm run format:check   # prettier --check
```

API integration tests run against the real `taskflow_test` Postgres database (created by `prisma migrate dev` above) — no mocking of the database layer.

## Project structure

```
taskflow/
├── apps/
│   ├── mobile/    # Expo / React Native / TypeScript
│   └── api/       # Node / Express / TypeScript
├── packages/
│   └── shared/    # Zod schemas & types shared by both apps
├── docs/          # Product, requirements, architecture, database, roadmap
└── docker-compose.yml
```

## Documentation

| Doc                                                      | Covers                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| [docs/PRODUCT.md](docs/PRODUCT.md)                       | Vision, target users, core journeys                          |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)             | Functional requirements, authorization rules, edge cases     |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)             | Layering, API surface, error handling, security              |
| [docs/DATABASE.md](docs/DATABASE.md)                     | Schema, indexing, concurrency/transaction design             |
| [docs/ROADMAP.md](docs/ROADMAP.md)                       | Milestone-by-milestone build history                         |
| [docs/RELEASE.md](docs/RELEASE.md)                       | Release/store-readiness status and remaining owner decisions |
| [docs/PHYSICAL_TEST_PLAN.md](docs/PHYSICAL_TEST_PLAN.md) | Step-by-step manual test script for real devices             |
