-- GSA Timesheet — store everything in UK time; agents work in their own time.
-- Run after 0011_unassign_keeps_hours.sql, BEFORE deploying the matching code.
-- Set every agent's timezone on the Team page BEFORE running this: existing
-- hours were typed in each agent's own time and are converted once, here.
-- Agents with no timezone set are treated as already UK time (no change).
--
-- Model
--   starts_at              the real instant (timestamptz). Source of truth.
--   entry_date / slot      the same instant on the UK wall clock
--                          (Europe/London, BST/GMT handled by Postgres), kept
--                          in step by a trigger. Every report, invoice, total,
--                          allocation window and the reporting views read these,
--                          so they are UK time with no further changes.
--   agents.timezone        only used to turn what an agent types (their local
--                          time) into starts_at. Changing it later never moves
--                          hours that are already saved.
--
-- Why a real instant as well: when the UK clocks go back, 01:00-02:00 happens
-- twice. UK wall clock alone can't tell those hours apart (one would overwrite
-- the other); the instant can.
--
-- Safe to re-run: only rows without starts_at are converted, and the original
-- table is copied once to timesheet_entries_pre_uk (admin/backend only) so the
-- conversion can be reversed.

-- 1. column ---------------------------------------------------------------
alter table public.timesheet_entries add column if not exists starts_at timestamptz;

-- 2. one-off backup of the pre-conversion rows ---------------------------------
do $$
begin
  if to_regclass('public.timesheet_entries_pre_uk') is null then
    create table public.timesheet_entries_pre_uk as table public.timesheet_entries;
    alter table public.timesheet_entries_pre_uk enable row level security;
    revoke all on public.timesheet_entries_pre_uk from anon, authenticated;
  end if;
end $$;

-- 3. trigger: derive the UK date/slot from the instant -------------------------
-- A writer that only supplies entry_date + slot (old code, an import script) is
-- treated as typing in the agent's own timezone (UK if none is set).
create or replace function public.timesheet_entries_uk_time()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  tz text;
  uk timestamp;
begin
  if new.starts_at is null then
    select coalesce(a.timezone, 'Europe/London') into tz from public.agents a where a.id = new.agent_id;
    new.starts_at := (new.entry_date::timestamp + new.slot * interval '30 minutes')
                     at time zone coalesce(tz, 'Europe/London');
  end if;
  uk := new.starts_at at time zone 'Europe/London';
  new.entry_date := uk::date;
  new.slot := (extract(hour from uk) * 2 + floor(extract(minute from uk) / 30))::int;
  return new;
end;
$$;

drop trigger if exists timesheet_entries_uk_time on public.timesheet_entries;
create trigger timesheet_entries_uk_time
  before insert or update on public.timesheet_entries
  for each row execute function public.timesheet_entries_uk_time();

-- 4. the old one-row-per-UK-slot rule goes first: converting can legitimately put
--    two rows on the same UK wall-clock slot (the repeated hour when clocks go back) ---
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.timesheet_entries'::regclass
      and con.contype = 'u'
      and (select array_agg(att.attname::text order by att.attname)
             from unnest(con.conkey) k join pg_attribute att
               on att.attrelid = con.conrelid and att.attnum = k)
          = array['agent_id', 'entry_date', 'slot']
  loop
    execute format('alter table public.timesheet_entries drop constraint %I', c.conname);
  end loop;
end $$;

-- 5. convert existing rows (agent-local wall clock -> instant -> UK) ----------
do $$
declare
  clash int;
begin
  -- Two saved half-hours of one agent landing on the same instant means one sits
  -- in a clock hour that didn't exist (a spring-forward gap). Nothing is changed
  -- if that happens; the message says who.
  select count(*) into clash from (
    select e.agent_id
    from public.timesheet_entries e
    join public.agents a on a.id = e.agent_id
    where e.starts_at is null
    group by e.agent_id,
             ((e.entry_date::timestamp + e.slot * interval '30 minutes')
                at time zone coalesce(a.timezone, 'Europe/London'))
    having count(*) > 1
  ) c;
  if clash > 0 then
    raise exception 'Cannot convert: % half-hour(s) sit in a clock hour that did not exist (DST gap). Send this to support.', clash;
  end if;

  update public.timesheet_entries e
     set starts_at = (e.entry_date::timestamp + e.slot * interval '30 minutes')
                     at time zone coalesce(a.timezone, 'Europe/London')
    from public.agents a
   where a.id = e.agent_id and e.starts_at is null;
end $$;

