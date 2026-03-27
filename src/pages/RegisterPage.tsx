import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useWallet } from '../contexts/WalletContext';
import { LIGDER_PROFILE_UPDATED_EVENT } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

const RegisterPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { publicKey, connecting, error, clearError, connect, signMessage } = useWallet();
  const [signing, setSigning] = useState(false);
  const [signComplete, setSignComplete] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(null);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const nonce = useMemo(() => crypto.randomUUID(), []);

  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid' | 'error'
  >('idle');

  const [registering, setRegistering] = useState(false);

  const lastApiDownToastAt = useRef(0);
  const lastWalletError = useRef<string | null>(null);
  useEffect(() => {
    if (!error) {
      lastWalletError.current = null;
      return;
    }
    if (error === lastWalletError.current) return;
    lastWalletError.current = error;
    showToast(error, 'error');
  }, [error, showToast]);

  useEffect(() => {
    if (!signComplete) {
      setUsernameStatus('idle');
      return;
    }
    const u = username.trim().toLowerCase();
    if (u.length === 0) {
      setUsernameStatus('idle');
      return;
    }
    if (!USERNAME_RE.test(u)) {
      setUsernameStatus('invalid');
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(async () => {
      setUsernameStatus('checking');
      try {
        const r = await fetch(
          apiUrl(`/api/username-check?username=${encodeURIComponent(u)}`)
        );
        const j = (await r.json().catch(() => ({}))) as {
          available?: boolean;
          reason?: string;
          error?: string;
        };
        if (!r.ok) {
          if (!cancelled) {
            setUsernameStatus('error');
            const now = Date.now();
            if (now - lastApiDownToastAt.current > 8000) {
              lastApiDownToastAt.current = now;
              showToast(j.error || `Username check failed (${r.status})`, 'error');
            }
          }
          return;
        }
        if (cancelled) return;
        if (j.available) {
          setUsernameStatus('available');
        } else if (j.reason === 'reserved') {
          setUsernameStatus('reserved');
        } else if (j.reason === 'invalid') {
          setUsernameStatus('invalid');
        } else {
          setUsernameStatus('taken');
        }
      } catch {
        if (!cancelled) {
          setUsernameStatus('error');
          const now = Date.now();
          if (now - lastApiDownToastAt.current > 8000) {
            lastApiDownToastAt.current = now;
            showToast(
              'Could not reach the API. Use npm run dev (Vite + server), or run the server on port 8787.',
              'error'
            );
          }
        }
      }
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [username, signComplete, showToast]);

  const handleSign = useCallback(async () => {
    if (!publicKey) return;
    setSigning(true);
    try {
      const msg = [
        'Ligder forum registration',
        `Wallet: ${publicKey}`,
        `Nonce: ${nonce}`,
        'By signing, you prove control of this wallet. Username will be linked in Supabase.',
      ].join('\n');
      setRegistrationMessage(msg);
      const encoded = new TextEncoder().encode(msg);
      const sig = await signMessage(encoded);
      setSignatureBase64(uint8ToBase64(sig));
      setSignComplete(true);
      showToast('Signing complete — you can choose a username.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Signing failed', 'error');
      setRegistrationMessage(null);
      setSignatureBase64(null);
    } finally {
      setSigning(false);
    }
  }, [publicKey, nonce, signMessage, showToast]);

  const canRegister =
    signComplete &&
    usernameStatus === 'available' &&
    USERNAME_RE.test(username.trim().toLowerCase()) &&
    !!registrationMessage &&
    !!signatureBase64 &&
    !registering;

  const handleRegister = async () => {
    if (!publicKey || !canRegister || !registrationMessage || !signatureBase64) return;
    setRegistering(true);
    try {
      const u = username.trim().toLowerCase();
      const res = await fetch(apiUrl('/api/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          username: u,
          message: registrationMessage,
          signature: signatureBase64,
        }),
      });
      const j = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        throw new Error(j.error || 'Registration failed');
      }
      try {
        localStorage.setItem(
          'ligder_forum_profile',
          JSON.stringify({
            wallet: publicKey,
            username: u,
            registeredAt: new Date().toISOString(),
          })
        );
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(LIGDER_PROFILE_UPDATED_EVENT));
      navigate('/forums', { state: { registrationWelcome: { username: u } } });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Registration failed', 'error');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-xl mx-auto px-6 py-8">
        <nav className="mb-6 text-sm" style={{ fontFamily: 'Arial, sans-serif' }}>
          <Link to="/forums" className="text-blue-700 hover:text-blue-900 underline">
            ← Back to forums
          </Link>
        </nav>

        <h1 className="section-header" style={{ marginTop: 0 }}>
          Register an account
        </h1>

        <div
          className="text-sm text-gray-800 mb-6 space-y-3 leading-relaxed"
          style={{ fontFamily: 'Times New Roman, serif' }}
        >
          <p className="m-0">
            Ligder does <strong>not</strong> use passwords or traditional login secrets. The project is{' '}
            <strong>partly built on-chain</strong>: you prove control of a Solana wallet by signing a short
            message, and we link your chosen username to that wallet in our records.
          </p>
          <p className="m-0">
            <strong>Only someone who can use the same wallet</strong> you register with can act as that
            username later — keep your wallet access safe. Below: connect Phantom, sign, then pick a
            username; availability and signup go through the local API (Supabase on the server).
          </p>
        </div>

        <ol className="space-y-6 list-decimal list-inside text-sm" style={{ fontFamily: 'Arial, sans-serif' }}>
          <li className="pl-1">
            <span className="font-semibold">Connect Phantom</span>
            <div className="register-step-card mt-2 ml-5 border border-gray-400 p-3 bg-gray-50">
              {!publicKey ? (
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    void connect();
                  }}
                  disabled={connecting}
                  className="text-blue-700 hover:text-blue-900 underline disabled:text-gray-500"
                >
                  {connecting ? 'Connecting…' : 'Connect Phantom'}
                </button>
              ) : (
                <span className="font-mono text-xs text-gray-800 break-all block">
                  Connected: {publicKey}
                </span>
              )}
            </div>
          </li>

          <li className="pl-1">
            <span className="font-semibold">Sign message</span>
            <div className="register-step-card mt-2 ml-5 border border-gray-400 p-3 bg-gray-50">
              <button
                type="button"
                onClick={() => void handleSign()}
                disabled={!publicKey || signing || signComplete}
                className="text-blue-700 hover:text-blue-900 underline disabled:text-gray-500 disabled:no-underline"
              >
                {signComplete
                  ? 'Signing complete'
                  : signing
                    ? 'Waiting for signature…'
                    : 'Sign message'}
              </button>
            </div>
          </li>

          <li className="pl-1">
            <span className="font-semibold">Choose username</span>
            <div className="register-step-card mt-2 ml-5 border border-gray-400 p-3 bg-gray-50">
              <label className="block text-xs text-gray-600 mb-1 shrink-0">
                Username (3–20: letters, numbers, _)
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={!signComplete}
                autoComplete="off"
                className="w-full border border-gray-400 px-2 py-1.5 text-sm font-mono bg-white disabled:bg-gray-100 disabled:text-gray-500 shrink-0"
                placeholder="your_name"
              />
              <div className="text-xs mt-3 text-gray-700 flex-1" style={{ fontFamily: 'Times New Roman, serif' }}>
                {!signComplete && <span className="text-gray-500">Complete signing first.</span>}
                {signComplete && usernameStatus === 'idle' && username.length === 0 && (
                  <span>Enter a username.</span>
                )}
                {signComplete && usernameStatus === 'checking' && <span>Checking availability…</span>}
                {signComplete && usernameStatus === 'available' && (
                  <span className="text-green-800 font-semibold">Available</span>
                )}
                {signComplete && usernameStatus === 'taken' && (
                  <span className="text-red-800">Already taken (another wallet has it).</span>
                )}
                {signComplete && usernameStatus === 'reserved' && (
                  <span className="text-red-800">
                    Reserved by site policy (not your database). Names like admin, moderator, ligder,
                    lite, support, system, root, and null cannot be used — pick another.
                  </span>
                )}
                {signComplete && usernameStatus === 'invalid' && username.length > 0 && (
                  <span className="text-red-800">Invalid format</span>
                )}
                {signComplete && usernameStatus === 'error' && (
                  <span className="text-red-800">
                    Username check failed (offline API, wrong port, or database error — see toast).
                  </span>
                )}
              </div>
            </div>
          </li>
        </ol>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!canRegister}
            onClick={() => void handleRegister()}
            className="text-sm px-4 py-2 border border-gray-800 bg-gray-900 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            {registering ? 'Registering…' : 'Complete registration'}
          </button>
          <Link
            to="/forums"
            className="text-sm px-4 py-2 border border-gray-400 bg-white text-gray-800 inline-flex items-center"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
