-- 002 — Account fields: avatar, forum stats, cached $LITE balance (run after 001)

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists posts_count integer not null default 0,
  add column if not exists threads_started integer not null default 0,
  add column if not exists likes_received integer not null default 0,
  add column if not exists likes_given integer not null default 0,
  add column if not exists lite_holdings_ui numeric,
  add column if not exists lite_holdings_updated_at timestamptz;

comment on column public.profiles.avatar_url is 'HTTPS URL for profile picture shown on posts.';
comment on column public.profiles.lite_holdings_ui is 'Cached $LITE balance; refresh via POST /api/profile/sync-lite.';
