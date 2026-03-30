/** pump.fun-style market cap in USD (compact). */
export function formatUsdMarketCap(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(n);
}

/** Implied $/token (e.g. usd_market_cap / 1e9). */
export function formatUsdPerToken(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n < 0.0001 ? 8 : n < 1 ? 6 : 4,
  }).format(n);
}
