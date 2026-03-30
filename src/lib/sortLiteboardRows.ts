export type LiteboardExplorerRow = {
  id: string;
  mint: string;
  owner_wallet: string;
  created_at: string;
  token_name?: string | null;
  token_symbol?: string | null;
  threads_count?: number;
  posts_count?: number;
  usd_market_cap?: number | null;
  token_price_usd?: number | null;
};

export type LiteboardSortKey =
  | 'newest'
  | 'mc_desc'
  | 'mc_asc'
  | 'threads_desc'
  | 'posts_desc';

function finiteOrNull(n: unknown): number | null {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

/** Client-side sort for explorer (API returns newest-first; this reorders the loaded list). */
export function sortLiteboardRows(
  rows: LiteboardExplorerRow[],
  key: LiteboardSortKey
): LiteboardExplorerRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    switch (key) {
      case 'newest':
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      case 'mc_desc': {
        const na = finiteOrNull(a.usd_market_cap);
        const nb = finiteOrNull(b.usd_market_cap);
        if (na == null && nb == null) return 0;
        if (na == null) return 1;
        if (nb == null) return -1;
        return nb - na;
      }
      case 'mc_asc': {
        const na = finiteOrNull(a.usd_market_cap);
        const nb = finiteOrNull(b.usd_market_cap);
        if (na == null && nb == null) return 0;
        if (na == null) return 1;
        if (nb == null) return -1;
        return na - nb;
      }
      case 'threads_desc':
        return (
          (Number(b.threads_count) || 0) - (Number(a.threads_count) || 0)
        );
      case 'posts_desc':
        return (Number(b.posts_count) || 0) - (Number(a.posts_count) || 0);
      default:
        return 0;
    }
  });
  return out;
}
