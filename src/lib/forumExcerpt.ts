/** Collapse whitespace and trim for a one-line-style preview of the parent post */
export function excerptParentBody(body: string, maxLen = 800): string {
  const t = body.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}
