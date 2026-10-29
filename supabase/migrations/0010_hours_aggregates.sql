-- GSA Timesheet — database-side hour totals.
-- Run after 0009_allocations.sql, before deploying the matching code.
-- Additive only (functions); safe to re-run.
--
-- The API returns at most 1000 rows per request. The Overview, Agents and
-- Projects pages used to download every timesheet entry and count them in the
-- browser/server, so once a month passed ~1000 entries the totals were
-- silently short. These functions do the counting in Postgres and return a
-- handful of rows instead. security invoker: timesheet_entries RLS still
-- applies (admins see everyone).

create or replace function public.hours_by_agent(p_start date, p_end date)
returns table (agent_id uuid, half_hours bigint)
language sql stable security invoker
as $$
  select e.agent_id, count(*)::bigint
  from public.timesheet_entries e
  where e.entry_date between p_start and p_end
  group by e.agent_id
$$;

create or replace function public.hours_by_project(p_start date, p_end date)
returns table (project_id uuid, half_hours bigint)
language sql stable security invoker
as $$
  select e.project_id, count(*)::bigint
  from public.timesheet_entries e
  where e.entry_date between p_start and p_end
  group by e.project_id
$$;

create or replace function public.hours_by_day(p_start date, p_end date)
returns table (entry_date date, half_hours bigint)
language sql stable security invoker
as $$
  select e.entry_date, count(*)::bigint
  from public.timesheet_entries e
  where e.entry_date between p_start and p_end
  group by e.entry_date
$$;

create or replace function public.agents_with_hours()
returns table (agent_id uuid)
language sql stable security invoker
as $$
  select distinct e.agent_id from public.timesheet_entries e
$$;

create or replace function public.projects_with_hours()
returns table (project_id uuid)
language sql stable security invoker
as $$
  select distinct e.project_id from public.timesheet_entries e
$$;

grant execute on function public.hours_by_agent(date, date)   to authenticated;
grant execute on function public.hours_by_project(date, date) to authenticated;
grant execute on function public.hours_by_day(date, date)     to authenticated;
grant execute on function public.agents_with_hours()          to authenticated;
grant execute on function public.projects_with_hours()        to authenticated;
