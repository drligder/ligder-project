-- 018 — Forum hard reset (preserve profiles/admin users)
--
-- What this script does:
-- - Wipes forum runtime data (threads, posts, votes, archive attestations, PMs, bans)
-- - Keeps `profiles` untouched (wallets, usernames, is_admin/is_moderator, avatars, socials)
-- - Keeps `forum_boards` untouched (section/board structure remains)
--
-- Safe to run on environments that may not have every table yet.

begin;

do $$
begin
  -- Polls (020) reference forum_thread_posts — clear before posts if present.
  if to_regclass('public.forum_poll_ballots') is not null then
    execute 'truncate table public.forum_poll_ballots restart identity cascade';
  end if;
  if to_regclass('public.forum_poll_options') is not null then
    execute 'truncate table public.forum_poll_options restart identity cascade';
  end if;
  if to_regclass('public.forum_polls') is not null then
    execute 'truncate table public.forum_polls restart identity cascade';
  end if;

  -- Truncate FK-connected forum runtime tables together.
  if to_regclass('public.forum_threads') is not null
     and to_regclass('public.forum_thread_posts') is not null
     and to_regclass('public.forum_onchain_attestations') is not null
  then
    execute 'truncate table public.forum_onchain_attestations, public.forum_post_votes, public.forum_posts, public.forum_thread_posts, public.forum_threads restart identity cascade';
  elsif to_regclass('public.forum_threads') is not null
     and to_regclass('public.forum_thread_posts') is not null
  then
    execute 'truncate table public.forum_post_votes, public.forum_posts, public.forum_thread_posts, public.forum_threads restart identity cascade';
  elsif to_regclass('public.forum_threads') is not null then
    execute 'truncate table public.forum_threads restart identity cascade';
  end if;

  if to_regclass('public.forum_private_messages') is not null then
    execute 'truncate table public.forum_private_messages restart identity cascade';
  end if;

  if to_regclass('public.profile_pm_keys') is not null then
    execute 'truncate table public.profile_pm_keys restart identity cascade';
  end if;

  if to_regclass('public.profile_bans') is not null then
    execute 'truncate table public.profile_bans restart identity cascade';
  end if;
end $$;

commit;

-- Optional (manual): if you also want to reset board definitions, run:
-- truncate table public.forum_boards cascade;
-- then re-run board seed migrations (007, 013, 014, 016).
