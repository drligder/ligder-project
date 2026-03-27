# For developers & third parties

This folder is the **single place** for material that helps people **fork, deploy, audit, and extend** Ligder without digging through the whole repo. We intend to keep it accurate as the project evolves—if something here drifts from `main`, treat that as a bug to fix in the same PR as the code change.

## What’s in here

| Path | Purpose |
|------|---------|
| [`sql/`](sql/) | **Database scripts** for Supabase / Postgres. Numbered files; **order matters**. See [`sql/README.md`](sql/README.md). |

As the stack grows (more contracts, indexers, ops runbooks), add sibling folders under `for_developers/` with the same pattern: **one README per area**, **numbered or versioned artifacts**, and **changelog lines** when behavior changes.

---

## How the app is wired (current)

### Stack

| Layer | Tech | Notes |
|-------|------|--------|
| **Frontend** | Vite + React + TypeScript + Tailwind (`src/`) | React Router; wallet via Phantom (client context). |
| **Backend** | Node + Express (`server/index.mjs`) | Uses **Supabase service role** only on the server (bypasses RLS). Never expose the service key to the browser. |
| **Database** | Supabase (Postgres + optional Storage) | Hand-run SQL under `for_developers/sql/`. |
| **On-chain** | Solana **Memo** program | Server relays attestations with a configured **fee-payer** keypair; memos contain hashes + IDs, not full post bodies. |

### Frontend routes (high level)

| Path | Purpose |
|------|---------|
| `/` | Homepage + project intro + login/register entrypoint. |
| `/forums` | Forum hub (Ligder Official section, boards table). |
| `/forums/archive` | Paginated on-chain attestation feed (filters + sort). |
| `/forums/u/:username` | Public profile by username (stats + links). |
| `/forums/messages` | Encrypted PM inbox/sent UI (attested metadata tx links). |
| `/forums/ligder-official` | Section landing. |
| `/forums/ligder-official/:boardSlug` | Threads for a board. |
| `/forums/ligder-official/:boardSlug/:threadNumber` | Thread view (posts, votes, replies). |
| `/forums/post-text/:postId` | Read-only full post body (UUID) for sharing / decoder links. |
| `/forums/register` | Username registration (signed message). |
| `/forums/account` | Profile / avatar / LITE holdings / socials. |
| `/forums/admin` | Admin tools (`is_admin` wallets; signed admin API messages). |

### Backend API (Express, all under `/api`)

**Health & profile**

- `GET /api/health`
- `GET /api/lite-holdings` — public-ish LITE metadata helper
- `GET /api/username-check`
- `POST /api/register` — Phantom-signed registration message
- `GET /api/profile` — profile by wallet
- `PATCH /api/profile` — signed updates
- `PATCH /api/profile/socials` — GitHub / X handles
- `POST /api/profile/avatar` — avatar upload (Storage)
- `GET /api/reputation/by-usernames`

**Forum (public + signed actions)**

- `GET /api/forum` — sanity route
- `GET /api/forum/boards` — list boards (optional section filter)
- `GET /api/forum/boards/:slug/threads` — threads on a board
- `GET /api/forum/boards/:slug/threads/:threadNum` — thread + posts payload
- `POST /api/forum/threads` — create thread (signed; may queue Memo attestation)
- `POST /api/forum/thread-replies` — reply (signed)
- `GET /api/forum/thread-posts/:postId` — **public** post body + board/thread metadata (for decoder / deep links)
- `PATCH /api/forum/thread-posts/:postId` — edit own post (signed)
- `GET /api/forum/post-votes` — batch vote tallies
- `POST /api/forum/post-votes` — vote (signed)

**Private messages (encrypted content, attested metadata)**

- `GET /api/pm/key`
- `POST /api/pm/key`
- `GET /api/pm/session-nonce`
- `POST /api/pm/session`
- `POST /api/pm/send`
- `POST /api/pm/list`
- `POST /api/pm/delete`
- `POST /api/pm/clear`

**On-chain / transparency**

