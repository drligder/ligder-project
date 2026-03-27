-- 009 — Admin CP: moderator flag, per-board rank gates, bans

-- Staff ranks (forum UI): member < moderator < administrator
alter table public.profiles
  add column if not exists is_moderator boolean not null default false;

comment on column public.profiles.is_moderator is 'Forum: moderator role (below is_admin).';

-- Per-board minimum rank to start threads vs reply (values: member, moderator, administrator, none)
alter table public.forum_boards
  add column if not exists min_rank_start_thread text not null default 'member',
  add column if not exists min_rank_reply text not null default 'member';

comment on column public.forum_boards.min_rank_start_thread is 'Minimum rank to create a thread: member | moderator | administrator | none.';
comment on column public.forum_boards.min_rank_reply is 'Minimum rank to reply in threads: member | moderator | administrator | none.';

-- Migrate legacy admin-only boards: only admins could start threads; replies were not separated — default reply to member
update public.forum_boards
set min_rank_start_thread = 'administrator'
where admin_only_post = true
  and min_rank_start_thread = 'member';

create table if not exists public.profile_bans (
  wallet text primary key references public.profiles (wallet) on delete cascade,
  banned_until timestamptz not null,
  banned_by_wallet text references public.profiles (wallet) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists profile_bans_until_idx on public.profile_bans (banned_until);

comment on table public.profile_bans is 'Temporary bans; API rejects registration and treats active bans as blocked login.';

alter table public.profile_bans enable row level security;
