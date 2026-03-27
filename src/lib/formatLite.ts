/** Whole $LITE amount only; thousands grouped with spaces (e.g. 1 000 000), no decimals. */
export function formatLiteHoldings(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(/\s/g, ''));
  if (!Number.isFinite(n)) return String(v);
  const whole = Math.trunc(n);
  const neg = whole < 0;
  const abs = Math.abs(whole);
  const grouped = abs
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return neg ? `-${grouped}` : grouped;
}
