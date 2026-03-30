import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useToast } from '../contexts/ToastContext';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { useWallet } from '../contexts/WalletContext';
import { apiUrl } from '../lib/apiBase';
import { formatUsdMarketCap, formatUsdPerToken } from '../lib/formatUsd';
import { liteboardTokenLabel } from '../lib/liteboardTokenLabel';
import { parseApiJson } from '../lib/parseApiJson';
import { uint8ToBase64 } from '../lib/uint8Base64';

function AnnouncementChannelIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

function GeneralChannelIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

const LiteboardHubPage = () => {
  const { mint: mintParam } = useParams<{ mint: string }>();
  const mint = mintParam ? decodeURIComponent(mintParam) : '';
  const navigate = useNavigate();
  const { publicKey, signMessage } = useWallet();
  const { showToast } = useToast();
  const { isRegistered, profileLoading } = useLigderProfile();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [lb, setLb] = useState<{
    id: string;
    mint: string;
    owner_wallet: string;
    created_at: string;
    token_name?: string | null;
    token_symbol?: string | null;
    usd_market_cap?: number | null;
    token_price_usd?: number | null;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

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
        liteboard?: {
          id: string;
          mint: string;
          owner_wallet: string;
          created_at: string;
          token_name?: string | null;
          token_symbol?: string | null;
          usd_market_cap?: number | null;
          token_price_usd?: number | null;
        };
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
  const tokenLabel = lb != null ? liteboardTokenLabel(lb.token_name, lb.token_symbol) : null;
  const isOwner = Boolean(publicKey && lb && publicKey === lb.owner_wallet);

  const deleteLiteboard = async () => {
    if (!publicKey || !lb) return;
    if (
      !window.confirm(
        'Remove this Liteboard permanently? All threads and posts will be deleted. This cannot be undone.'
      )
    ) {
      return;
    }
    const nonce = crypto.randomUUID();
    const message = [
      'Ligder liteboard delete',
      `Wallet: ${publicKey}`,
      `Mint: ${lb.mint}`,
      `Nonce: ${nonce}`,
    ].join('\n');
    setDeleting(true);
    try {
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/liteboard/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });
      const j = await parseApiJson<{ ok?: boolean; error?: string }>(r);
      if (!r.ok) {
        throw new Error(j.error || 'Delete failed');
      }
      showToast('Liteboard removed.', 'success');
      navigate('/liteboard/explorer');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100/80 to-white text-gray-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm"
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
              <Link to="/forums/register" className="text-sm px-3 py-1.5 border border-gray-400 bg-white text-blue-700 rounded shadow-sm">
                Register
              </Link>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : err ? (
          <p className="text-sm text-red-800">{err}</p>
        ) : lb ? (
          <>
            <header className="text-center mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                {tokenLabel ?? 'Liteboard'}
              </h1>
              {tokenLabel ? (
                <p className="text-xs text-slate-500 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Liteboard
                </p>
              ) : null}
              <p className="text-xs font-mono text-slate-700 break-all max-w-xl mx-auto">{lb.mint}</p>
            </header>

            {(lb.usd_market_cap != null && Number.isFinite(lb.usd_market_cap)) ||
            (lb.token_price_usd != null && Number.isFinite(lb.token_price_usd)) ? (
              <div className="mb-10 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Market (pump.fun)
                </p>
                <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 shadow-sm flex flex-col items-center justify-center text-center min-h-[6.5rem]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 w-full">
                      Mkt cap
                    </div>
                    <div className="text-lg font-semibold text-slate-900 tabular-nums">
                      {formatUsdMarketCap(lb.usd_market_cap ?? null)}
                    </div>
                  </div>
                  <div
                    className="rounded-xl border border-slate-200 bg-white px-4 py-5 shadow-sm flex flex-col items-center justify-center text-center min-h-[6.5rem]"
                    title="usd_market_cap ÷ 10⁹"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 w-full">
                      1 token
                    </div>
                    <div className="text-lg font-semibold text-slate-900 tabular-nums">
                      {formatUsdPerToken(lb.token_price_usd ?? null)}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3 m-0 max-w-md mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Implied $/token uses <code className="text-xs bg-slate-100 px-1 rounded">usd_market_cap</code> ÷ 10⁹.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 mb-8 text-center" style={{ fontFamily: 'Arial, sans-serif' }}>
                Market data unavailable (mint not on pump.fun index).
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Link
                to={`/liteboard/${encMint}/announcement`}
                className="block rounded-xl border border-amber-200/80 bg-gradient-to-b from-amber-50/90 to-white p-6 shadow-sm hover:shadow-md hover:border-amber-300/80 transition-all no-underline text-gray-900 text-center"
              >
                <div className="flex justify-center mb-3 text-amber-700">
                  <AnnouncementChannelIcon className="w-10 h-10" />
                </div>
                <h2 className="text-base font-bold m-0 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Announcement
                </h2>
                <p className="text-sm text-slate-600 m-0 leading-snug" style={{ fontFamily: 'Times New Roman, serif' }}>
                  Owner-only updates for this token.
                </p>
              </Link>
              <Link
                to={`/liteboard/${encMint}/general`}
                className="block rounded-xl border border-sky-200/80 bg-gradient-to-b from-sky-50/90 to-white p-6 shadow-sm hover:shadow-md hover:border-sky-300/80 transition-all no-underline text-gray-900 text-center"
              >
                <div className="flex justify-center mb-3 text-sky-700">
                  <GeneralChannelIcon className="w-10 h-10" />
                </div>
                <h2 className="text-base font-bold m-0 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
                  General
                </h2>
                <p className="text-sm text-slate-600 m-0 leading-snug" style={{ fontFamily: 'Times New Roman, serif' }}>
                  Community chat for registered Ligder users.
                </p>
              </Link>
            </div>

            {isOwner ? (
              <div className="mt-10 pt-6 border-t border-red-200/80 rounded-t-lg">
                <p className="text-sm font-semibold text-red-900 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Danger zone
                </p>
                <p className="text-xs text-red-800/90 mb-3 m-0 max-w-xl" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Remove this Liteboard and all of its threads and posts. You must sign with the deploy wallet.
                </p>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void deleteLiteboard()}
                  className="text-sm px-4 py-2 border border-red-800 bg-white text-red-900 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  style={{ fontFamily: 'Arial, sans-serif' }}
                >
                  {deleting ? 'Signing…' : 'Remove Liteboard'}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default LiteboardHubPage;
