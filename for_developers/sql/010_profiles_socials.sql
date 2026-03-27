-- 010 — Profile socials (GitHub + X/Twitter handles)

-- Stored as handles (no @). Empty/NULL = not set.
alter table public.profiles
  add column if not exists github_handle text,
  add column if not exists x_handle text;

comment on column public.profiles.github_handle is 'GitHub handle without @ (e.g. "octocat").';
comment on column public.profiles.x_handle is 'X handle without @ (e.g. "jack").';

