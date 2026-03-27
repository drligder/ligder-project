/** API may return thread_number as number or string (PostgREST / JSON edge cases). */
export function threadListNumber(t: { thread_number?: unknown }): number | null {
  const v = t.thread_number;
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}
