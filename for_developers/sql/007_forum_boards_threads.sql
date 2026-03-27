-- 007 — Forum boards + threads (LIGDER OFFICIAL and future sections)
-- Run after 001 (profiles) and 006 (is_admin).

create table if not exists public.forum_boards (
  id text primary key,
  section text not null,
  title text not null,
  description text,
  sort_order integer not null default 0,
  admin_only_post boolean not null default false,
  icon_key text not null default 'megaphone',
  created_at timestamptz not null default now()
);

create index if not exists forum_boards_section_idx on public.forum_boards (section);

comment on table public.forum_boards is 'Forum boards; admin_only_post = only is_admin users may create threads.';

create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.forum_boards (id) on delete cascade,
  title text not null,
  author_wallet text not null references public.profiles (wallet) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posts_count integer not null default 0
);

create index if not exists forum_threads_board_idx on public.forum_threads (board_id);
create index if not exists forum_threads_updated_idx on public.forum_threads (updated_at desc);

alter table public.forum_boards enable row level security;
alter table public.forum_threads enable row level security;

-- LIGDER OFFICIAL — Announcement / Updates / Socials (posting: admins only)
insert into public.forum_boards (id, section, title, description, sort_order, admin_only_post, icon_key) values
  ('ligder-announcement', 'LIGDER OFFICIAL', 'Announcement', 'Official announcements from the Ligder team.', 1, true, 'megaphone'),
  ('ligder-updates', 'LIGDER OFFICIAL', 'Updates', 'Product, protocol, and development updates.', 2, true, 'megaphone'),
  ('ligder-socials', 'LIGDER OFFICIAL', 'Socials', 'Official social links and community presence.', 3, true, 'megaphone')
on conflict (id) do nothing;
