-- 015 — Encrypted private messages (client-side ciphertext) + PM public keys
-- Run after 001 + 007.

create table if not exists public.profile_pm_keys (
  wallet text primary key references public.profiles (wallet) on delete cascade,
  enc_public_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forum_private_messages (
  id uuid primary key default gen_random_uuid(),
  sender_wallet text not null references public.profiles (wallet) on delete cascade,
  recipient_wallet text not null references public.profiles (wallet) on delete cascade,
  sender_username text,
  recipient_username text,
  nonce_base64 text not null,
  ciphertext_sender_base64 text not null,
  ciphertext_recipient_base64 text not null,
  cipher_sha256 text not null,
  memo text not null,
  tx_sig text,
  fee_payer text,
  status text not null default 'confirmed',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forum_private_messages_sender_idx
  on public.forum_private_messages (sender_wallet, created_at desc);

create index if not exists forum_private_messages_recipient_idx
  on public.forum_private_messages (recipient_wallet, created_at desc);

create index if not exists forum_private_messages_created_idx
  on public.forum_private_messages (created_at desc);

alter table public.profile_pm_keys enable row level security;
alter table public.forum_private_messages enable row level security;

