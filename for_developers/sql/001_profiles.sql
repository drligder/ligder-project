-- 001 — Initial profiles table (wallet ↔ username)
-- Run in Supabase → SQL Editor (or equivalent). Safe to re-run if using IF NOT EXISTS patterns.

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  wallet text not null unique,
  username text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists profiles_username_lower on public.profiles (lower(username));

alter table public.profiles enable row level security;

-- No policies: anon cannot read/write by default. The registration API uses the
-- Supabase service role server-side and bypasses RLS for inserts.
