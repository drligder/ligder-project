import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useWallet } from '../contexts/WalletContext';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';
import { formatUsdMarketCap, formatUsdPerToken } from '../lib/formatUsd';
import { liteboardTokenLabel } from '../lib/liteboardTokenLabel';
import { parseApiJson } from '../lib/parseApiJson';
import {
  type LiteboardExplorerRow,
  type LiteboardSortKey,
  sortLiteboardRows,
} from '../lib/sortLiteboardRows';

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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = q.trim().length >= 3 ? `?q=${encodeURIComponent(q.trim())}` : '';
      const r = await fetch(apiUrl(`/api/liteboards${qs}`));
      const j = await parseApiJson<{ liteboards?: LiteboardExplorerRow[]; error?: string }>(r);
      if (!r.ok) {
        throw new Error(j.error || 'Failed to load');
      }
      setRows(j.liteboards ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(() => sortLiteboardRows(rows, sortKey), [rows, sortKey]);

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
            Browse community mini-forums tied to pump.fun tokens. Search by mint, or sort by market cap and
            activity.
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
          />
          <button
            type="button"
            className="text-sm px-4 py-2.5 border border-slate-800 bg-white rounded-lg shadow-sm hover:bg-slate-50 font-medium"
            style={{ fontFamily: 'Arial, sans-serif' }}
            onClick={() => void load()}
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
              onChange={(e) => setSortKey(e.target.value as LiteboardSortKey)}
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

        {loading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : err ? (
          <p className="text-sm text-red-800">{err}</p>
        ) : sortedRows.length === 0 ? (
          <p className="text-sm text-slate-600">
            No Liteboards yet{q.trim().length >= 3 ? ' for that search' : ''}.
          </p>
        ) : (
          <ul className="list-none m-0 p-0 space-y-4">
            {sortedRows.map((lb) => {
              const label = liteboardTokenLabel(lb.token_name, lb.token_symbol);
              const tc = Number(lb.threads_count) || 0;
              const pc = Number(lb.posts_count) || 0;
              return (
                <li key={lb.id}>
                  <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(0,20rem)] gap-0">
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

                      <div className="border-t md:border-t-0 md:border-l border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <div
                            className="rounded-lg bg-white border border-slate-200/90 px-3 py-2.5 text-center shadow-sm"
                            title="USD market cap (pump.fun)"
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                              Mkt cap
                            </div>
                            <div className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">
                              {formatUsdMarketCap(lb.usd_market_cap ?? null)}
                            </div>
                          </div>
                          <div
                            className="rounded-lg bg-white border border-slate-200/90 px-3 py-2.5 text-center shadow-sm"
                            title="usd_market_cap ÷ 10⁹ (pump.fun convention)"
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                              1 token
                            </div>
                            <div className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">
                              {formatUsdPerToken(lb.token_price_usd ?? null)}
                            </div>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-200/90 px-3 py-2.5 text-center shadow-sm">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                              Threads
                            </div>
                            <div className="text-sm font-semibold text-slate-900 tabular-nums">{tc}</div>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-200/90 px-3 py-2.5 text-center shadow-sm">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                              Posts
                            </div>
                            <div className="text-sm font-semibold text-slate-900 tabular-nums">{pc}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default LiteboardExplorerPage;
