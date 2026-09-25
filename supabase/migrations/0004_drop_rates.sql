-- GSA Timesheet — remove the rates feature entirely
-- Run after 0003_seed.sql. Permanently deletes any rate data already entered.

drop policy if exists "rates: admin can select" on public.rates;
drop policy if exists "rates: admin can insert" on public.rates;
drop policy if exists "rates: admin can update" on public.rates;
drop policy if exists "rates: admin can delete" on public.rates;

revoke select, insert, update, delete on public.rates from authenticated;

drop table if exists public.rates;
