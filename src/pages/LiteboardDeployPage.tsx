import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useToast } from '../contexts/ToastContext';
import { useWallet } from '../contexts/WalletContext';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import { uint8ToBase64 } from '../lib/uint8Base64';

const LiteboardDeployPage = () => {
  const { publicKey, signMessage } = useWallet();
  const { isRegistered, profileLoading } = useLigderProfile();
  const { showToast } = useToast();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [mintInput, setMintInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifiedMint, setVerifiedMint] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [codeExpires, setCodeExpires] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  const runVerify = async () => {
    if (!publicKey) {
      showToast('Connect your wallet first.', 'error');
      return;
    }
    const mint = mintInput.trim();
    if (mint.length < 32) {
      showToast('Paste a valid SPL mint address.', 'error');
      return;
    }
    const nonce = crypto.randomUUID();
    const message = [
      'Ligder liteboard mint verify',
      `Wallet: ${publicKey}`,
      `Mint: ${mint}`,
      `Nonce: ${nonce}`,
    ].join('\n');
    setBusy(true);
    try {
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/liteboard/verify-mint'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });
      const j = await parseApiJson<{
        ok?: boolean;
        mint?: string;
        authentication_code?: string;
        expires_at?: string;
        error?: string;
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || `Verify failed (${r.status})`);
      }
      setVerifiedMint(j.mint ?? mint);
      setAuthCode(j.authentication_code ?? null);
      setCodeExpires(j.expires_at ?? null);
      showToast('Verified. Save your one-time code.', 'success');
    } catch (e) {
      setVerifiedMint(null);
      setAuthCode(null);
      setCodeExpires(null);
      showToast(e instanceof Error ? e.message : 'Verify failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const runCreate = async () => {
    if (!publicKey || !verifiedMint || !authCode) {
      showToast('Verify the mint and obtain a code first.', 'error');
      return;
    }
    if (!isRegistered) {
      showToast('Register on Ligder before creating a Liteboard.', 'error');
      return;
    }
    const nonce = crypto.randomUUID();
    const message = [
      'Ligder liteboard create',
      `Wallet: ${publicKey}`,
      `Mint: ${verifiedMint}`,
      `Code: ${authCode}`,
      `Nonce: ${nonce}`,
    ].join('\n');
    setCreateBusy(true);
    try {
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/liteboard/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });
      const j = await parseApiJson<{
        liteboard?: { mint: string };
        error?: string;
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || `Create failed (${r.status})`);
      }
      const m = j.liteboard?.mint ?? verifiedMint;
      showToast('Liteboard created.', 'success');
      window.location.href = `/liteboard/${encodeURIComponent(m)}`;
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Create failed', 'error');
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-2xl mx-auto px-6 py-6">
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
                className="text-sm px-3 py-1.5 border border-gray-400 bg-white text-blue-700 hover:text-blue-900 hover:bg-gray-50"
              >
                Register
              </Link>
            ) : null}
          </div>
        </div>

        <h1 className="ligder-pixel-title text-xl text-gray-900 mb-2">
          Deploy a Liteboard
        </h1>
        <p className="text-sm text-gray-700 mb-3" style={{ fontFamily: 'Times New Roman, serif' }}>
          <strong>Self-serve deploy only supports tokens listed on pump.fun</strong> (we verify against their
          public coin API). Other launchpads and generic SPL mints are not available here yet.
        </p>
        <p className="text-sm text-gray-700 mb-6" style={{ fontFamily: 'Times New Roman, serif' }}>
          Paste the token&apos;s <strong>mint address</strong>. You sign so we know which wallet will own the
          board. You&apos;ll get a one-time code, then sign again to create a mini-forum at{' '}
          <code className="text-xs bg-gray-100 px-1">/liteboard/&lt;mint&gt;</code> with{' '}
          <strong>Announcement</strong> (owner only) and <strong>General</strong> (registered Ligder users).
        </p>

        <div className="space-y-4 border border-gray-300 bg-gray-50 p-4">
          <label className="block text-xs font-semibold text-gray-800" style={{ fontFamily: 'Arial, sans-serif' }}>
            SPL token mint address
          </label>
          <input
            type="text"
            className="w-full text-sm border border-gray-400 px-2 py-2 bg-white font-mono"
            placeholder="e.g. So111…"
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value)}
            disabled={busy || createBusy}
          />
          <button
            type="button"
            className="text-sm px-3 py-2 border border-gray-800 bg-white disabled:opacity-50"
            disabled={busy || createBusy}
            onClick={() => void runVerify()}
          >
            {busy ? 'Signing…' : 'Verify mint'}
          </button>

          {authCode ? (
            <div className="mt-4 pt-4 border-t border-gray-300 space-y-2">
              <p className="text-xs font-semibold text-gray-900 m-0">One-time authentication code</p>
              <p className="text-xs text-amber-900 m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
                Copy and store it securely. It expires
                {codeExpires ? ` (${new Date(codeExpires).toLocaleString()})` : ''} and works only with this
                wallet once.
              </p>
              <code className="block text-sm break-all bg-white border border-gray-400 p-2 font-mono">
                {authCode}
              </code>
              {!isRegistered ? (
                <p className="text-xs text-red-800 m-0">
                  You must{' '}
                  <Link to="/forums/register" className="underline">
                    register
                  </Link>{' '}
                  before creating the Liteboard.
                </p>
              ) : null}
              <button
                type="button"
                className="text-sm px-3 py-2 border border-gray-800 bg-white disabled:opacity-50"
                disabled={createBusy || !isRegistered}
                onClick={() => void runCreate()}
              >
                {createBusy ? 'Signing…' : 'Sign & create Liteboard'}
              </button>
            </div>
          ) : null}
        </div>

        <p className="text-xs text-gray-600 mt-6" style={{ fontFamily: 'Arial, sans-serif' }}>
          <Link to="/liteboard/explorer" className="text-blue-800 underline">
            Liteboard Explorer
          </Link>{' '}
          — find boards by mint.
        </p>
      </div>
    </div>
  );
};

export default LiteboardDeployPage;