-- 6. every row has an instant; uniqueness is per agent + instant
alter table public.timesheet_entries alter column starts_at set not null;

create unique index if not exists timesheet_entries_agent_start_uq
  on public.timesheet_entries (agent_id, starts_at);

-- 7. read / write in a given timezone ----------------------------------------
-- p_tz is the zone the caller is working in (an agent's own, or Europe/London
-- for an admin's UK view). All security invoker: RLS still applies.

-- One agent's entries between two LOCAL dates (inclusive), with date/slot
-- expressed in p_tz.
create or replace function public.entries_local(p_agent uuid, p_from date, p_to date, p_tz text)
returns table (id uuid, agent_id uuid, project_id uuid, entry_date date, slot int,
               starts_at timestamptz, created_at timestamptz, updated_at timestamptz)
language sql stable security invoker
as $$
  select e.id, e.agent_id, e.project_id,
         (e.starts_at at time zone p_tz)::date,
         (extract(hour from (e.starts_at at time zone p_tz)) * 2
            + floor(extract(minute from (e.starts_at at time zone p_tz)) / 30))::int,
         e.starts_at, e.created_at, e.updated_at
  from public.timesheet_entries e
  where e.agent_id = p_agent
    and e.starts_at >= (p_from::timestamp at time zone p_tz)
    and e.starts_at <  ((p_to + 1)::timestamp at time zone p_tz)
$$;

-- Paint cells given as (local date, local slot).
create or replace function public.assign_slots_local(
  p_agent uuid, p_tz text, p_project uuid, p_dates date[], p_slots int[])
returns int
language plpgsql security invoker
as $$
declare
  n int;
begin
  if coalesce(array_length(p_dates, 1), 0) <> coalesce(array_length(p_slots, 1), 0) then
    raise exception 'dates and slots must be the same length';
  end if;
  insert into public.timesheet_entries (agent_id, project_id, starts_at, entry_date, slot, updated_at)
  select distinct on (x.st) p_agent, p_project, x.st, x.st::date, 0, now()
  from (select ((u.d + u.s * interval '30 minutes') at time zone p_tz) as st
          from unnest(p_dates, p_slots) as u(d, s)) x
  order by x.st
  on conflict (agent_id, starts_at)
    do update set project_id = excluded.project_id, updated_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Clear cells given as (local date, local slot).
create or replace function public.clear_slots_local(
  p_agent uuid, p_tz text, p_dates date[], p_slots int[])
returns int
language plpgsql security invoker
as $$
declare
  n int;
begin
  if coalesce(array_length(p_dates, 1), 0) <> coalesce(array_length(p_slots, 1), 0) then
    raise exception 'dates and slots must be the same length';
  end if;
  delete from public.timesheet_entries e
   where e.agent_id = p_agent
     and e.starts_at in (select ((u.d + u.s * interval '30 minutes') at time zone p_tz)
                           from unnest(p_dates, p_slots) as u(d, s));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Half-hours per project between two local dates (Project Summary).
create or replace function public.agent_range_totals_local(p_agent uuid, p_from date, p_to date, p_tz text)
returns table (project_id uuid, half_hours bigint)
language sql stable security invoker
as $$
  select e.project_id, count(*)::bigint
  from public.timesheet_entries e
  where e.agent_id = p_agent
    and e.starts_at >= (p_from::timestamp at time zone p_tz)
    and e.starts_at <  ((p_to + 1)::timestamp at time zone p_tz)
  group by e.project_id
$$;

-- Per local day and project (the agent's My Summary page).
create or replace function public.agent_daily_totals_local(p_agent uuid, p_start date, p_end date, p_tz text)
returns table (entry_date date, project_id uuid, half_hours bigint)
language sql stable security invoker
as $$
  select (e.starts_at at time zone p_tz)::date, e.project_id, count(*)::bigint
  from public.timesheet_entries e
  where e.agent_id = p_agent
    and e.starts_at >= (p_start::timestamp at time zone p_tz)
    and e.starts_at <  ((p_end + 1)::timestamp at time zone p_tz)
  group by 1, e.project_id
$$;

grant execute on function public.entries_local(uuid, date, date, text)                 to authenticated;
grant execute on function public.assign_slots_local(uuid, text, uuid, date[], int[])    to authenticated;
grant execute on function public.clear_slots_local(uuid, text, date[], int[])           to authenticated;
grant execute on function public.agent_range_totals_local(uuid, date, date, text)       to authenticated;
grant execute on function public.agent_daily_totals_local(uuid, date, date, text)       to authenticated;
