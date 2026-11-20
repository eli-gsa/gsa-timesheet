-- GSA Timesheet — logged vs assigned hours per week (Assign Hours follow-up).
-- Run after 0013_assign_hours.sql, BEFORE deploying the matching code.
-- Additive only (one function + one index); safe to re-run. No data changes.
--
-- hour_week_logged(p_agent)  Half-hours logged inside each Assign Hours week, per
--   agent: counted on UK dates (the stored entry_date) from the week's start date
--   to its end date, on that week's campaign only. p_agent null = everyone (an
--   admin session); an agent only ever gets their own rows regardless of p_agent
--   (security invoker, so row-level security still applies).

create index if not exists timesheet_entries_project_date_idx
  on public.timesheet_entries (project_id, entry_date);

create or replace function public.hour_week_logged(p_agent uuid default null)
returns table (week_id uuid, agent_id uuid, half_hours bigint)
language sql stable security invoker
as $$
  select w.id, e.agent_id, count(*)::bigint
  from public.hour_weeks w
  join public.timesheet_entries e
    on e.project_id = w.project_id
   and e.entry_date between w.start_date and w.end_date
  where p_agent is null or e.agent_id = p_agent
  group by w.id, e.agent_id
$$;
grant execute on function public.hour_week_logged(uuid) to authenticated;
