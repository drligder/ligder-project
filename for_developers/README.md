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
| `/liteboard/deploy` | Self-serve Liteboard creation (pump.fun–listed mints only; signed verify + create flow). |
| `/liteboard/explorer` | Paginated list of Liteboards (search, sort by market cap / activity). |
| `/liteboard/:mint` | Hub for one token: channels + optional pump.fun market stats. |
| `/liteboard/:mint/:channel` | Channel thread list (`announcement` or `general`). |
| `/liteboard/:mint/:channel/:threadNumber` | Thread view (posts, replies). |

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
- `POST /api/admin/liteboard/grant` — staff-only: insert a `liteboards` row when automated pump.fun / creator checks block deploy (Bearer admin session).

**Liteboards (per-SPL-mint mini forums; requires migration `021_liteboards.sql`)**

- `POST /api/liteboard/verify-mint` — wallet signs a message; server checks mint against **pump.fun** public coin API and (when configured) creator authority; returns a **one-time code** hashed in `liteboard_creation_codes`.
- `POST /api/liteboard/create` — registered user signs with code to create `liteboards` row; code is consumed.
- `POST /api/liteboard/delete` — owner signs to delete board + threads + posts.
- `GET /api/liteboards` — explorer list: query params `page`, `limit`, `sort` (`newest` \| `mc_desc` \| `mc_asc` \| `threads_desc` \| `posts_desc`), optional `q` (mint substring, min length 3).
- `GET /api/liteboards/:mint` — single board + **pump.fun**-derived `token_name`, `token_symbol`, `usd_market_cap`, `token_price_usd` when available.
- `GET /api/liteboards/:mint/threads` — threads for a channel (`channel=announcement` \| `general`).
- `GET /api/liteboards/:mint/threads/:threadNum` — thread + posts (same channel query as above).
- `POST /api/liteboard/threads` — new thread (signed; announcement channel restricted to board owner).
- `POST /api/liteboard/replies` — reply (signed).

Exact payloads and auth rules live in `server/index.mjs` (search for the route path).

### Domain concepts

- **Boards & threads:** `forum_boards` → `forum_threads` (per-board `thread_number` in URLs). Posts live in `forum_thread_posts` (OP + replies).
- **Votes:** `forum_post_votes` uses `post_id` as text (matches post UUID string). Legacy `forum_posts` still links some `post_id` → author for reputation where used.
- **Ranks:** `profiles.is_admin`, `profiles.is_moderator`; boards can set `min_rank_start_thread` / `min_rank_reply` (see migration `009`).
- **Bans:** `profile_bans` — active bans block forum actions and are enforced in API handlers.
- **On-chain attestations:** Rows in `forum_onchain_attestations` (after `011` + `012`) track relay status (`pending` / `failed` / `confirmed`), retries, and optional `last_error`. The API runs a **periodic retry** for failed attestations when the server process is up.
- **Liteboards:** `liteboards` (one row per SPL mint), `liteboard_creation_codes` (hashed one-time deploy codes), `liteboard_threads` / `liteboard_thread_posts` (channels `announcement` \| `general`). Deploy is gated on **pump.fun** listing + mint metadata; implied $/token in UI uses `usd_market_cap ÷ 10⁹` (pump convention). See `021_liteboards.sql`.

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
| `VITE_API_BASE` | Optional locally; **required at build time** for static hosting when the API is on another origin (see **Production hosting** below) |

---

## Production hosting (Netlify + Railway)

This repo is often deployed as:

| Piece | Role |
|-------|------|
| **Railway (or similar)** | Runs **`npm start`** → `node server/index.mjs`. Set **`PORT`** (Railway injects it), **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`**, and other server-only vars from `.env.example`. Use the **public** URL shown under Networking (HTTPS), not `.railway.internal`. |
| **Netlify (or similar)** | Serves the Vite build from **`dist/`**. Build command **`npm run build`**, publish **`dist`**. |

**Why two hosts:** Netlify only serves static files; the Express API must run on a Node host.

**`VITE_API_BASE`:** Set to the API **origin** only, e.g. `https://your-api.up.railway.app` (**include `https://`**, no trailing slash). It is baked into the client at build time — **not** a secret. Netlify must expose this variable to **builds** (or set it under **`[build.environment]`** in `netlify.toml` in the repo; update that URL when your API host changes).

**`scripts/netlify-prebuild.mjs`:** Runs before `vite build`. It reads **`process.env.VITE_API_BASE`** and writes **`public/_redirects`** so Netlify proxies **`/api/*`** to your Railway API. That way the browser can use same-origin **`/api/...`** without CORS issues. `public/_redirects` is gitignored; it is generated on each deploy.

**GitHub:** Railway and Netlify should point at the same repo/branch you develop on.

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

Production static hosting: build the client, point `VITE_API_BASE` at your deployed API, and run the Node server (or equivalent) for `/api`. See **Production hosting (Netlify + Railway)** above for the split-deploy pattern used in this project.

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
