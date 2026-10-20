-- GSA Timesheet — per-agent, per-project hour allocations (campaign countdown).
-- Run after 0006_agent_timezone.sql, before deploying the matching code.
--
-- allocated_hours is the total number of hours an agent is allocated on a
-- project (e.g. Vin on Nexus = 150). NULL = no allocation set, so no
-- countdown is shown for that pair. Admins edit it on the Projects page;
-- the existing project_agents RLS (admin insert/update/delete, any signed-in
-- agent can select) already covers the new column. Changing it mid-campaign
-- is just an edit - each change is recorded in the audit log.

alter table public.project_agents
  add column if not exists allocated_hours numeric(8,2)
  check (allocated_hours is null or allocated_hours >= 0);

-- All-time half-hour counts per project for one agent: the "logged so far"
-- side of the countdown. security invoker (the default) so the existing
-- timesheet_entries RLS still applies: an agent can total only their own
-- rows, an admin anyone's. Aggregating in the database avoids shipping every
-- historical entry to the browser.
create or replace function public.agent_project_totals(p_agent uuid)
returns table (project_id uuid, half_hours bigint)
language sql
stable
security invoker
as $$
  select e.project_id, count(*)::bigint
  from public.timesheet_entries e
  where e.agent_id = p_agent
  group by e.project_id
$$;

grant execute on function public.agent_project_totals(uuid) to authenticated;
