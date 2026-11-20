-- GSA Timesheet — unassigning an agent from a project keeps their hours.
-- Run after 0010_hours_aggregates.sql, before deploying the matching code.
-- Additive only (one function, one trigger); no data is changed. Safe to re-run.
--
-- 1. entries_assignment_guard: once an agent is unassigned from a project,
--    their logged hours on it are frozen for the agent (they can still SEE them
--    on their timesheet). Non-admins can no longer insert, change or delete
--    timesheet entries for a project they aren't assigned to. Admins and the
--    trusted backend (auth.uid() is null: cascade deletes, service role) are
--    never blocked, so admins can still correct a record.
--
-- 2. project_agent_hours(): all-time half-hours per (project, agent), so the
--    admin campaign table can keep listing unassigned agents with their hours.
--    security invoker: timesheet_entries RLS still applies.

create or replace function public.entries_assignment_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  chk_project uuid;
  chk_agent uuid;
begin
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    chk_project := new.project_id; chk_agent := new.agent_id;
  else
    chk_project := old.project_id; chk_agent := old.agent_id;
  end if;

  if not exists (
    select 1 from public.project_agents pa
    where pa.project_id = chk_project and pa.agent_id = chk_agent
  ) then
    raise exception 'You are no longer assigned to this project; its logged hours are locked';
  end if;

  -- An UPDATE that moves the entry to a different project must be assigned
  -- to the target project too.
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    if not exists (
      select 1 from public.project_agents pa
      where pa.project_id = new.project_id and pa.agent_id = new.agent_id
    ) then
      raise exception 'You are not assigned to that project';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists entries_assignment_guard on public.timesheet_entries;
create trigger entries_assignment_guard
  before insert or update or delete on public.timesheet_entries
  for each row execute function public.entries_assignment_guard();

create or replace function public.project_agent_hours()
returns table (project_id uuid, agent_id uuid, half_hours bigint)
language sql stable security invoker
as $$
  select e.project_id, e.agent_id, count(*)::bigint
  from public.timesheet_entries e
  group by e.project_id, e.agent_id
$$;

grant execute on function public.project_agent_hours() to authenticated;
