# GSA Timesheet

Next.js + Supabase rebuild of the GSA Timesheet prototype (`hours-ledger.html`).
Google Workspace sign-in, role-based access (admin/agent), a slot-based
timesheet grid, per-project leads, rates, reports with CSV export, and an
audit log.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **Supabase**: Postgres + Auth (Google OAuth) + Row Level Security
- **Vercel** for hosting

## First-time setup

See [`SETUP.md`](./SETUP.md) — it covers everything that needs your
accounts: creating the Supabase project, running the SQL migrations,
configuring the Google OAuth client, setting environment variables, and
deploying to Vercel. Nothing in this list requires writing more code.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the three values, see SETUP.md
npm run dev
```

## Project structure

```
src/app/(app)/        protected pages (timesheet, team, projects, reports, audit, settings)
src/app/login/        Google sign-in page
src/app/auth/callback/  OAuth callback route
src/lib/supabase/     Supabase client helpers (browser/server/middleware)
src/lib/actions/      Server actions (mutations, all audit-logged)
src/lib/types.ts      Shared types mirroring the DB schema
src/proxy.ts          Session refresh + route protection (Next.js 16's `middleware` → `proxy`)
supabase/migrations/  SQL schema, RLS policies, and seed data — run in order
```
