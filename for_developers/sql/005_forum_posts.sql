-- 005 — Forum posts (author linkage for reputation: votes on a post count toward that author)
-- Run after 001 (profiles) and 004 (forum_post_votes).
--
-- Two ways to apply (both are valid):
--   A) Run this entire file in one query after prerequisites below.
--   B) STEP 1: run from `-- STEP 1` through `comment on table` (creates the table only).
--      STEP 2: register the usernames in the app, then run only the three INSERT … ON CONFLICT
--      statements at the bottom of this file (same block you highlighted). Same result as A.

-- ========== STEP 1 — schema ==========
create table if not exists public.forum_posts (
  id text primary key,
  thread_id text not null,
  author_wallet text not null references public.profiles (wallet) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists forum_posts_thread_id_idx on public.forum_posts (thread_id);
create index if not exists forum_posts_author_wallet_idx on public.forum_posts (author_wallet);

alter table public.forum_posts enable row level security;

comment on table public.forum_posts is 'Maps post_id (matches forum_post_votes.post_id) to author wallet for reputation.';

-- =============================================================================
-- STEP 2 — Link sample posts to wallets (INSERT block below; run after STEP 1 + registered users)
-- =============================================================================
-- Why: STEP 1 only creates the empty table. Reputation needs each post id (sample-1,
-- sample-2, …) tied to a wallet so votes count toward that author.
--
-- Before running the inserts below:
--   1. Run migrations 001 → 002 → 003 → 004 → 005 in order (if not already).
--   2. Register three accounts in the Ligder app with usernames EXACTLY:
--        moderator, holder_42, newcomer
--      OR edit the usernames in the WHERE clauses to match your real accounts.
--
-- If a username does not exist, that INSERT inserts 0 rows (no error).
-- =============================================================================

insert into public.forum_posts (id, thread_id, author_wallet)
select 'sample-1', 'sample-welcome', wallet from public.profiles where username = 'moderator' limit 1
on conflict (id) do nothing;

insert into public.forum_posts (id, thread_id, author_wallet)
select 'sample-2', 'sample-welcome', wallet from public.profiles where username = 'holder_42' limit 1
on conflict (id) do nothing;

insert into public.forum_posts (id, thread_id, author_wallet)
select 'sample-3', 'sample-welcome', wallet from public.profiles where username = 'newcomer' limit 1
on conflict (id) do nothing;

-- Verify (optional): select * from public.forum_posts order by id;
