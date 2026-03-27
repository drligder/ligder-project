-- 017 — Standardize board icons:
-- Keep LIGDER OFFICIAL as megaphone; use chat icon for all other sections.

update public.forum_boards
set icon_key = 'chat'
where section <> 'LIGDER OFFICIAL'
  and icon_key <> 'chat';
