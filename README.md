# Ligder (BIRDHOUSE)

Web app: **Vite + React** frontend, **Node (Express)** API, **Supabase** (Postgres + optional Storage), **Solana** (Phantom wallet, optional Memo attestations via a server fee payer).

## Quick start

```bash
git clone <your-fork-or-repo-url>
cd project
npm install
cp .env.example .env   # Windows: copy .env.example .env
```

Edit `.env`: set at least **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** (server only — never commit `.env` or expose the service key in the browser).

Run the database scripts in **`for_developers/sql/`** in numeric order (see [`for_developers/sql/README.md`](for_developers/sql/README.md)).

### Develop (app + API on one port)

```bash
npm run dev
```

Open **http://127.0.0.1:2000** (default). The API is served on the same origin (`/api/*`).

## Homepage (current)

The homepage (`/`) is now both introduction and entrypoint:

- Hero/banner + concise project intro copy
- Right-aligned **Login / Register** controls directly under the banner
- Quick links into forums and archive flow
- Updated public-facing text covering on-chain attestations, open-source stack, and wallet-native identity

Core forum UX available from the same app:

- Public profile pages at `/forums/u/:username`
- Encrypted private messages at `/forums/messages` (browser-side encryption + on-chain PM metadata attestation)
- Archive verification tooling at `/forums/archive` (including Memo decode)

### Other scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:split` | Vite (port 2000) + API (`SERVER_PORT`, default 8787); Vite proxies `/api` to the API |
| `npm run dev:server` | API only |
| `npm run build` | Production build of the client → `dist/` |
| `npm run preview` | Preview the built client (set `VITE_API_BASE` if the API is elsewhere) |

## Deploy (outline)

1. **Database:** Apply the same SQL your app uses (see `for_developers/sql/`).
2. **API:** Run `node server/index.mjs` (or your process manager) with production env: Supabase keys, `SERVER_PORT` (or your reverse proxy), Solana RPC and optional **`SOLANA_MEMO_FEE_PAYER_SECRET_KEY`** for on-chain forum attestations.
3. **Frontend:** `npm run build` and host `dist/` as static files. If the API is on another origin, set **`VITE_API_BASE`** at build time to that origin (see `.env.example`).

## Documentation

| Doc | Contents |
|-----|----------|
| [`for_developers/README.md`](for_developers/README.md) | Architecture, API overview, env notes, fork/deploy checklist |
| [`for_developers/sql/README.md`](for_developers/sql/README.md) | Migration list and schema map |
| [`.env.example`](.env.example) | Environment variables with comments |

## License / project name

Replace or extend this section with your license and branding if you publish the repo.
