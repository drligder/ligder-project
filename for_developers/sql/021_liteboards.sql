-- 021 — Per-token “Liteboards”: mint-authority-gated deploy, announcement + general channels
-- Run after 001 (profiles). Independent from forum_boards / forum_threads.

create table if not exists public.liteboards (
  id uuid primary key default gen_random_uuid(),
  mint text not null unique,
  owner_wallet text not null references public.profiles (wallet) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists liteboards_owner_idx on public.liteboards (owner_wallet);

comment on table public.liteboards is 'Community mini-board keyed by SPL mint; owner_wallet matched mint creator (fee payer of first tx) at deploy.';

create table if not exists public.liteboard_creation_codes (
  id uuid primary key default gen_random_uuid(),
  mint text not null,
  wallet text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists liteboard_codes_mint_wallet_idx
  on public.liteboard_creation_codes (mint, wallet);
create index if not exists liteboard_codes_expires_idx on public.liteboard_creation_codes (expires_at);

comment on table public.liteboard_creation_codes is 'One-time deploy codes after signed mint-authority check; store hash only.';

create table if not exists public.liteboard_threads (
  id uuid primary key default gen_random_uuid(),
  liteboard_id uuid not null references public.liteboards (id) on delete cascade,
  channel text not null,
  title text not null,
  author_wallet text not null references public.profiles (wallet) on delete cascade,
  thread_number integer not null,
  posts_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint liteboard_threads_channel_chk check (channel in ('announcement', 'general')),
  constraint liteboard_threads_title_len check (char_length(title) between 1 and 200)
);

create unique index if not exists liteboard_threads_number_uidx
  on public.liteboard_threads (liteboard_id, channel, thread_number);

create index if not exists liteboard_threads_liteboard_channel_idx
  on public.liteboard_threads (liteboard_id, channel, updated_at desc);

create table if not exists public.liteboard_thread_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.liteboard_threads (id) on delete cascade,
  parent_id uuid references public.liteboard_thread_posts (id) on delete cascade,
  body text not null,
  author_wallet text not null references public.profiles (wallet) on delete cascade,
  created_at timestamptz not null default now(),
  constraint liteboard_posts_body_len check (char_length(body) between 1 and 35000)
);

create index if not exists liteboard_posts_thread_idx on public.liteboard_thread_posts (thread_id);
create index if not exists liteboard_posts_parent_idx on public.liteboard_thread_posts (parent_id);
create index if not exists liteboard_posts_created_idx on public.liteboard_thread_posts (thread_id, created_at);

comment on table public.liteboard_threads is 'Threads per liteboard; channel announcement (owner-only) or general (any registered user).';

alter table public.liteboards enable row level security;
alter table public.liteboard_creation_codes enable row level security;
alter table public.liteboard_threads enable row level security;
alter table public.liteboard_thread_posts enable row level security;

-- Optional: admins can create a row via POST /api/admin/liteboard/grant (Bearer admin session) when automated creator checks fail.
