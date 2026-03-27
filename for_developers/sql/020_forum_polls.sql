-- 020 — Forum polls: optional poll per post, signed ballots, governance-gated on LIGDER GOVERNANCE
-- Run after 008 (forum_thread_posts) and 001 (profiles).

create table if not exists public.forum_polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.forum_thread_posts (id) on delete cascade,
  question text not null,
  allow_multiple boolean not null default false,
  created_by_wallet text not null references public.profiles (wallet) on delete cascade,
  created_at timestamptz not null default now(),
  constraint forum_polls_question_len check (
    char_length(question) >= 1 and char_length(question) <= 500
  )
);

create index if not exists forum_polls_post_id_idx on public.forum_polls (post_id);

comment on table public.forum_polls is 'At most one poll per thread post; author creates via signed API.';

create table if not exists public.forum_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.forum_polls (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  constraint forum_poll_options_label_len check (
    char_length(label) >= 1 and char_length(label) <= 200
  )
);

create index if not exists forum_poll_options_poll_idx on public.forum_poll_options (poll_id, sort_order);

create table if not exists public.forum_poll_ballots (
  poll_id uuid not null references public.forum_polls (id) on delete cascade,
  voter_wallet text not null references public.profiles (wallet) on delete cascade,
  option_ids jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (poll_id, voter_wallet)
);

create index if not exists forum_poll_ballots_poll_idx on public.forum_poll_ballots (poll_id);

comment on table public.forum_poll_ballots is 'One ballot per wallet per poll; option_ids = JSON array of option UUID strings.';

alter table public.forum_polls enable row level security;
alter table public.forum_poll_options enable row level security;
alter table public.forum_poll_ballots enable row level security;
