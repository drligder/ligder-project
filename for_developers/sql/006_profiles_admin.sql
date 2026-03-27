-- 006 — Admin flag for forum moderation (set is_admin = true in SQL for staff wallets)

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is 'Forum: can post in admin-only boards (e.g. LIGDER OFFICIAL).';
