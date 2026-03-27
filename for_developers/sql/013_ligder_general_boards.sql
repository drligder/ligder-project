-- 013 — Ligder General section: community boards (run after 007 + 009)

insert into public.forum_boards (
  id,
  section,
  title,
  description,
  sort_order,
  admin_only_post,
  icon_key,
  min_rank_start_thread,
  min_rank_reply
) values
  (
    'ligder-general-chat',
    'LIGDER GENERAL',
    'General Chat',
    'Open discussion about Ligder, Solana, and the community.',
    1,
    false,
    'chat',
    'member',
    'member'
  ),
  (
    'ligder-general-suggestions',
    'LIGDER GENERAL',
    'Suggestions',
    'Ideas and feedback for the project and the forum.',
    2,
    false,
    'chat',
    'member',
    'member'
  ),
  (
    'ligder-general-introductions',
    'LIGDER GENERAL',
    'Introductions',
    'Say hello and tell us a bit about yourself.',
    3,
    false,
    'chat',
    'member',
    'member'
  )
on conflict (id) do nothing;
