import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useWallet } from '../contexts/WalletContext';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';

type LiteboardRow = {
  id: string;
  mint: string;
  owner_wallet: string;
  created_at: string;
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
        <p className="text-sm text-gray-700 mb-4" style={{ fontFamily: 'Times New Roman, serif' }}>
          Search by mint address (prefix ok). Open a board to read or post in General (registered users).
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
            {rows.map((lb) => (
              <li key={lb.id} className="p-3 hover:bg-gray-50">
                <Link
                  to={`/liteboard/${encodeURIComponent(lb.mint)}`}
                  className="text-blue-800 font-mono text-sm break-all underline hover:text-blue-950"
                >
                  {lb.mint}
                </Link>
                <div className="text-xs text-gray-500 mt-1">
                  Since {new Date(lb.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default LiteboardExplorerPage;
