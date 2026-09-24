-- GSA Timesheet — core schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- agents: one row per signed-in person, keyed to auth.users(id).
-- Created automatically by the handle_new_user() trigger in 0002_rls.sql the
-- first time someone signs in with Google — you never insert here by hand,
-- except to seed admin_emails/allowed_domains before anyone has logged in.
-- ---------------------------------------------------------------------------
create table public.agents (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'agent' check (role in ('admin','agent')),
  active boolean not null default true,
  view_start_slot int not null default 0,  -- 30-min slot index, 0 = 00:00
  view_end_slot int not null default 48,   -- 48 = 24:00 (full day)
  created_at timestamptz not null default now()
);
comment on table public.agents is 'One row per person who has signed in. Role admin/agent controls access everywhere else.';

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#2a78d6',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.project_agents (
  project_id uuid not null references public.projects(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  primary key (project_id, agent_id)
);

create table public.rates (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  rate numeric(10,2) not null,
  effective_from date not null,
  created_at timestamptz not null default now()
);
create index rates_agent_project_idx on public.rates(agent_id, project_id, effective_from);

create table public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_date date not null,
  slot int not null check (slot >= 0 and slot < 48),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, entry_date, slot)
);
create index timesheet_entries_agent_date_idx on public.timesheet_entries(agent_id, entry_date);

create table public.lead_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  period text not null, -- 'YYYY-MM'
  name text not null default '',
  type text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_agent_project_period_idx on public.leads(agent_id, project_id, period);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  actor_id uuid references public.agents(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  entry_date date,
  field text not null,
  old_value text,
  new_value text
);
create index audit_log_ts_idx on public.audit_log(ts desc);

create table public.settings (
  key text primary key,
  value jsonb not null
);

-- Domain(s) allowed to sign in (Google Workspace). handle_new_user() rejects
-- anyone outside this list even if Google auth itself succeeded, as defense
-- in depth alongside the `hd` parameter set in the app's login page.
create table public.allowed_domains (
  domain text primary key
);

-- Emails that should become role='admin' the first time they sign in.
-- Add every future admin's email here before they log in for the first time;
-- editing an existing agent's role afterward is just `update agents set role=...`.
create table public.admin_emails (
  email text primary key
);
