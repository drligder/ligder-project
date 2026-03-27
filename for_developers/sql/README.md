# SQL (Supabase / Postgres)

All **hand-run** database setup and migrations for Ligder live here. We use **numeric prefixes** so the intended order is obvious (`001_`, `002_`, …).

## How to apply

1. Open your Supabase project → **SQL** → **New query**.
2. Run scripts **in ascending numeric order** (001 before 002, etc.).
3. Prefer running each file as a single transaction in the editor unless a file says otherwise (e.g. `005` has an optional two-step flow).

For production, you can use `psql`, Supabase CLI migrations, or CI—what matters is that the **same SQL** eventually runs against the database your API uses.

## Prerequisites

- **001** assumes a normal Supabase Postgres project (`gen_random_uuid()`, etc.).
- **RLS** is enabled on several tables; the **API uses the service role** and bypasses RLS. Do not expose the service key in the browser.

## Files (run in order)

| File | Description |
|------|-------------|
| [`001_profiles.sql`](001_profiles.sql) | Core `profiles` (wallet ↔ username). Base for most features. |
| [`002_profiles_account.sql`](002_profiles_account.sql) | Avatar URL, forum stats, cached LITE columns on `profiles`. |
| [`003_storage_avatars.sql`](003_storage_avatars.sql) | Supabase Storage bucket + policies for profile avatars. |
| [`004_forum_post_votes.sql`](004_forum_post_votes.sql) | `forum_post_votes` — per-post up/down (one row per wallet per `post_id`). |
| [`005_forum_posts.sql`](005_forum_posts.sql) | `forum_posts` — maps legacy/text `post_id` → `author_wallet` for reputation. Optional STEP 2 sample inserts after you register matching test users. |
| [`006_profiles_admin.sql`](006_profiles_admin.sql) | `profiles.is_admin` for staff / admin-only boards. |
| [`007_forum_boards_threads.sql`](007_forum_boards_threads.sql) | `forum_boards`, `forum_threads`; seeds LIGDER OFFICIAL boards. |
| [`008_forum_thread_posts.sql`](008_forum_thread_posts.sql) | `thread_number` on threads; `forum_thread_posts` (OP + replies). |
| [`009_admin_acp.sql`](009_admin_acp.sql) | `is_moderator`, per-board `min_rank_*`, `profile_bans`. |
| [`010_profiles_socials.sql`](010_profiles_socials.sql) | `github_handle`, `x_handle` on `profiles`. |
| [`011_forum_onchain_attestations.sql`](011_forum_onchain_attestations.sql) | `forum_onchain_attestations` — Memo attestation audit trail. |
| [`012_forum_onchain_attestations_status.sql`](012_forum_onchain_attestations_status.sql) | Retryable status: `pending` / `failed` / `confirmed`, `attempts`, `last_error`, nullable `tx_sig`. |
| [`013_ligder_general_boards.sql`](013_ligder_general_boards.sql) | **LIGDER GENERAL** section: General Chat, Suggestions, Introductions (community boards). |
| [`014_ligder_technical_boards.sql`](014_ligder_technical_boards.sql) | **LIGDER TECHNICAL** section: Development & Technical Discussion. |
| [`019_dividends_schema.sql`](019_dividends_schema.sql) | Dividends: 6-hour periods, admin deposits, per-wallet entitlements. |
| [`020_forum_polls.sql`](020_forum_polls.sql) | Forum polls: one poll per post, options, signed ballots; API + Memo kinds `poll_create` / `poll_ballot`. |
| [`021_liteboards.sql`](021_liteboards.sql) | **Liteboards**: per-SPL-mint mini forums (`liteboards`, one-time deploy codes, `liteboard_threads` / `liteboard_thread_posts`; announcement vs general). |

### Optional / destructive (not part of the main sequence)

| File | Description |
|------|-------------|
| [`dev_wipe_profiles.sql`](dev_wipe_profiles.sql) | **Dev only** — wipes profile-related data. Read the file before running. |

---

## Schema map (after 012)

- **`profiles`** — Wallet, username, reputation, admin/mod flags, avatar, LITE cache, socials.
- **`forum_boards`** / **`forum_threads`** / **`forum_thread_posts`** — Current forum model (URLs use `board_id` + `thread_number`).
- **`forum_post_votes`** — Votes keyed by `post_id` (string; UUIDs from `forum_thread_posts` as text).
- **`forum_posts`** — Optional author map for reputation samples / legacy `post_id` strings.
- **`forum_onchain_attestations`** — One row per relayed Memo attestation (hashes + metadata + tx sig when confirmed).
- **`forum_polls`** / **`forum_poll_options`** / **`forum_poll_ballots`** — Optional poll per post; one ballot per wallet per poll (after 020).
- **`profile_bans`** — Active bans by wallet.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-27 | `020` — Forum polls (`forum_polls`, options, ballots); `018` truncates poll tables when present. |
| 2026-03-26 | `014` — Ligder Technical board (`LIGDER TECHNICAL`). |
| 2026-03-26 | `013` — Ligder General boards (section `LIGDER GENERAL`). |
| 2026-03-26 | README refresh: documented 006–012, optional `dev_wipe`, schema map, API alignment notes. |
| 2026-03-25 | Initial `profiles` + RLS (API uses service role). |
| 2026-03-25 | `forum_post_votes`, `forum_posts` (reputation linkage). |

---

## Adding a new migration

1. Create `00N_short_name.sql` with a header comment (purpose, dependencies).
2. Add a row to **Files** above and an entry under **Changelog**.
3. Mention required API / frontend / env updates in the PR description.
