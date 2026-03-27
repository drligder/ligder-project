-- 012 — Make on-chain attestations retryable (pending/failed/confirmed)
-- Run after 011.

alter table public.forum_onchain_attestations
  add column if not exists status text not null default 'confirmed';

alter table public.forum_onchain_attestations
  add column if not exists attempts integer not null default 0;

alter table public.forum_onchain_attestations
  add column if not exists last_error text;

alter table public.forum_onchain_attestations
  add column if not exists updated_at timestamptz not null default now();

-- Allow pending rows before the tx is broadcast.
alter table public.forum_onchain_attestations
  alter column tx_sig drop not null;

-- Note: if you already have rows, they remain 'confirmed' and tx_sig is present.

