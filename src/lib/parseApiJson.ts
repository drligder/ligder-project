/**
 * Parse JSON from a fetch Response. If the body is HTML (common when the API is down,
 * Netlify serves index.html, or Vite returns an error page), throw a clear error.
 */
export async function parseApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    return {} as T;
  }
  // Any HTML/XML — not only <!DOCTYPE (case) or <html — catches <!doctype, <div, etc.
  if (trimmed.startsWith('<')) {
    throw new Error(
      'The API returned a web page instead of JSON. Locally: start the backend (`npm run dev` or `npm run dev:server`). On Netlify: set environment variable VITE_API_BASE to your Railway API origin (e.g. https://xxx.up.railway.app) and redeploy.'
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `Invalid response (${res.status}) — expected JSON from the API. On Netlify set VITE_API_BASE to your Railway URL and redeploy; check the API returns JSON at ${res.url?.slice(0, 120) || 'that URL'}.`
    );
  }
}
