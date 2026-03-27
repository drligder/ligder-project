/**
 * Optional absolute API origin in production, e.g. `https://api.example.com`.
 * Dev: leave unset so requests use `/api` on the same origin (`npm run dev` serves API + app on PORT, default 2000).
 *
 * Use the server **origin only** (`https://host` or `http://127.0.0.1:2000` in local dev).
 * If the value already ends with `/api`, paths like `/api/forum/boards` are merged
 * correctly (avoids `/api/api/...` → 404 "Not found").
 */
export function apiUrl(path: string): string {
  const raw = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ?? '';
  const base = raw.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!base) return p;
  if (base.endsWith('/api') && p.startsWith('/api')) {
    return `${base}${p.slice(4)}`;
  }
  return `${base}${p}`;
}

/**
 * When the boards API returns 404 `{ error: "Not found" }`, the path usually missed the
 * Express router (API not running, wrong host, or `/api/api/...` from mis-set VITE_API_BASE).
 */
export function describeForumApiFailure(
  message: string | undefined,
  status: number
): string {
  if (status === 404 && message === 'Not found') {
    return (
      'Forum API not reachable or route missing. Run `npm run dev` (http://127.0.0.1:2000) or `npm run dev:server` (API only, default 8787). ' +
      'If you set VITE_API_BASE, use the API origin only, e.g. http://127.0.0.1:2000 — not a URL that already duplicates /api.'
    );
  }
  return message || `Request failed (${status})`;
}
