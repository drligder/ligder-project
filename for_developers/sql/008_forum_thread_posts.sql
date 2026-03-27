-- 008 — Per-board thread numbers, opening posts + replies (run after 007)

-- Sequential thread id in URLs: /boards/{board_id}/{thread_number}
alter table public.forum_threads
  add column if not exists thread_number integer;

update public.forum_threads t
set thread_number = sub.rn
from (
  select id, row_number() over (partition by board_id order by created_at) as rn
  from public.forum_threads
) sub
where t.id = sub.id and t.thread_number is null;

alter table public.forum_threads
  alter column thread_number set not null;

create unique index if not exists forum_threads_board_thread_number_uidx
  on public.forum_threads (board_id, thread_number);

create table if not exists public.forum_thread_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads (id) on delete cascade,
  parent_id uuid references public.forum_thread_posts (id) on delete cascade,
  body text not null,
  author_wallet text not null references public.profiles (wallet) on delete cascade,
  created_at timestamptz not null default now()
);

-- Enforce parent row belongs to same thread (deferrable trigger optional; API validates)
create index if not exists forum_thread_posts_thread_idx on public.forum_thread_posts (thread_id);
create index if not exists forum_thread_posts_parent_idx on public.forum_thread_posts (parent_id);
create index if not exists forum_thread_posts_created_idx on public.forum_thread_posts (thread_id, created_at);

alter table public.forum_thread_posts enable row level security;

comment on table public.forum_thread_posts is 'Thread OP (parent_id null) and replies; vote post_id = id::text in forum_post_votes.';

-- Legacy threads (title-only): synthetic opening post so thread pages work
insert into public.forum_thread_posts (thread_id, parent_id, body, author_wallet)
select t.id, null, '(No opening post was stored for this thread.)', t.author_wallet
from public.forum_threads t
where not exists (
  select 1 from public.forum_thread_posts p where p.thread_id = t.id
);
