import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useWallet } from '../contexts/WalletContext';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';
import { liteboardTokenLabel } from '../lib/liteboardTokenLabel';
import { parseApiJson } from '../lib/parseApiJson';

type LiteboardRow = {
  id: string;
  mint: string;
  owner_wallet: string;
  created_at: string;
  token_name?: string | null;
  token_symbol?: string | null;
  threads_count?: number;
  posts_count?: number;
};

const LiteboardExplorerPage = () => {
  const { publicKey } = useWallet();
  const { isRegistered, profileLoading } = useLigderProfile();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [q, setQ] = useState('');
  const [rows, setRows] = useState<LiteboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = q.trim().length >= 3 ? `?q=${encodeURIComponent(q.trim())}` : '';
      const r = await fetch(apiUrl(`/api/liteboards${qs}`));
      const j = await parseApiJson<{ liteboards?: LiteboardRow[]; error?: string }>(r);
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

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"
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
                className="text-sm px-3 py-1.5 border border-gray-400 bg-white text-blue-700"
              >
                Register
              </Link>
            ) : null}
          </div>
        </div>

        <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
          Liteboard Explorer
        </h1>
        <p className="text-sm text-gray-700 mb-2" style={{ fontFamily: 'Times New Roman, serif' }}>
          Search by mint address (prefix ok). Open a board to read or post in General (registered users).
        </p>
        <p className="text-xs text-amber-900 border border-amber-200 bg-amber-50 px-3 py-2 mb-4" style={{ fontFamily: 'Arial, sans-serif' }}>
          <strong>Deploying a Liteboard</strong> is limited to tokens listed on{' '}
          <strong>pump.fun</strong> for now. Other launchpads (e.g. LetsBonk) and generic SPL mints are not
          supported for self-serve deploy yet.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="search"
            className="flex-1 min-w-[12rem] text-sm border border-gray-400 px-2 py-2 font-mono"
            placeholder="Mint address (3+ chars to filter)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className="text-sm px-3 py-2 border border-gray-800 bg-white"
            onClick={() => void load()}
          >
            Search
          </button>
        </div>

        <p className="text-xs mb-2">
          <Link to="/liteboard/deploy" className="text-blue-800 underline">
            Deploy your own Liteboard
          </Link>
        </p>

        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : err ? (
          <p className="text-sm text-red-800">{err}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-600">No Liteboards yet{q.trim().length >= 3 ? ' for that search' : ''}.</p>
        ) : (
          <ul className="list-none m-0 p-0 border border-gray-300 divide-y divide-gray-200">
            {rows.map((lb) => {
              const label = liteboardTokenLabel(lb.token_name, lb.token_symbol);
              const tc = Number(lb.threads_count) || 0;
              const pc = Number(lb.posts_count) || 0;
              return (
                <li
                  key={lb.id}
                  className="flex flex-col sm:flex-row sm:items-stretch p-0 hover:bg-gray-50"
                >
                  <Link
                    to={`/liteboard/${encodeURIComponent(lb.mint)}`}
                    className="flex-1 min-w-0 block p-3 no-underline text-gray-900 hover:bg-gray-50"
                  >
                    {label ? (
                      <div
                        className="text-base font-bold mb-1 text-gray-900"
                        style={{ fontFamily: 'Arial, sans-serif' }}
                      >
                        {label}
                      </div>
                    ) : null}
                    <div className="text-blue-800 font-mono text-sm break-all underline hover:text-blue-950">
                      {lb.mint}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Since {new Date(lb.created_at).toLocaleString()}
                    </div>
                  </Link>
                  <div
                    className="flex sm:flex-col justify-end sm:justify-center gap-3 sm:gap-1 px-3 py-3 sm:py-3 sm:min-w-[7.5rem] sm:border-l border-gray-200 text-xs text-gray-600 tabular-nums text-right sm:text-right"
                    style={{ fontFamily: 'Arial, sans-serif' }}
                  >
                    <span>
                      {tc} thread{tc === 1 ? '' : 's'}
                    </span>
                    <span>
                      {pc} post{pc === 1 ? '' : 's'}
                    </span>
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
