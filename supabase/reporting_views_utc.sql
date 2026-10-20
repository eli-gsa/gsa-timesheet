-- Reporting views: expose agent timezone and a real UTC start time.
-- Run ONCE in the Supabase SQL editor, after 0006_agent_timezone.sql and
-- 0007_project_allocations.sql. Only
-- relevant if the read-only `reporting` schema from the integration setup
-- exists (it is not part of the app's own migrations). Safe to re-run.
--
-- What changes for the reporting login (gsa_reporting_ro):
--   reporting.agents             gains: timezone
--   reporting.timesheet_entries  gains: agent_timezone, starts_at_utc
--   reporting.project_agents     gains: allocated_hours
-- Existing columns and the monthly-hours query keep working unchanged.
--
-- Month boundaries: entry_date is the AGENT'S LOCAL date, so grouping by
-- date_trunc('month', entry_date) assigns each hour to the month the agent
-- saw it in. starts_at_utc is for comparing across agents or converting to
-- another zone; an agent's hour at 00:30 local on the 1st can fall on the
-- last day of the previous month in UTC.

drop view if exists reporting.agents;
create view reporting.agents as select * from public.agents;

drop view if exists reporting.timesheet_entries;
create view reporting.timesheet_entries as
select e.*,
       coalesce(a.timezone, 'UTC') as agent_timezone,
       ((e.entry_date::timestamp + e.slot * interval '30 minutes')
          at time zone coalesce(a.timezone, 'UTC')) at time zone 'UTC' as starts_at_utc
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
