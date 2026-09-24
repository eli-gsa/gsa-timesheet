# GSA Timesheet — go-live setup

Everything that can be built without your accounts has been built: the full
Next.js app (timesheet grid, agents, projects & rates, reports/CSV export,
audit log, settings, Google sign-in) and the complete Supabase database
schema with row-level security. What's left is account creation and a
handful of values only you can provide — there's no more code to write to
reach a working live site.

Total hands-on time: roughly 30–45 minutes.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project (the
   Free tier works to start — see the go-live plan doc for the Free vs Pro
   tradeoff, mainly backups). On the creation form's **Security** section:
   leave **Enable Data API** checked (required), uncheck **Automatically
   expose new tables** (the migrations below grant access explicitly
   instead, matching the RLS policies), and check **Enable automatic RLS**
   as a free safety net for any table added later outside these migrations.
2. In **Project Settings → API**, copy:
   - `Project URL` → this is `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. In the Supabase SQL Editor, run the three migration files **in order**:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_seed.sql` — **edit the two placeholder values
     at the top first**: your real Workspace domain and your real admin
     email. Without this step nobody can sign in.

## 2. Create a Google OAuth client (for Workspace sign-in)

1. In [Google Cloud Console](https://console.cloud.google.com), create (or
   reuse) a project, then **APIs & Services → Credentials → Create
   Credentials → OAuth client ID** (type: Web application).
2. Authorized redirect URI: use the callback URL Supabase shows you in
   **Authentication → Providers → Google** (looks like
   `https://<your-project>.supabase.co/auth/v1/callback`).
3. Copy the generated Client ID and Client Secret into Supabase's Google
   provider settings (**Authentication → Providers → Google**) and enable it.
4. In the same Google Cloud project, if you want to *require* the Workspace
   domain at the Google consent-screen level too (belt-and-braces, on top of
   the domain check already enforced in the database), restrict the OAuth
   consent screen to your internal Workspace organization.

## 3. Set environment variables

Copy `.env.example` to `.env.local` for local development, and set the same
three values as **Environment Variables** in the Vercel project (Production
+ Preview):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_WORKSPACE_DOMAIN=yourcompany.com
```

## 4. Deploy to Vercel

1. Push this project to a GitHub repo (or upload it directly in the Vercel
   dashboard).
2. In Vercel, **Add New Project**, import the repo, set the three
   environment variables from step 3, and deploy. Framework preset
   (Next.js) is auto-detected — no build config changes needed.
3. Once deployed, go back to Supabase → **Authentication → URL
   Configuration** and set the **Site URL** and **Redirect URLs** to your
   Vercel domain (e.g. `https://timesheet.yourcompany.com/auth/callback` and
   the bare domain), otherwise Google will redirect back to `localhost`.

## 5. Try it

1. Visit the deployed URL, sign in with the admin email you put in
   `admin_emails` (step 1). You should land on **Overview** with the admin
   nav.
2. Add a project or two (**Projects** page), assign agents to them.
3. Have a couple of agents sign in — they'll appear automatically on the
   **Agents** page as `agent` role the moment they first sign in.
4. Log a few hours on **My Timesheet**, confirm **Reports → Export CSV**
   and **Audit log** are populating.

## What was deliberately simplified vs. the HTML prototype

- **Audit log entries are per bulk action, not per cell.** Selecting 20
  timesheet slots and assigning them to a project logs one audit row
  ("Project X × 20 slot(s)"), not 20 separate rows. This keeps the audit
  table from exploding on ordinary use; say the word if you'd rather have
  per-cell granularity.
- **Overview's project chart is a simple bar list**, not the prototype's
  zoomable bar/pie/line chart switcher. Easy to extend later if wanted.
- **Adding a brand-new agent happens by them signing in**, not through an
  "Add agent" form in the app — matches the decided model (you provision the
  email on Google Workspace; they appear here on first login). You *can*
  pre-approve an email as admin, and manage allowed domains, from the
  **Settings** page without touching SQL again after initial setup.
- **Historical data import**: not started — you mentioned you'll provide
  the historical spreadsheet later. Once you have it, send it over and it
  can be loaded straight into `timesheet_entries` (and `leads`/`rates` if
  it covers those) via a one-off script against the Supabase database.

## What's still genuinely a decision, not a default

- Whether to keep this on Vercel's free Hobby tier long-term or fold it
  into another Vercel Pro team — see the go-live plan doc's cost section.
  Hobby's ToS is non-commercial-use only, so this is a build/launch-phase
  arrangement rather than a permanent answer; nothing about the app itself
  needs to change either way.
- Supabase Free vs Pro — Free has zero backups, which is the main reason
  Pro ($25/mo) was recommended once this is real payroll-adjacent data.
