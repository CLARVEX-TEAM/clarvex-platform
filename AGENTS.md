# AGENTS.md

## Project Vision

CLARVEX Team is a premium retail operations platform focused on store managers, assistant managers and sales associates.

The application must feel like a modern SaaS product comparable to Linear, Stripe Dashboard, Notion, Apple Business Manager and modern retail platforms.

Every screen must be mobile-first.

---

## Design System

### Visual Style

* Premium enterprise SaaS
* Modern glassmorphism
* Dark mode first
* Black background (#0A0A0A)
* Neon green accent (#00FF66)
* High contrast typography
* Clean spacing
* Minimal borders
* Smooth animations

### UX Rules

* Never create ugly admin panels.
* Avoid generic Bootstrap appearance.
* Every screen must look production ready.
* Every card must have hierarchy.
* Use loading states.
* Use empty states.
* Use hover states.
* Use subtle animations.

### Mobile Rules

* Mobile-first design.
* Must work perfectly on Android.
* Bottom navigation required.
* Large touch targets.
* Sticky actions when appropriate.

---

## Component Standards

Create reusable components:

* Button
* Card
* KPI Card
* Progress Card
* Activity Feed
* Status Badge
* User Avatar
* Notification Card
* Task Card

Never duplicate UI logic.

---

## Dashboard Standards

Manager dashboard must include:

* Store performance
* Team performance
* Pending tasks
* Critical alerts
* Daily plans
* Rankings

Associate dashboard must include:

* Daily target
* Daily sales
* KPI progress
* Schedule
* Daily plan
* Notifications

---

## Data Visualization

Use modern charts.

Preferred:

* Recharts

KPI cards must include:

* Trend
* Delta
* Progress
* Visual indicator

---

## Notifications

Design a complete notification system:

* Push notifications
* Read status
* Priority levels
* Notification center

---

## Code Quality

* TypeScript strict mode.
* No any types.
* Reusable hooks.
* Reusable services.
* Clean architecture.
* Server actions when possible.
* Prisma ORM.
* PostgreSQL.

---

## Future Features

Design architecture ready for:

* AI assistant
* Multi-store support
* Regional managers
* Retail analytics
* Performance reviews
* Commission calculations
* Attendance tracking
* Task automation

Always build with scalability in mind.

---

## Cursor Cloud specific instructions

Single Next.js 15 (App Router) PWA backed by PostgreSQL via Prisma. `pnpm` is the package manager. The update script runs `pnpm install` + `pnpm exec prisma generate` on startup; everything below is not handled automatically and must be done by the agent when needed.

### PostgreSQL
* PostgreSQL 16 is installed locally (not Docker). Start it before running the app or DB-backed tests: `sudo pg_ctlcluster 16 main start` (idempotent; safe if already running).
* Role `clarvex` (password `CambiaEstaPasswordSegura123`), databases `clarvex_team` (dev) and `clarvex_test` (tests). The password value is intentional: `tests/security-protection.test.ts` hardcodes it as the expected prod URL.
* Data persists in the VM snapshot, so migrations/seed generally only need re-running after schema changes: dev = `pnpm exec prisma migrate deploy` + `pnpm exec tsx prisma/seed.ts`; test = same `migrate deploy` against `clarvex_test` then `NODE_ENV=test ALLOW_INTEGRATION_TEST_DATABASE=true pnpm exec tsx tests/seed-test-db.ts`.

### Env files (gitignored, pre-created in the VM)
* `.env` and `.env.local` hold the dev config; `.env.test` holds the test config (see `docs/testing/SAFE_TEST_ENVIRONMENT.md` and `.env.example`). If missing, recreate from those templates.
* Non-obvious: the test-safety check (`tests/helpers.ts`) reads the prod `DATABASE_URL` from `.env` (not `.env.local`). `.env` must point at `clarvex_team` and `.env.test` at a DB whose name contains `test`, or seeding/tests abort.

### Running the dev server
* `pnpm dev` (port 3000). Standard commands are in `README.md` / `package.json`.
* Critical caveat: never start the dev server (or any `next` process) with `NODE_ENV=test` or `ALLOW_INTEGRATION_TEST_DATABASE` set. `lib/prisma.ts` has a guard that throws (HTTP 500 on every route) unless those two are consistent, and `next dev` forces `NODE_ENV=development` internally, so a test-flavored env can never be satisfied. Watch for these leaking via an inherited/tmux environment; start with a clean env if in doubt.
* Login: seeded users `81893` (GERENTE), `102259` (SUBGERENTE), `95739` (ASESOR) were given PIN `1234` during setup. Brand-new users have no PIN and PIN setup requires an authenticated manager/subgerente (see `app/api/auth/employee-login/route.ts`); set a PIN directly with bcrypt (`hashPin`) if you need a fresh login.

### Lint / typecheck / test / build (matches `.github/workflows/ci.yml`)
* `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (158 unit tests, needs `clarvex_test` migrated+seeded), `pnpm audit --audit-level=high`. `pnpm test:security-protection` also passes.
* Known-broken: `pnpm test:integration` fails because it spawns `next dev` with `NODE_ENV=test`, which Next forces back to `development`, tripping the `lib/prisma.ts` guard. It is not part of CI. The harness also SIGKILLs only the parent, leaving orphaned `next-server` processes on port 3101 — kill them by PID if you hit `EADDRINUSE`.
