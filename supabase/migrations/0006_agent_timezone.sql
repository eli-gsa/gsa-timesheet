-- GSA Timesheet — per-agent timezone + protect admin-only agent fields.
-- Run after 0005_timesheet_view.sql, before deploying the matching code.
--
-- Timesheet entries stay stored as (local date, half-hour slot) on the
-- agent's own wall clock - nothing about existing data changes. The new
-- timezone column is what lets reporting turn that local time into UTC:
--   starts_at_utc = (entry_date + slot * 30 min) at time zone <timezone>
-- NULL means "not set yet"; reporting treats that as UTC until an admin
-- sets it on the Team page.

alter table public.agents
  add column if not exists timezone text;

-- ---------------------------------------------------------------------------
-- Guard trigger.
-- 1. Rejects timezone names Postgres doesn't know.
-- 2. The existing RLS update policy ("self or admin") is row-level only, so
--    until now a signed-in agent could change ANY column of their own row
--    through the API - including role or timezone. This lets non-admins
--    change only their own view window and Month/Week preference
--    (view_start_slot, view_end_slot, timesheet_view); everything else on
--    the row is admin-only.
-- Calls with no signed-in user (SQL editor, service role, other security
-- definer triggers such as handle_new_user) are trusted backend and pass.
-- ---------------------------------------------------------------------------
create or replace function public.agents_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone: %', new.timezone;
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_admin() then
    if new.id         is distinct from old.id
       or new.email      is distinct from old.email
       or new.name       is distinct from old.name
       or new.role       is distinct from old.role
       or new.active     is distinct from old.active
       or new.timezone   is distinct from old.timezone
       or new.created_at is distinct from old.created_at then
      raise exception 'Only an admin can change these agent fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists agents_guard on public.agents;
create trigger agents_guard
  before insert or update on public.agents
  for each row execute function public.agents_guard();
