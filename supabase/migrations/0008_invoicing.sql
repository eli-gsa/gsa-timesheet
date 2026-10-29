-- GSA Timesheet — invoicing: private per-admin rates, issued-invoice record,
-- and aggregate functions. Run after 0007_project_allocations.sql, before
-- deploying the matching code. Additive only: creates new tables/functions,
-- touches no existing data. Safe to re-run.
--
-- invoice_rates   One row per (admin, agent, project, currency, month) holding
--                 an hourly rate. A rate applies from its month onward until a
--                 later row for the same pair replaces it (carry-forward), so a
--                 rate set in January is still used in March, and changing it
--                 in March never alters January/February. rate NULL means
--                 "cleared from this month on". Private per admin: RLS lets an
--                 admin see and edit only their own rows.
-- invoices        A record of invoices exported (number, agent, month, total,
--                 line snapshot). Each admin sees only their own; the invoice
--                 number is unique across all admins, so two admins can't issue
--                 the same number (the unique index ignores RLS).

create table if not exists public.invoice_rates (
  admin_id        uuid not null references public.agents(id) on delete cascade,
  agent_id        uuid not null references public.agents(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  effective_month date not null check (effective_month = date_trunc('month', effective_month)::date),
  rate            numeric(12,2) check (rate is null or rate >= 0),
  updated_at      timestamptz not null default now(),
  primary key (admin_id, agent_id, project_id, currency, effective_month)
);
create index if not exists invoice_rates_lookup_idx
  on public.invoice_rates (admin_id, currency, effective_month);

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  issued_by      uuid references public.agents(id) on delete set null,
  agent_id       uuid references public.agents(id) on delete set null,
  agent_name     text not null,
  period         date not null check (period = date_trunc('month', period)::date),
  currency       text not null check (currency ~ '^[A-Z]{3}$'),
  invoice_number text not null check (length(btrim(invoice_number)) between 1 and 40),
  total          numeric(14,2) not null,
  lines          jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (issued_by, agent_id, period, currency)
);
create unique index if not exists invoices_number_uniq
  on public.invoices (lower(btrim(invoice_number)));

alter table public.invoice_rates enable row level security;
alter table public.invoices      enable row level security;

drop policy if exists "invoice_rates: own, admin only" on public.invoice_rates;
create policy "invoice_rates: own, admin only" on public.invoice_rates
  for all
  using      (admin_id = auth.uid() and public.is_admin())
  with check (admin_id = auth.uid() and public.is_admin());

drop policy if exists "invoices: own, admin only" on public.invoices;
create policy "invoices: own, admin only" on public.invoices
  for all
  using      (issued_by = auth.uid() and public.is_admin())
  with check (issued_by = auth.uid() and public.is_admin());

grant select, insert, update, delete on public.invoice_rates to authenticated;
grant select, insert, update, delete on public.invoices      to authenticated;

-- Half-hour counts per (agent, project) for one calendar month. Aggregated in
-- the database so the result is a handful of rows however many entries exist
-- (the API returns at most 1000 rows per request). security invoker: the
-- timesheet_entries RLS still applies (admins see everyone, agents only
-- themselves).
create or replace function public.invoicing_hours(p_month date)
returns table (agent_id uuid, project_id uuid, half_hours bigint)
language sql stable security invoker
as $$
  select e.agent_id, e.project_id, count(*)::bigint
  from public.timesheet_entries e
  where e.entry_date >= date_trunc('month', p_month)::date
    and e.entry_date <  (date_trunc('month', p_month) + interval '1 month')::date
  group by e.agent_id, e.project_id
$$;

-- Per-day half-hour counts for one agent over a date range (agent's own
-- "My Summary" page: month and week breakdowns).
create or replace function public.agent_daily_totals(p_agent uuid, p_start date, p_end date)
returns table (entry_date date, project_id uuid, half_hours bigint)
language sql stable security invoker
as $$
  select e.entry_date, e.project_id, count(*)::bigint
  from public.timesheet_entries e
  where e.agent_id = p_agent
    and e.entry_date between p_start and p_end
  group by e.entry_date, e.project_id
$$;

-- The calling admin's rate in force for a month: for each (agent, project),
-- the latest row at or before that month. One row per pair.
create or replace function public.invoice_rates_effective(p_month date, p_currency text)
returns table (agent_id uuid, project_id uuid, rate numeric, effective_month date)
language sql stable security invoker
as $$
  select distinct on (r.agent_id, r.project_id)
         r.agent_id, r.project_id, r.rate, r.effective_month
  from public.invoice_rates r
  where r.admin_id = auth.uid()
    and r.currency = p_currency
    and r.effective_month <= date_trunc('month', p_month)::date
  order by r.agent_id, r.project_id, r.effective_month desc
$$;

-- Most recently issued invoice number across ALL admins (so the suggested
-- next number never collides). Exposes the number only, nothing else.
create or replace function public.invoice_last_number()
returns text
language sql stable security definer set search_path = public
as $$
  select case when public.is_admin()
              then (select invoice_number from public.invoices order by updated_at desc limit 1)
         end
$$;

grant execute on function public.invoicing_hours(date)                to authenticated;
grant execute on function public.agent_daily_totals(uuid, date, date) to authenticated;
grant execute on function public.invoice_rates_effective(date, text)  to authenticated;
grant execute on function public.invoice_last_number()                to authenticated;
