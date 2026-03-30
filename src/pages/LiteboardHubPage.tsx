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
import { ForumBoardIcon } from '../components/forum/ForumBoardIcon';

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
              <h1 className="ligder-pixel-title text-2xl tracking-tight text-slate-900 mb-1">
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
              <div className="mb-8 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Market (pump.fun)
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
                  <div className="border border-gray-300 bg-white px-2 py-2 flex flex-col items-center justify-center text-center min-h-[3.25rem]">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5 w-full leading-tight">
                      Mkt cap
                    </div>
                    <div className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">
                      {formatUsdMarketCap(lb.usd_market_cap ?? null)}
                    </div>
                  </div>
                  <div
                    className="border border-gray-300 bg-white px-2 py-2 flex flex-col items-center justify-center text-center min-h-[3.25rem]"
                    title="usd_market_cap ÷ 10⁹"
                  >
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5 w-full leading-tight">
                      1 token
                    </div>
                    <div className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">
                      {formatUsdPerToken(lb.token_price_usd ?? null)}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 m-0 max-w-sm mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Implied $/token uses <code className="text-[10px] bg-gray-100 px-0.5 border border-gray-200">usd_market_cap</code> ÷ 10⁹.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 mb-8 text-center" style={{ fontFamily: 'Arial, sans-serif' }}>
                Market data unavailable (mint not on pump.fun index).
              </p>
            )}

            <div className="grid gap-2 sm:grid-cols-2 max-w-lg mx-auto">
              <Link
                to={`/liteboard/${encMint}/announcement`}
                className="block border border-gray-300 bg-white px-3 py-2.5 no-underline text-gray-900 hover:bg-gray-50"
              >
                <div className="flex items-start gap-2 text-left">
                  <ForumBoardIcon iconKey="megaphone" />
                  <span>
                    <span className="block text-sm font-bold m-0 mb-0.5" style={{ fontFamily: 'Arial, sans-serif' }}>
                      Announcement
                    </span>
                    <span className="block text-xs text-slate-600 leading-snug m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
                      Owner-only updates for this token.
                    </span>
                  </span>
                </div>
              </Link>
              <Link
                to={`/liteboard/${encMint}/general`}
                className="block border border-gray-300 bg-white px-3 py-2.5 no-underline text-gray-900 hover:bg-gray-50"
              >
                <div className="flex items-start gap-2 text-left">
                  <ForumBoardIcon iconKey="chat" />
                  <span>
                    <span className="block text-sm font-bold m-0 mb-0.5" style={{ fontFamily: 'Arial, sans-serif' }}>
                      General
                    </span>
                    <span className="block text-xs text-slate-600 leading-snug m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
                      Community chat for registered Ligder users.
                    </span>
                  </span>
                </div>
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
