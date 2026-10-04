-- GSA Timesheet — per-agent Month/Week timesheet view preference.
-- Run after 0004_drop_rates.sql. Covered by the existing
-- "agents: self or admin can update" RLS policy (row-level, not
-- column-restricted) - no RLS/grant changes needed.

alter table public.agents
  add column if not exists timesheet_view text not null default 'month'
  check (timesheet_view in ('month', 'week'));
