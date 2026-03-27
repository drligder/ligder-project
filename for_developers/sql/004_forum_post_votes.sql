-- 004 — Per-post up/down votes (one vote per wallet per post; up and down are mutually exclusive)

create table if not exists public.forum_post_votes (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  voter_wallet text not null,
  vote smallint not null check (vote in (1, -1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, voter_wallet)
);

create index if not exists forum_post_votes_post_id_idx on public.forum_post_votes (post_id);
create index if not exists forum_post_votes_voter_wallet_idx on public.forum_post_votes (voter_wallet);

alter table public.forum_post_votes enable row level security;

comment on table public.forum_post_votes is 'Forum post reactions: 1 = up, -1 = down. API uses service role.';
