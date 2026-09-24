-- GSA Timesheet — seed data
-- EDIT THE TWO VALUES MARKED BELOW BEFORE RUNNING, then run after 0002_rls.sql.
-- Safe to run once; re-running is harmless (on conflict do nothing / upsert).

-- 1) Your Google Workspace domain(s) — only emails on these domains can sign in.
insert into public.allowed_domains (domain) values
  ('example.com')   -- <-- CHANGE THIS to your real Workspace domain, e.g. 'gsa.co.za'
on conflict (domain) do nothing;

-- 2) The email(s) that should be admins from their very first sign-in.
--    Add every admin here; anyone else who signs in lands as a regular agent
--    (you can promote them later with: update agents set role='admin' where email='...';)
insert into public.admin_emails (email) values
  ('eli@example.com')  -- <-- CHANGE THIS to your real admin email(s)
on conflict (email) do nothing;

-- Default lead types (matches the prototype's out-of-the-box list; edit freely
-- from the app's Settings page once it's live — this seed just avoids an empty list).
insert into public.lead_types (name) values
  ('Inbound call'), ('Outbound call'), ('Referral'), ('Web form'), ('Event')
on conflict (name) do nothing;

-- Default settings
insert into public.settings (key, value) values
  ('standard_work_day', '{"startSlot": 16, "endSlot": 34}'::jsonb) -- 08:00-17:00
on conflict (key) do update set value = excluded.value;
