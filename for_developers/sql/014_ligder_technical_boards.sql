-- 014 — Ligder Technical section: development discussion (run after 007 + 009)

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
    'ligder-technical-development',
    'LIGDER TECHNICAL',
    'Development & Technical Discussion',
    'Protocol, smart contracts, integrations, and developer topics.',
    1,
    false,
    'chat',
    'member',
    'member'
  )
on conflict (id) do nothing;
