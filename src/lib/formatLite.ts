/** Whole LITE tokens (UI units). Used for “% of supply” next to compact holdings in thread sidebar. */
export const LITE_UI_TOTAL_SUPPLY = 1_000_000_000;

/** Parse profile / API `lite_holdings_ui` into a finite number of whole tokens (best effort). */
export function parseLiteHoldingsUiNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n =
    typeof v === 'number' ? v : parseFloat(String(v).trim().replace(/\s/g, '').replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return n;
}

function stripTrailingDecimalZeros(s: string): string {
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** Compact token count: 147K, 27.5M, 100M (for sidebar). */
export function formatLiteHoldingsCompact(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    let s: string;
    if (m >= 100) s = m.toFixed(0);
    else if (m >= 10) s = m.toFixed(1);
    else s = m.toFixed(2);
    return `${sign}${stripTrailingDecimalZeros(s)}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    const s = k >= 100 ? k.toFixed(0) : k.toFixed(1);
    return `${sign}${stripTrailingDecimalZeros(s)}K`;
  }
  if (abs === Math.trunc(abs)) return `${sign}${Math.trunc(abs)}`;
  return `${sign}${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** Percent of fixed 1B UI supply for display, e.g. 10%, 0.015%. */
export function formatLiteSupplyPercentUi(holdings: number): string {
  if (!Number.isFinite(holdings) || holdings <= 0) return '0%';
  const pct = (holdings / LITE_UI_TOTAL_SUPPLY) * 100;
  if (pct >= 10) return `${stripTrailingDecimalZeros(pct.toFixed(1))}%`;
  if (pct >= 1) return `${stripTrailingDecimalZeros(pct.toFixed(2))}%`;
  if (pct >= 0.01) return `${stripTrailingDecimalZeros(pct.toFixed(3))}%`;
  return '<0.01%';
}

export type LiteSidebarFormat = { compact: string; pctLabel: string };

export function formatLiteHoldingsSidebar(
  v: string | number | null | undefined
): LiteSidebarFormat | null {
  const n = parseLiteHoldingsUiNumber(v);
  if (n === null) return null;
  return {
    compact: formatLiteHoldingsCompact(n),
    pctLabel: formatLiteSupplyPercentUi(n),
  };
}

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
