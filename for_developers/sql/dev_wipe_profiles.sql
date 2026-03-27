-- Dev / testing only — clears registrations so you can reuse the same wallet.
-- Run in Supabase → SQL Editor. Do not use on production data you care about.

-- Wipe all rows (fast; resets the table)
truncate table public.profiles;

-- Or delete a single wallet only (replace with your base58 public key):
-- delete from public.profiles where wallet = 'YOUR_PHANTOM_PUBLIC_KEY_HERE';

-- Clearing the DB does NOT fix "reserved" usernames: the API blocks certain names
-- (admin, moderator, ligder, lite, support, system, root, null) in server/index.mjs — use another name.

-- Client localStorage key `ligder_forum_profile` is only for the UI; it does not reserve a username.
-- To clear it: DevTools (F12) → Application → Storage → Local Storage → your site URL → delete
-- `ligder_forum_profile` or right‑click → Clear. Or run in the browser console:
--   localStorage.removeItem('ligder_forum_profile')
