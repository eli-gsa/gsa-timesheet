-- Reporting views: UK-time hours plus the real instant and the agent's zone.
-- Run ONCE in the Supabase SQL editor, after 0012_uk_time_storage.sql. Only
-- relevant if the read-only `reporting` schema from the integration setup
-- exists (it is not part of the app's own migrations). Safe to re-run.
--
-- What the reporting login (gsa_reporting_ro) sees:
--   reporting.agents             gains: timezone
--   reporting.timesheet_entries  entry_date / slot are UK time (Europe/London,
--                                BST/GMT applied). Also: starts_at_utc (the real
--                                instant), agent_timezone, and agent_local_time
--                                (the same moment on the agent's own clock).
--   reporting.project_agents     gains: allocated_hours
-- Existing columns and the monthly-hours query keep working unchanged;
-- grouping by date_trunc('month', entry_date) is a UK-calendar month.

drop view if exists reporting.agents;
create view reporting.agents as select * from public.agents;

drop view if exists reporting.timesheet_entries;
create view reporting.timesheet_entries as
select e.*,
       e.starts_at as starts_at_utc,
       coalesce(a.timezone, 'Europe/London') as agent_timezone,
       e.starts_at at time zone coalesce(a.timezone, 'Europe/London') as agent_local_time
from public.timesheet_entries e
join public.agents a on a.id = e.agent_id;

-- 0007 adds project_agents.allocated_hours (hours allocated per agent per
-- project); a `select *` view only picks up new columns when recreated.
drop view if exists reporting.project_agents;
create view reporting.project_agents as select * from public.project_agents;

grant select on reporting.project_agents    to gsa_reporting_ro;
grant select on reporting.agents            to gsa_reporting_ro;
grant select on reporting.timesheet_entries to gsa_reporting_ro;

-- Check (should list the seven views, nothing in public):
-- select table_schema, table_name from information_schema.role_table_grants
--  where grantee = 'gsa_reporting_ro';
