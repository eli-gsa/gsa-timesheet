-- GSA Timesheet — auth trigger + row level security
-- Run after 0001_schema.sql.

-- ---------------------------------------------------------------------------
-- Auto-create an agents row the first time someone signs in with Google.
-- Rejects sign-ins outside allowed_domains (belt-and-braces alongside the
-- `hd` restriction the app already sends to Google) and promotes emails
-- listed in admin_emails to role='admin'.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  email_domain text;
  is_allowed boolean;
  new_role text;
begin
  email_domain := split_part(new.email, '@', 2);

  select exists(select 1 from public.allowed_domains d where lower(d.domain) = lower(email_domain))
    into is_allowed;

  if not is_allowed then
    raise exception 'Sign-in blocked: % is not on an allowed domain', new.email;
  end if;

  select case when exists(
    select 1 from public.admin_emails a where lower(a.email) = lower(new.email)
  ) then 'admin' else 'agent' end into new_role;

  insert into public.agents (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper: is the currently-authenticated user an admin? SECURITY DEFINER so
-- it can read public.agents without being blocked by that table's own RLS
-- (which would otherwise recurse).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select role from public.agents where id = auth.uid()) = 'admin', false);
$$;

create or replace function public.current_agent_active()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select active from public.agents where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.agents enable row level security;
alter table public.projects enable row level security;
alter table public.project_agents enable row level security;
alter table public.rates enable row level security;
alter table public.timesheet_entries enable row level security;
alter table public.lead_types enable row level security;
alter table public.leads enable row level security;
alter table public.audit_log enable row level security;
alter table public.settings enable row level security;
alter table public.allowed_domains enable row level security;
alter table public.admin_emails enable row level security;

-- agents ----------------------------------------------------------------
create policy "agents: self or admin can select" on public.agents
  for select using (id = auth.uid() or public.is_admin());
create policy "agents: admin can insert" on public.agents
  for insert with check (public.is_admin());
create policy "agents: self or admin can update" on public.agents
  for update using (id = auth.uid() or public.is_admin());
create policy "agents: admin can delete" on public.agents
  for delete using (public.is_admin());

-- projects ----------------------------------------------------------------
create policy "projects: any signed-in agent can select" on public.projects
  for select using (public.current_agent_active() or public.is_admin());
create policy "projects: admin can insert" on public.projects
  for insert with check (public.is_admin());
create policy "projects: admin can update" on public.projects
  for update using (public.is_admin());
create policy "projects: admin can delete" on public.projects
  for delete using (public.is_admin());

-- project_agents ------------------------------------------------------------
create policy "project_agents: any signed-in agent can select" on public.project_agents
  for select using (public.current_agent_active() or public.is_admin());
create policy "project_agents: admin can insert" on public.project_agents
  for insert with check (public.is_admin());
create policy "project_agents: admin can update" on public.project_agents
  for update using (public.is_admin());
create policy "project_agents: admin can delete" on public.project_agents
  for delete using (public.is_admin());

-- rates (sensitive — admin only) --------------------------------------------
create policy "rates: admin can select" on public.rates
  for select using (public.is_admin());
create policy "rates: admin can insert" on public.rates
  for insert with check (public.is_admin());
create policy "rates: admin can update" on public.rates
  for update using (public.is_admin());
create policy "rates: admin can delete" on public.rates
  for delete using (public.is_admin());

-- timesheet_entries -----------------------------------------------------
create policy "entries: own or admin can select" on public.timesheet_entries
  for select using (agent_id = auth.uid() or public.is_admin());
create policy "entries: own or admin can insert" on public.timesheet_entries
  for insert with check (agent_id = auth.uid() or public.is_admin());
create policy "entries: own or admin can update" on public.timesheet_entries
  for update using (agent_id = auth.uid() or public.is_admin());
create policy "entries: own or admin can delete" on public.timesheet_entries
  for delete using (agent_id = auth.uid() or public.is_admin());

-- lead_types ------------------------------------------------------------
create policy "lead_types: any signed-in agent can select" on public.lead_types
  for select using (public.current_agent_active() or public.is_admin());
create policy "lead_types: admin can insert" on public.lead_types
  for insert with check (public.is_admin());
create policy "lead_types: admin can update" on public.lead_types
  for update using (public.is_admin());
create policy "lead_types: admin can delete" on public.lead_types
  for delete using (public.is_admin());

-- leads -------------------------------------------------------------------
create policy "leads: own or admin can select" on public.leads
  for select using (agent_id = auth.uid() or public.is_admin());
create policy "leads: own or admin can insert" on public.leads
  for insert with check (agent_id = auth.uid() or public.is_admin());
create policy "leads: own or admin can update" on public.leads
  for update using (agent_id = auth.uid() or public.is_admin());
create policy "leads: own or admin can delete" on public.leads
  for delete using (agent_id = auth.uid() or public.is_admin());

-- audit_log --------------------------------------------------------------
create policy "audit_log: admin can select" on public.audit_log
  for select using (public.is_admin());
create policy "audit_log: signed-in agent can insert own actions" on public.audit_log
  for insert with check (actor_id = auth.uid() or public.is_admin());

-- settings -----------------------------------------------------------------
create policy "settings: any signed-in agent can select" on public.settings
  for select using (public.current_agent_active() or public.is_admin());
create policy "settings: admin can insert" on public.settings
  for insert with check (public.is_admin());
create policy "settings: admin can update" on public.settings
  for update using (public.is_admin());

-- allowed_domains / admin_emails: admin only, needed only from the SQL editor
create policy "allowed_domains: admin can select" on public.allowed_domains
  for select using (public.is_admin());
create policy "allowed_domains: admin can manage" on public.allowed_domains
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_emails: admin can select" on public.admin_emails
  for select using (public.is_admin());
create policy "admin_emails: admin can manage" on public.admin_emails
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Table-level grants for the `authenticated` Postgres role (the role every
-- signed-in Supabase Auth user runs as via the Data API). Needed if your
-- project was created with "Automatically expose new tables" turned OFF
-- (recommended) — without these grants, PostgREST refuses every request
-- with a permission error before RLS even gets a say. The policies above
-- still govern which ROWS are visible/writable; these grants only say the
-- role may attempt the operation at all. No grants to `anon` anywhere —
-- every table here requires sign-in.
-- (If your project instead has auto-expose ON, this block is harmless —
-- it just restates grants that already exist.)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.agents to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_agents to authenticated;
grant select, insert, update, delete on public.rates to authenticated;
grant select, insert, update, delete on public.timesheet_entries to authenticated;
grant select, insert, update, delete on public.lead_types to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert on public.audit_log to authenticated;
grant select, insert, update on public.settings to authenticated;
grant select, insert, update, delete on public.allowed_domains to authenticated;
grant select, insert, update, delete on public.admin_emails to authenticated;
