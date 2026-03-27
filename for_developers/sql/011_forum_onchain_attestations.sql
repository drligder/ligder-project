-- 011 — Forum on-chain attestations (Memo tx signatures; relayed by server fee payer)
-- Run after 007 + 008 (forum_threads + forum_thread_posts).

create table if not exists public.forum_onchain_attestations (
  id uuid primary key default gen_random_uuid(),
  kind text not null, -- 'thread_create' | 'reply_create'
  board_id text not null,
  thread_id uuid not null references public.forum_threads (id) on delete cascade,
  post_id uuid references public.forum_thread_posts (id) on delete cascade,
  thread_number integer,
  author_wallet text not null references public.profiles (wallet) on delete cascade,
  author_username text,
  title_sha256 text,
  body_sha256 text not null,
  lite_holdings_ui text,
  memo text not null,
  tx_sig text not null,
  fee_payer text not null,
  created_at timestamptz not null default now()
);

create index if not exists forum_onchain_attestations_thread_idx
  on public.forum_onchain_attestations (thread_id, created_at desc);

create index if not exists forum_onchain_attestations_post_idx
  on public.forum_onchain_attestations (post_id);

create index if not exists forum_onchain_attestations_author_idx
  on public.forum_onchain_attestations (author_wallet, created_at desc);

create index if not exists forum_onchain_attestations_kind_idx
  on public.forum_onchain_attestations (kind, created_at desc);

alter table public.forum_onchain_attestations enable row level security;

comment on table public.forum_onchain_attestations is 'Server-relayed Solana Memo tx signatures attesting forum thread/reply creation (hashes only; body stored off-chain).';

