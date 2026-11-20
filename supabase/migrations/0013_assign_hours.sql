-- GSA Timesheet — Assign Hours (weekly hours per agent per campaign).
-- Run after 0012_uk_time_storage.sql, BEFORE deploying the matching code.
-- Additive only; safe to re-run. Nothing existing is changed or deleted: logged
-- hours are untouched, and the old allocation tables (allocations,
-- allocation_entries, project_agents.allocated_hours) stay in place, unused.
--
-- hour_weeks        The week schedule of one campaign: any start/end dates
--                   (default Mon-Fri, but Tue-Thu etc. is fine). Admin-managed;
--                   agents can read the dates of their own campaigns.
-- hour_assignments  Hours given to one agent for one week of one campaign.
--                   Shared: whichever admin saves last wins, for everyone.
--                   Admin writes; an agent can only ever read THEIR OWN rows.
-- hour_colours      Cell colour the admin paints in the grid. Admin-only; agents
--                   cannot read it.
-- hours_flags       One row per agent: when their hours last changed; seen_at is
--                   null while the change is unacknowledged. Drives the "Hours changed"
--                   banner. Written by triggers only; agents just read their
--                   own row and call mark_hours_seen().

create table if not exists public.hour_weeks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  created_by uuid references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  check (start_date <= end_date)
);
create index if not exists hour_weeks_project_idx on public.hour_weeks (project_id, start_date);

create table if not exists public.hour_assignments (
  week_id    uuid not null references public.hour_weeks(id) on delete cascade,
  agent_id   uuid not null references public.agents(id) on delete cascade,
  hours      numeric(6,2) not null check (hours >= 0 and hours <= 999),
  updated_by uuid references public.agents(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (week_id, agent_id)
);
create index if not exists hour_assignments_agent_idx on public.hour_assignments (agent_id);

create table if not exists public.hour_colours (
  week_id  uuid not null references public.hour_weeks(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  colour   text not null check (colour ~ '^[a-z]{3,16}$'),
  primary key (week_id, agent_id)
);

create table if not exists public.hours_flags (
  agent_id   uuid primary key references public.agents(id) on delete cascade,
  changed_at timestamptz not null default now(),
  seen_at    timestamptz
);

alter table public.hour_weeks       enable row level security;
alter table public.hour_assignments enable row level security;
alter table public.hour_colours     enable row level security;
alter table public.hours_flags      enable row level security;

-- hour_weeks: admin everything; an agent reads the weeks of campaigns they are
-- assigned to, or where they hold hours (dates only; no hours here).
drop policy if exists "hour_weeks: admin all" on public.hour_weeks;
create policy "hour_weeks: admin all" on public.hour_weeks
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "hour_weeks: agent reads own campaigns" on public.hour_weeks;
create policy "hour_weeks: agent reads own campaigns" on public.hour_weeks
  for select using (
    exists (select 1 from public.project_agents pa
             where pa.project_id = hour_weeks.project_id and pa.agent_id = auth.uid())
    or exists (select 1 from public.hour_assignments ha
                where ha.week_id = hour_weeks.id and ha.agent_id = auth.uid())
  );

-- hour_assignments: admin everything; an agent reads ONLY their own rows.
drop policy if exists "hour_assignments: admin all" on public.hour_assignments;
create policy "hour_assignments: admin all" on public.hour_assignments
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "hour_assignments: agent reads own" on public.hour_assignments;
create policy "hour_assignments: agent reads own" on public.hour_assignments
  for select using (agent_id = auth.uid());

-- hour_colours: admin only.
drop policy if exists "hour_colours: admin all" on public.hour_colours;
create policy "hour_colours: admin all" on public.hour_colours
  for all using (public.is_admin()) with check (public.is_admin());

-- hours_flags: read your own row (admins: any). No direct writes.
drop policy if exists "hours_flags: read own" on public.hours_flags;
create policy "hours_flags: read own" on public.hours_flags
  for select using (agent_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.hour_weeks       to authenticated;
grant select, insert, update, delete on public.hour_assignments to authenticated;
grant select, insert, update, delete on public.hour_colours     to authenticated;
grant select                         on public.hours_flags      to authenticated;

-- Flag an agent: their hours changed. Skips an agent who is being deleted.
create or replace function public.flag_hours_changed(p_agent uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.agents where id = p_agent) then
    insert into public.hours_flags (agent_id, changed_at, seen_at)
    values (p_agent, clock_timestamp(), null)
    on conflict (agent_id) do update set changed_at = clock_timestamp(), seen_at = null;
  end if;
end;
$$;
revoke all on function public.flag_hours_changed(uuid) from public, anon, authenticated;

-- Any change to an agent's hours (new, edited, removed) raises their flag.
create or replace function public.hour_assignments_flag()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.flag_hours_changed(new.agent_id);
  elsif tg_op = 'DELETE' then
    perform public.flag_hours_changed(old.agent_id);
  elsif new.hours is distinct from old.hours then
    perform public.flag_hours_changed(new.agent_id);
  end if;
  return null;
end;
$$;
drop trigger if exists hour_assignments_flag on public.hour_assignments;
create trigger hour_assignments_flag
  after insert or update or delete on public.hour_assignments
  for each row execute function public.hour_assignments_flag();

-- Moving a week's dates changes what the agents' hours mean: flag everyone who
-- holds hours in that week.
create or replace function public.hour_weeks_flag()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare a uuid;
begin
  if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    for a in select agent_id from public.hour_assignments where week_id = new.id loop
      perform public.flag_hours_changed(a);
    end loop;
  end if;
  return null;
end;
$$;
drop trigger if exists hour_weeks_flag on public.hour_weeks;
create trigger hour_weeks_flag
  after update on public.hour_weeks
  for each row execute function public.hour_weeks_flag();

-- The agent acknowledges the flag (banner closed or "View" clicked). They pass
-- the changed_at they were shown, so a change made while the banner was open
-- is not silently cleared.
create or replace function public.mark_hours_seen(p_changed_at timestamptz default null)
returns void
language sql security definer set search_path = public
as $$
  update public.hours_flags set seen_at = now()
   where agent_id = auth.uid()
     and (p_changed_at is null or changed_at <= p_changed_at);
$$;
revoke all on function public.mark_hours_seen(timestamptz) from public, anon;
grant execute on function public.mark_hours_seen(timestamptz) to authenticated;
