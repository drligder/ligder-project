-- 019 — Dividends (fee pool deposits -> 6h snapshots -> per-wallet claims)
-- Assumptions:
-- - LITE has 6 decimals (base units are raw SPL token amounts)
-- - Deposits are submitted by admin as tx signatures (idempotent on tx_sig)
-- - Snapshots are finalized every 6 hours on server time.

create table if not exists public.dividend_periods (
  period_id bigint primary key, -- unix seconds at period start bucket
  period_start_unix bigint not null,
  period_end_unix bigint not null,
  status text not null default 'open', -- open | finalizing | finalized
  deposit_total_raw bigint not null default 0,
  claimable_pot_raw bigint not null default 0, -- 75% of deposits
  management_reserve_raw bigint not null default 0, -- 25% of deposits
  snapshot_taken_at timestamptz,
  snapshot_total_balance_raw bigint,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dividend_periods_end_idx
  on public.dividend_periods (period_end_unix desc);

create table if not exists public.dividend_deposits (
  id uuid primary key default gen_random_uuid(),
  tx_sig text not null unique,
  dev_wallet text not null,
  treasury_wallet text not null,
  amount_raw bigint not null,
  deposit_period_id bigint not null references public.dividend_periods (period_id) on delete cascade,
  block_time timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists dividend_deposits_period_idx
  on public.dividend_deposits (deposit_period_id);

create table if not exists public.dividend_wallet_entitlements (
  period_id bigint not null references public.dividend_periods (period_id) on delete cascade,
  wallet text not null references public.profiles (wallet) on delete cascade,
  balance_snapshot_raw bigint not null,
  share_bps bigint not null, -- share of snapshot total in basis points (1/100 of a percent)
  entitlement_raw bigint not null, -- how much LITE user can claim for this period
  claimed_amount_raw bigint not null default 0,
  claim_tx_sig text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (period_id, wallet)
);

create index if not exists dividend_wallet_entitlements_wallet_idx
  on public.dividend_wallet_entitlements (wallet, period_id desc);

alter table public.dividend_periods enable row level security;
alter table public.dividend_deposits enable row level security;
alter table public.dividend_wallet_entitlements enable row level security;

