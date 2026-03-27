-- 016 — Ligder Governance section: top-holder governance boards
-- Access is enforced by API/business logic for holders >= 0.25% of supply.

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
    'ligder-governance-votes',
    'LIGDER GOVERNANCE',
    'Governance votes',
    'Formal proposals and voting threads for protocol-level decisions.',
    1,
    false,
    'chat',
    'member',
    'member'
  ),
  (
    'ligder-governance-treasury',
    'LIGDER GOVERNANCE',
    'Treasury moves',
    'Treasury allocation proposals, transfers, and budget discussions.',
    2,
    false,
    'chat',
    'member',
    'member'
  ),
  (
    'ligder-governance-protocol',
    'LIGDER GOVERNANCE',
    'Protocol changes',
    'Upgrades, parameter changes, and implementation-level governance threads.',
    3,
    false,
    'chat',
    'member',
    'member'
  )
on conflict (id) do update set
  section = excluded.section,
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order,
  admin_only_post = excluded.admin_only_post,
  icon_key = excluded.icon_key,
  min_rank_start_thread = excluded.min_rank_start_thread,
  min_rank_reply = excluded.min_rank_reply;
