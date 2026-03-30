import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useWallet } from '../contexts/WalletContext';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';
import { formatUsdMarketCap, formatUsdPerToken } from '../lib/formatUsd';
import { liteboardTokenLabel } from '../lib/liteboardTokenLabel';
import { parseApiJson } from '../lib/parseApiJson';
import type { LiteboardExplorerRow, LiteboardSortKey } from '../lib/sortLiteboardRows';

const PAGE_SIZE = 10;

const SORT_OPTIONS: { value: LiteboardSortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'mc_desc', label: 'Market cap · high → low' },
  { value: 'mc_asc', label: 'Market cap · low → high' },
  { value: 'threads_desc', label: 'Most threads' },
  { value: 'posts_desc', label: 'Most posts' },
];

const LiteboardExplorerPage = () => {
  const { publicKey } = useWallet();
  const { isRegistered, profileLoading } = useLigderProfile();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [q, setQ] = useState('');
  const [rows, setRows] = useState<LiteboardExplorerRow[]>([]);
  const [sortKey, setSortKey] = useState<LiteboardSortKey>('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  /** Bumps when user clicks Search so we refetch even if already on page 1. */
  const [searchNonce, setSearchNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      params.set('sort', sortKey);
      if (q.trim().length >= 3) {
        params.set('q', q.trim());
      }
      const r = await fetch(apiUrl(`/api/liteboards?${params.toString()}`));
      const j = await parseApiJson<{
        liteboards?: LiteboardExplorerRow[];
        page?: number;
        total_pages?: number;
        total_count?: number;
        error?: string;
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || 'Failed to load');
      }
      setRows(j.liteboards ?? []);
      setTotalPages(Math.max(1, Number(j.total_pages) || 1));
      setTotalCount(Number(j.total_count) || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
      setTotalPages(1);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [q, page, sortKey, searchNonce]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = () => {
    setPage(1);
    setSearchNonce((n) => n + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100/80 to-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <Link to="/forums" className="text-blue-700 hover:text-blue-900 underline">
            ← Forums
          </Link>
          <div className="flex items-center gap-2">
            <LoginDropdown />
            {showRegister ? (
              <Link
                to="/forums/register"
                className="text-sm px-3 py-1.5 border border-gray-400 bg-white text-blue-700 rounded shadow-sm"
              >
                Register
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
            Liteboard Explorer
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl" style={{ fontFamily: 'Times New Roman, serif' }}>
            Browse community mini-forums tied to pump.fun tokens. Search by mint, sort by market cap or activity,
            and flip pages ({PAGE_SIZE} boards per page).
          </p>
        </div>

        <p className="text-xs text-amber-900 border border-amber-200/80 bg-amber-50 px-3 py-2.5 rounded-lg mb-6 shadow-sm" style={{ fontFamily: 'Arial, sans-serif' }}>
          <strong>Deploy</strong> is limited to tokens listed on <strong>pump.fun</strong> for now.
        </p>

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-6">
          <input
            type="search"
            className="flex-1 min-w-[12rem] text-sm border border-slate-300 rounded-lg px-3 py-2.5 font-mono bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400/40"
            placeholder="Mint address (3+ chars to filter)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runSearch();
              }
            }}
          />
          <button
            type="button"
            className="text-sm px-4 py-2.5 border border-slate-800 bg-white rounded-lg shadow-sm hover:bg-slate-50 font-medium"
            style={{ fontFamily: 'Arial, sans-serif' }}
            onClick={() => runSearch()}
          >
            Search
          </button>
          <div className="flex items-center gap-2 sm:ml-auto">
            <label htmlFor="lb-sort" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Sort
            </label>
            <select
              id="lb-sort"
              value={sortKey}
              onChange={(e) => {
                setSortKey(e.target.value as LiteboardSortKey);
                setPage(1);
              }}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white shadow-sm min-w-[12rem] focus:outline-none focus:ring-2 focus:ring-slate-400/40"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs mb-6">
          <Link to="/liteboard/deploy" className="text-blue-800 font-medium underline hover:text-blue-950">
            Deploy your own Liteboard
          </Link>
        </p>

        {!loading && !err && totalCount > 0 ? (
          <p className="text-xs text-slate-500 mb-4" style={{ fontFamily: 'Arial, sans-serif' }}>
            {totalCount} board{totalCount === 1 ? '' : 's'}
            {sortKey !== 'newest' ? ' · sorted from up to 400 most recent matches' : ''}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : err ? (
          <p className="text-sm text-red-800">{err}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-600">
            No Liteboards yet{q.trim().length >= 3 ? ' for that search' : ''}.
          </p>
        ) : (
          <>
            <ul className="list-none m-0 p-0 space-y-4">
              {rows.map((lb) => {
                const label = liteboardTokenLabel(lb.token_name, lb.token_symbol);
                const tc = Number(lb.threads_count) || 0;
                const pc = Number(lb.posts_count) || 0;
                const statBox =
                  'rounded-lg bg-white border border-slate-200/90 px-2 py-2 sm:px-3 sm:py-2.5 text-center shadow-sm min-w-0';
                const statLabel =
                  'text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5 leading-tight';
                const statValue =
                  'text-xs sm:text-sm font-semibold text-slate-900 tabular-nums leading-tight truncate';
                return (
                  <li key={lb.id}>
                    <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                      <Link
                        to={`/liteboard/${encodeURIComponent(lb.mint)}`}
                        className="block p-4 sm:p-5 no-underline text-inherit hover:bg-slate-50/80 min-w-0"
                      >
                        {label ? (
                          <div
                            className="text-lg font-bold text-slate-900 mb-1 leading-tight"
                            style={{ fontFamily: 'Arial, sans-serif' }}
                          >
                            {label}
                          </div>
                        ) : (
                          <div
                            className="text-sm font-semibold text-slate-500 mb-1 uppercase tracking-wide"
                            style={{ fontFamily: 'Arial, sans-serif' }}
                          >
                            Liteboard
                          </div>
                        )}
                        <div className="text-blue-800 font-mono text-xs sm:text-sm break-all underline hover:text-blue-950 decoration-blue-800/80">
                          {lb.mint}
                        </div>
                        <p className="text-xs text-slate-500 mt-2 m-0" style={{ fontFamily: 'Arial, sans-serif' }}>
                          Added {new Date(lb.created_at).toLocaleString()}
                        </p>
                      </Link>

                      <div className="border-t border-slate-200 bg-slate-50/50 px-2 sm:px-4 py-3">
                        <div
                          className="grid grid-cols-4 gap-1.5 sm:gap-2"
                          style={{ fontFamily: 'Arial, sans-serif' }}
                        >
                          <div className={statBox} title="USD market cap (pump.fun)">
                            <div className={statLabel}>Mkt cap</div>
                            <div className={statValue} title={formatUsdMarketCap(lb.usd_market_cap ?? null)}>
                              {formatUsdMarketCap(lb.usd_market_cap ?? null)}
                            </div>
                          </div>
                          <div className={statBox} title="usd_market_cap ÷ 10⁹ (pump.fun convention)">
                            <div className={statLabel}>1 token</div>
                            <div className={statValue} title={formatUsdPerToken(lb.token_price_usd ?? null)}>
                              {formatUsdPerToken(lb.token_price_usd ?? null)}
                            </div>
                          </div>
                          <div className={statBox}>
                            <div className={statLabel}>Threads</div>
                            <div className={statValue}>{tc}</div>
                          </div>
                          <div className={statBox}>
                            <div className={statLabel}>Posts</div>
                            <div className={statValue}>{pc}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 ? (
              <nav
                className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4 border-t border-slate-200 pt-6"
                aria-label="Pagination"
                style={{ fontFamily: 'Arial, sans-serif' }}
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="text-sm px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600 tabular-nums">
                  Page <strong className="text-slate-900">{page}</strong> of{' '}
                  <strong className="text-slate-900">{totalPages}</strong>
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="text-sm px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default LiteboardExplorerPage;
