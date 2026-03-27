import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { useWallet } from '../contexts/WalletContext';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';

const LiteboardHubPage = () => {
  const { mint: mintParam } = useParams<{ mint: string }>();
  const mint = mintParam ? decodeURIComponent(mintParam) : '';
  const { publicKey } = useWallet();
  const { isRegistered, profileLoading } = useLigderProfile();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [lb, setLb] = useState<{
    id: string;
    mint: string;
    owner_wallet: string;
    created_at: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!mint) {
      setErr('Missing mint');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl(`/api/liteboards/${encodeURIComponent(mint)}`));
      const j = await parseApiJson<{
        liteboard?: { id: string; mint: string; owner_wallet: string; created_at: string };
        error?: string;
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || 'Not found');
      }
      setLb(j.liteboard ?? null);
    } catch (e) {
      setLb(null);
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [mint]);

  useEffect(() => {
    void load();
  }, [load]);

  const encMint = encodeURIComponent(mint);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Link to="/forums" className="text-blue-700 underline">
              Forums
            </Link>
            <Link to="/liteboard/explorer" className="text-blue-700 underline">
              Explorer
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <LoginDropdown />
            {showRegister ? (
              <Link to="/forums/register" className="text-sm px-3 py-1.5 border border-gray-400 bg-white text-blue-700">
                Register
              </Link>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : err ? (
          <p className="text-sm text-red-800">{err}</p>
        ) : lb ? (
          <>
            <h1 className="text-xl font-bold mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
              Liteboard
            </h1>
            <p className="text-xs font-mono text-gray-700 break-all mb-6">{lb.mint}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Link
                to={`/liteboard/${encMint}/announcement`}
                className="block border border-gray-400 p-4 hover:bg-gray-50 no-underline text-gray-900"
              >
                <h2 className="text-base font-bold m-0 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Announcement
                </h2>
                <p className="text-sm text-gray-600 m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
                  Owner-only updates for this token.
                </p>
              </Link>
              <Link
                to={`/liteboard/${encMint}/general`}
                className="block border border-gray-400 p-4 hover:bg-gray-50 no-underline text-gray-900"
              >
                <h2 className="text-base font-bold m-0 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                  General
                </h2>
                <p className="text-sm text-gray-600 m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
                  Community chat for registered Ligder users.
                </p>
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default LiteboardHubPage;
