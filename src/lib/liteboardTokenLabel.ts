/** One line for headers: "Name (TICKER)" or whichever fields exist. */
export function liteboardTokenLabel(
  token_name?: string | null,
  token_symbol?: string | null
): string | null {
  const n = token_name?.trim();
  const s = token_symbol?.trim();
  if (n && s) return `${n} (${s})`;
  if (n) return n;
  if (s) return s;
  return null;
}
