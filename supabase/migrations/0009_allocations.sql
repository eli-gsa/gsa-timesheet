-- GSA Timesheet — flexible hours-remaining: allocations with a top-up
-- ledger, counting windows, close/renew, and weekly/monthly caps.
-- Run after 0008_invoicing.sql, before deploying the matching code.
-- Additive only; safe to re-run. Replaces the single project_agents.allocated_hours
-- number from 0007 (that column is left in place, untouched and unused, and
-- any value already entered is copied across below).
--
-- allocations        One row per allocation. kind:
--                      campaign  a total for a stretch of work. Its size is the
--                                sum of its ledger entries (allocation_entries):
--                                +150h, later +50h, or -20h to correct. Only hours
--                                logged between start_date and end_date count
--                                against it (null start = from the beginning,
--                                null end = open-ended).
--                      weekly /  a cap that resets by itself: period_hours per
--                      monthly   calendar week (Mon-Sun) or month.
--                    closed_at set = finished, kept as a record. At most one OPEN
--                    allocation per (project, agent, kind).
-- allocation_entries The top-up ledger (admin only).
-- allocation_status() Aggregated figures (no ledger detail), which is all an
--                    agent may see about their own allocations.

create table if not exists public.allocations (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  agent_id     uuid not null references public.agents(id) on delete cascade,
  kind         text not null check (kind in ('campaign', 'weekly', 'monthly')),
  period_hours numeric(8,2) check (period_hours is null or period_hours >= 0),
  start_date   date,
  end_date     date,
  closed_at    timestamptz,
  note         text,
  created_by   uuid references public.agents(id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((kind = 'campaign') = (period_hours is null)),
  check (start_date is null or end_date is null or start_date <= end_date)
);
create unique index if not exists allocations_one_open
  on public.allocations (project_id, agent_id, kind) where closed_at is null;
create index if not exists allocations_agent_idx on public.allocations (agent_id);

create table if not exists public.allocation_entries (
  id            uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.allocations(id) on delete cascade,
  hours         numeric(8,2) not null check (hours <> 0),
  entry_date    date not null default current_date,
  note          text,
  created_by    uuid references public.agents(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists allocation_entries_alloc_idx on public.allocation_entries (allocation_id);

alter table public.allocations        enable row level security;
alter table public.allocation_entries enable row level security;

drop policy if exists "allocations: admin all" on public.allocations;
create policy "allocations: admin all" on public.allocations
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "allocations: agent reads own" on public.allocations;
create policy "allocations: agent reads own" on public.allocations
  for select using (agent_id = auth.uid());

drop policy if exists "allocation_entries: admin all" on public.allocation_entries;
create policy "allocation_entries: admin all" on public.allocation_entries
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.allocations        to authenticated;
grant select, insert, update, delete on public.allocation_entries to authenticated;

-- Figures for allocations: size, hours logged inside the counting window, and
-- the window itself. p_agent null = everyone (admins only; for an agent it is
-- limited to their own rows). Weekly/monthly windows are the calendar week or
-- month containing p_today (pass the agent's local "today"). security definer
-- so agents get totals without being able to read the ledger or others' rows.
create or replace function public.allocation_status(
  p_agent uuid,
  p_today date,
  p_include_closed boolean default false
)
returns table (
  allocation_id uuid, project_id uuid, agent_id uuid, kind text,
  start_date date, end_date date, closed_at timestamptz, note text,
  total_hours numeric, logged_half_hours bigint, first_logged date,
  win_start date, win_end date
)
language sql stable security definer set search_path = public
as $$
  with a as (
    select al.*,
      case al.kind
        when 'weekly'  then date_trunc('week',  p_today)::date
        when 'monthly' then date_trunc('month', p_today)::date
        else al.start_date end as ws,
      case al.kind
        when 'weekly'  then (date_trunc('week',  p_today) + interval '6 days')::date
        when 'monthly' then (date_trunc('month', p_today) + interval '1 month' - interval '1 day')::date
        else coalesce(al.end_date, case when al.closed_at is not null then al.closed_at::date end) end as we
    from public.allocations al
    where (p_include_closed or al.closed_at is null)
      and (p_agent is null or al.agent_id = p_agent)
      and (public.is_admin() or al.agent_id = auth.uid())
  )
  select a.id, a.project_id, a.agent_id, a.kind,
         a.start_date, a.end_date, a.closed_at, a.note,
         case when a.kind = 'campaign'
              then coalesce((select sum(x.hours) from public.allocation_entries x where x.allocation_id = a.id), 0)
              else a.period_hours end,
         case when a.kind <> 'campaign' and a.closed_at is not null then null
              else (select count(*) from public.timesheet_entries e
                     where e.agent_id = a.agent_id and e.project_id = a.project_id
                       and (a.ws is null or e.entry_date >= a.ws)
                       and (a.we is null or e.entry_date <= a.we)) end::bigint,
         case when a.kind <> 'campaign' and a.closed_at is not null then null
              else (select min(e.entry_date) from public.timesheet_entries e
                     where e.agent_id = a.agent_id and e.project_id = a.project_id
                       and (a.ws is null or e.entry_date >= a.ws)
                       and (a.we is null or e.entry_date <= a.we)) end,
         a.ws, a.we
  from a
$$;
grant execute on function public.allocation_status(uuid, date, boolean) to authenticated;

-- Carry over anything already entered with the old single-number allocation:
-- one open campaign allocation (no counting window, i.e. all hours so far,
-- exactly as before) with the old number as its first ledger entry.
do $$
declare r record; new_id uuid;
begin
  for r in
    select pa.project_id, pa.agent_id, pa.allocated_hours
    from public.project_agents pa
    where pa.allocated_hours is not null and pa.allocated_hours > 0
      and not exists (
        select 1 from public.allocations a
        where a.project_id = pa.project_id and a.agent_id = pa.agent_id and a.kind = 'campaign'
      )
  loop
    insert into public.allocations (project_id, agent_id, kind, note)
    values (r.project_id, r.agent_id, 'campaign', 'Carried over from the previous allocation')
    returning id into new_id;
    insert into public.allocation_entries (allocation_id, hours, entry_date, note)
    values (new_id, r.allocated_hours, current_date, 'Carried over');
  end loop;
end $$;
