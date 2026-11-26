-- GSA Timesheet — lead bonuses, lead dates, campaign groups.
-- Run after 0014_hour_week_logged.sql, BEFORE deploying the matching code.
-- Additive only; safe to re-run. No existing data is deleted or changed except
-- that every existing lead gets a date (see 1.).
--
-- 1. leads.lead_date      The day a lead was logged (default: today, UK time).
--                         Existing leads get the day they were created if that is
--                         in their month, otherwise the 1st of their month. A
--                         trigger keeps the date inside the lead's month (period),
--                         so the timesheet's monthly lead lists never disagree.
-- 2. lead_bonus_settings  Currency per campaign (default GBP).
-- 3. lead_bonus_rates     Bonus PER LEAD for one agent in one week of one campaign.
--                         Only positive amounts exist: 0 / empty = no row = no
--                         bonus. Admin writes; an agent reads only their own rows.
-- 4. lead_week_counts()   Leads per agent per week, counted automatically from the
--                         leads agents log (by lead_date). A lead belongs to the
--                         week containing its date (the latest-starting one if two
--                         weeks overlap).
-- 5. lead_bonus_rows()    Each lead with the bonus it earns (rate of its week).
-- 6. project_groups       Named groups of campaigns for reporting (admin only).

-- 1. lead dates ---------------------------------------------------------------
alter table public.leads add column if not exists lead_date date;

update public.leads
   set lead_date = case
         when period ~ '^\d{4}-\d{2}$'
          and to_char(created_at at time zone 'Europe/London', 'YYYY-MM') = period
           then (created_at at time zone 'Europe/London')::date
         when period ~ '^\d{4}-\d{2}$' then (period || '-01')::date
         else (created_at at time zone 'Europe/London')::date
       end
 where lead_date is null;

alter table public.leads alter column lead_date set default ((now() at time zone 'Europe/London')::date);
alter table public.leads alter column lead_date set not null;

create or replace function public.leads_date_in_period()
returns trigger
language plpgsql
as $$
declare
  first_day date;
  last_day date;
begin
  if new.lead_date is null then
    new.lead_date := (now() at time zone 'Europe/London')::date;
  end if;
  if new.period ~ '^\d{4}-\d{2}$' then
    first_day := (new.period || '-01')::date;
    last_day := (first_day + interval '1 month' - interval '1 day')::date;
    new.lead_date := least(greatest(new.lead_date, first_day), last_day);
  end if;
  return new;
end;
$$;
drop trigger if exists leads_date_in_period on public.leads;
create trigger leads_date_in_period
  before insert or update on public.leads
  for each row execute function public.leads_date_in_period();

create index if not exists leads_project_date_idx on public.leads (project_id, lead_date);

-- 2. currency per campaign -------------------------------------------------------
create table if not exists public.lead_bonus_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  currency   text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now()
);
alter table public.lead_bonus_settings enable row level security;
drop policy if exists "lead_bonus_settings: admin all" on public.lead_bonus_settings;
create policy "lead_bonus_settings: admin all" on public.lead_bonus_settings
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "lead_bonus_settings: active agents read" on public.lead_bonus_settings;
create policy "lead_bonus_settings: active agents read" on public.lead_bonus_settings
  for select using (public.current_agent_active());
grant select, insert, update, delete on public.lead_bonus_settings to authenticated;

-- 3. bonus per lead, per agent per week -------------------------------------------
create table if not exists public.lead_bonus_rates (
  week_id    uuid not null references public.hour_weeks(id) on delete cascade,
  agent_id   uuid not null references public.agents(id) on delete cascade,
  amount     numeric(10,2) not null check (amount > 0),
  updated_by uuid references public.agents(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (week_id, agent_id)
);
create index if not exists lead_bonus_rates_agent_idx on public.lead_bonus_rates (agent_id);
alter table public.lead_bonus_rates enable row level security;
drop policy if exists "lead_bonus_rates: admin all" on public.lead_bonus_rates;
create policy "lead_bonus_rates: admin all" on public.lead_bonus_rates
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "lead_bonus_rates: agent reads own" on public.lead_bonus_rates;
create policy "lead_bonus_rates: agent reads own" on public.lead_bonus_rates
  for select using (agent_id = auth.uid());
grant select, insert, update, delete on public.lead_bonus_rates to authenticated;

-- 4. leads per agent per week (automatic) ----------------------------------------
create or replace function public.lead_week_counts(p_agent uuid default null)
returns table (week_id uuid, agent_id uuid, leads bigint)
language sql stable security invoker
as $$
  with lw as (
    select distinct on (l.id) l.id, l.agent_id, w.id as week_id
    from public.leads l
    join public.hour_weeks w
      on w.project_id = l.project_id
     and l.lead_date between w.start_date and w.end_date
    where p_agent is null or l.agent_id = p_agent
    order by l.id, w.start_date desc, w.id
  )
  select lw.week_id, lw.agent_id, count(*)::bigint from lw group by lw.week_id, lw.agent_id
$$;
grant execute on function public.lead_week_counts(uuid) to authenticated;

-- 5. each lead with its bonus (one agent, one UK month 'YYYY-MM') -----------------
create or replace function public.lead_bonus_rows(p_agent uuid, p_month text)
returns table (lead_id uuid, project_id uuid, lead_type text, lead_name text,
               lead_date date, week_id uuid, amount numeric, currency text)
language sql stable security invoker
as $$
  select * from (
    select distinct on (l.id)
           l.id, l.project_id, l.type, l.name, l.lead_date, w.id, r.amount,
           coalesce(s.currency, 'GBP')
    from public.leads l
    join public.hour_weeks w
      on w.project_id = l.project_id
     and l.lead_date between w.start_date and w.end_date
    join public.lead_bonus_rates r on r.week_id = w.id and r.agent_id = l.agent_id
    left join public.lead_bonus_settings s on s.project_id = l.project_id
    where l.agent_id = p_agent
      and to_char(l.lead_date, 'YYYY-MM') = p_month
    order by l.id, w.start_date desc, w.id
  ) x
$$;
grant execute on function public.lead_bonus_rows(uuid, text) to authenticated;

-- 6. campaign groups ---------------------------------------------------------------
create table if not exists public.project_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create table if not exists public.project_group_members (
  group_id   uuid not null references public.project_groups(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  primary key (group_id, project_id)
);
create index if not exists project_group_members_project_idx on public.project_group_members (project_id);
alter table public.project_groups        enable row level security;
alter table public.project_group_members enable row level security;
drop policy if exists "project_groups: admin all" on public.project_groups;
create policy "project_groups: admin all" on public.project_groups
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "project_group_members: admin all" on public.project_group_members;
create policy "project_group_members: admin all" on public.project_group_members
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.project_groups        to authenticated;
grant select, insert, update, delete on public.project_group_members to authenticated;