- `GET /api/forum/decode-memo-tx` — fetch tx from RPC(s), parse Ligder `v1|tc|…` / `v1|rp|…` / `v1|pv|…` / `v1|pm|…` memos
- `GET /api/forum/onchain-attestations` — archive feed: `limit` (max 100), `offset`, `order`, `status`, etc.

**Admin (`is_admin` profile + signed admin messages)**

- `POST /api/admin/board-update`
- `POST /api/admin/users/search`
- `POST /api/admin/users/patch`
- `POST /api/admin/ban`
- `POST /api/admin/delete-post`

Exact payloads and auth rules live in `server/index.mjs` (search for the route path).

### Domain concepts

- **Boards & threads:** `forum_boards` → `forum_threads` (per-board `thread_number` in URLs). Posts live in `forum_thread_posts` (OP + replies).
- **Votes:** `forum_post_votes` uses `post_id` as text (matches post UUID string). Legacy `forum_posts` still links some `post_id` → author for reputation where used.
- **Ranks:** `profiles.is_admin`, `profiles.is_moderator`; boards can set `min_rank_start_thread` / `min_rank_reply` (see migration `009`).
- **Bans:** `profile_bans` — active bans block forum actions and are enforced in API handlers.
- **On-chain attestations:** Rows in `forum_onchain_attestations` (after `011` + `012`) track relay status (`pending` / `failed` / `confirmed`), retries, and optional `last_error`. The API runs a **periodic retry** for failed attestations when the server process is up.

---

## Environment

Copy **`.env.example`** → **`.env`** in the project root. **Never** commit `.env` or put the **service role** key in `VITE_*` or client code.

Important variables (non-exhaustive; see `.env.example`):

| Variable | Role |
|----------|------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-only DB + Storage admin access |
| `SERVER_PORT` | API-only mode (default **8787**) |
| `PORT` | Used when `DEV_VITE=1` combined dev (default **2000**) |
| `SOLANA_RPC_URL` | Main RPC (balances, etc.) |
| `SOLANA_MEMO_RPC_URL` | Optional separate RPC for Memo relay |
| `SOLANA_MEMO_FEE_PAYER_SECRET_KEY` | Fee payer for relayed Memo txs (required for on-chain attestations) |
| `LITE_TOKEN_MINT` | SPL mint for LITE balance display |
| `VITE_API_BASE` | Optional: API origin for production/static frontends |

---

## Local development

```bash
npm install
# Copy .env.example to .env and fill in Supabase + any Solana keys
npm run dev
```

**`npm run dev`** sets `DEV_VITE=1` and serves **Vite + API on one port** (default `http://127.0.0.1:2000`). Same origin, no proxy needed.

| Script | Use when |
|--------|----------|
| `npm run dev` | Full stack, single port (recommended) |
| `npm run dev:split` | Concurrent: Vite (port 2000) + API (`SERVER_PORT`, default 8787). Vite proxies `/api` → API (see `vite.config.ts`). |
| `npm run dev:client` | Frontend only (needs API elsewhere or proxy) |
| `npm run dev:server` | API only (`server/index.mjs`, no Vite) |
| `npm run build` | Production client bundle to `dist/` |

Production static hosting: build the client, point `VITE_API_BASE` at your deployed API, and run the Node server (or equivalent) for `/api`.

---

## For forks & deployers

1. Run SQL from [`sql/`](sql/) **in numeric order** (see [`sql/README.md`](sql/README.md)).
2. Create a Supabase project; paste **Project URL** + **service role** into server env only.
3. Optional: Storage bucket for avatars (script `003`).
4. Optional but expected for forums v2: configure Solana RPC + **Memo fee payer** for attestations.
5. Deploy the static frontend + Node API (or reimplement the API contract).

---

## Contributing updates to this folder

When you change **schema**, **env vars**, **routes**, or **integration steps**:

1. Add or update the relevant file under `for_developers/sql/` (or a new subfolder).
2. Update the **README in that subfolder** (Files table + Changelog).
3. If the architecture or developer workflow changes, update **this** README in the same PR.

That keeps third parties and future-you aligned with how the project actually runs.
