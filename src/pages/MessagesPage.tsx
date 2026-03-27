import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import nacl from 'tweetnacl';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useWallet } from '../contexts/WalletContext';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import { base64ToUint8, uint8ToBase64 } from '../lib/uint8Base64';
import { solscanTxUrl } from '../lib/solscan';

const keyStorage = (wallet: string) => `ligder_pm_secret_${wallet}`;
const pmSessionStorage = (wallet: string) => `ligder_pm_session_${wallet}`;

type PmRow = {
  id: string;
  sender_wallet: string;
  recipient_wallet: string;
  counterparty_wallet: string;
  counterparty_username: string | null;
  nonce_base64: string;
  ciphertext_base64: string;
  tx_sig: string | null;
  status: string;
  created_at: string;
};

type DebugLogEntry = {
  ts: string;
  msg: string;
};

type ConfirmState =
  | { type: 'delete'; messageId: string }
  | { type: 'clear' }
  | null;

function isHex64(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function MessagesPage() {
  const [searchParams] = useSearchParams();
  const toDefault = searchParams.get('to') ?? '';
  const { publicKey, signMessage } = useWallet();
  const { isRegistered, profileLoading } = useLigderProfile();

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<PmRow[]>([]);
  const [keyMap, setKeyMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [toUser, setToUser] = useState(toDefault);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [decryptedById, setDecryptedById] = useState<Record<string, string>>({});
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([]);
  const [messageTab, setMessageTab] = useState<'received' | 'sent'>('received');
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const ownSecret = useMemo(() => {
    if (!publicKey) return null;
    try {
      const b64 = localStorage.getItem(keyStorage(publicKey));
      return b64 ? base64ToUint8(b64) : null;
    } catch {
      return null;
    }
  }, [publicKey, rows.length]);

  const ownPublic = useMemo(() => {
    if (!ownSecret || ownSecret.length !== 32) return null;
    return nacl.box.keyPair.fromSecretKey(ownSecret).publicKey;
  }, [ownSecret]);

  const signMessageRef = useRef(signMessage);
  useEffect(() => {
    signMessageRef.current = signMessage;
  }, [signMessage]);

  const pushLog = useCallback((msg: string) => {
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setDebugLog((prev) => [{ ts, msg }, ...prev].slice(0, 40));
  }, []);

  const establishPmSession = useCallback(async () => {
    if (!publicKey) throw new Error('Connect wallet first');
    pushLog('Requesting PM session nonce from server…');
    const nr = await fetch(apiUrl('/api/pm/session-nonce'));
    const jn = await parseApiJson<{ nonce?: string; error?: string }>(nr);
    if (!nr.ok || !jn.nonce) {
      throw new Error(jn.error || 'Could not start PM session');
    }
    pushLog('Nonce received. Waiting for wallet signature (session auth)…');
    const message = [
      'Ligder PM session',
      `Wallet: ${publicKey}`,
      `Nonce: ${jn.nonce}`,
    ].join('\n');
    const sig = await signMessageRef.current(new TextEncoder().encode(message));
    const r = await fetch(apiUrl('/api/pm/session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: publicKey,
        message,
        signature: uint8ToBase64(sig),
      }),
    });
    const j = await parseApiJson<{ token?: string; error?: string }>(r);
    if (!r.ok || !j.token) {
      throw new Error(j.error || 'PM session failed');
    }
    pushLog('PM session established.');
    sessionStorage.setItem(pmSessionStorage(publicKey), j.token);
    return j.token;
  }, [publicKey, pushLog]);

  const pmFetch = useCallback(
    async (input: string, init?: RequestInit) => {
      if (!publicKey) throw new Error('Connect wallet first');
      let token = sessionStorage.getItem(pmSessionStorage(publicKey));
      if (!token) {
        token = await establishPmSession();
      }
      const run = (t: string) => {
        const h = new Headers(init?.headers);
        h.set('Authorization', `Bearer ${t}`);
        return fetch(input, { ...init, headers: h });
      };
      let res = await run(token);
      if (res.status === 401) {
        sessionStorage.removeItem(pmSessionStorage(publicKey));
        const t2 = await establishPmSession();
        res = await run(t2);
      }
      return res;
    },
    [establishPmSession, publicKey]
  );

  const ensurePmKey = useCallback(async () => {
    if (!publicKey) throw new Error('Connect wallet first');
    let secret: Uint8Array;
    let pubB64 = '';
    try {
      const existing = localStorage.getItem(keyStorage(publicKey));
      if (existing) {
        secret = base64ToUint8(existing);
      } else {
        secret = nacl.randomBytes(32);
        localStorage.setItem(keyStorage(publicKey), uint8ToBase64(secret));
      }
    } catch {
      throw new Error('Could not access browser storage for PM key');
    }
    const pub = nacl.box.keyPair.fromSecretKey(secret).publicKey;
    pubB64 = uint8ToBase64(pub);

    // Avoid unnecessary sign prompts: only sign/register when key missing or changed on server.
    const keyCheck = await fetch(apiUrl(`/api/pm/key?wallet=${encodeURIComponent(publicKey)}`));
    if (keyCheck.ok) {
      const jk = await parseApiJson<{ enc_public_key?: string }>(keyCheck);
      if (jk.enc_public_key === pubB64) {
        pushLog('PM encryption key already registered.');
        return { secret, pubB64 };
      }
    }

    const nonce = crypto.randomUUID();
    const message = [
      'Ligder PM key register',
      `Wallet: ${publicKey}`,
      `Enc public key: ${pubB64}`,
      `Nonce: ${nonce}`,
    ].join('\n');
    const sig = await signMessageRef.current(new TextEncoder().encode(message));
    pushLog('Registering PM encryption key on server…');
    const r = await fetch(apiUrl('/api/pm/key'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: publicKey,
        message,
        signature: uint8ToBase64(sig),
        enc_public_key: pubB64,
      }),
    });
    const j = await parseApiJson<{ error?: string }>(r);
    if (!r.ok) throw new Error(j.error || 'Could not register PM key');
    pushLog('PM encryption key registered.');
    return { secret, pubB64 };
  }, [publicKey, pushLog]);

  const loadMessages = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      pushLog('Loading PM inbox…');
      await ensurePmKey();
      const r = await pmFetch(apiUrl('/api/pm/list'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 100,
        }),
      });
      const j = await parseApiJson<{
        error?: string;
        messages?: PmRow[];
        key_map?: Record<string, string>;
      }>(r);
      if (!r.ok) throw new Error(j.error || 'Could not load PMs');
      setRows(j.messages ?? []);
      setKeyMap(j.key_map ?? {});
      pushLog(`Inbox loaded (${(j.messages ?? []).length} messages).`);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'Could not load PMs');
      setRows([]);
      setKeyMap({});
      pushLog(
        `Inbox load failed: ${e instanceof Error ? e.message : 'unknown error'}`
      );
    } finally {
      setLoading(false);
    }
  }, [ensurePmKey, pmFetch, publicKey, pushLog]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!publicKey || !ownSecret || !ownPublic) return;
    const next: Record<string, string> = {};
    for (const r of rows) {
      try {
        const nonce = base64ToUint8(r.nonce_base64);
        const cipher = base64ToUint8(r.ciphertext_base64);
        const senderSide = r.sender_wallet === publicKey;
        const peerPub = senderSide
          ? ownPublic
          : keyMap[r.counterparty_wallet]
            ? base64ToUint8(keyMap[r.counterparty_wallet])
            : null;
        if (!peerPub || peerPub.length !== 32) continue;
        const opened = nacl.box.open(cipher, nonce, peerPub, ownSecret);
        if (!opened) continue;
        next[r.id] = new TextDecoder().decode(opened);
      } catch {
        // ignore row
      }
    }
    setDecryptedById(next);
  }, [keyMap, ownPublic, ownSecret, publicKey, rows]);

  const sendPm = async () => {
    if (!publicKey) return;
    const to = toUser.trim().toLowerCase();
    const text = body.trim();
    if (!to || !text) return;
    setSending(true);
    setStatusMsg(null);
    try {
      pushLog('Preparing encrypted PM…');
      const { secret, pubB64 } = await ensurePmKey();
      const selfPub = base64ToUint8(pubB64);
      pushLog(`Resolving recipient "${to}" and encryption key…`);
      const rk = await fetch(apiUrl(`/api/pm/key?username=${encodeURIComponent(to)}`));
      const jk = await parseApiJson<{ wallet?: string; enc_public_key?: string; error?: string }>(rk);
      if (!rk.ok || !jk.wallet || !jk.enc_public_key) {
        throw new Error(jk.error || 'Recipient has not enabled PM');
      }
      const recipPub = base64ToUint8(jk.enc_public_key);
      if (recipPub.length !== 32) throw new Error('Recipient key invalid');
      const msgBytes = new TextEncoder().encode(text);
      const nonce = nacl.randomBytes(24);
      const cRecipient = nacl.box(msgBytes, nonce, recipPub, secret);
      const cSender = nacl.box(msgBytes, nonce, selfPub, secret);
      const cipherSha = await sha256Hex(cRecipient);
      if (!isHex64(cipherSha)) throw new Error('Cipher hash failed');
      const nonceB64 = uint8ToBase64(nonce);
      const sendNonce = crypto.randomUUID();
      pushLog('Payload encrypted. Waiting for wallet signature (send authorization)…');
      const message = [
        'Ligder PM send',
        `Wallet: ${publicKey}`,
        `Recipient wallet: ${jk.wallet}`,
        `Cipher SHA-256: ${cipherSha}`,
        `Nonce: ${nonceB64}`,
        `Nonce id: ${sendNonce}`,
      ].join('\n');
      const sig = await signMessageRef.current(new TextEncoder().encode(message));
      pushLog('Signed. Sending PM to server + waiting for on-chain relay…');
      const rs = await fetch(apiUrl('/api/pm/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
          recipient_wallet: jk.wallet,
          nonce_base64: nonceB64,
          ciphertext_recipient_base64: uint8ToBase64(cRecipient),
          ciphertext_sender_base64: uint8ToBase64(cSender),
          cipher_sha256: cipherSha,
        }),
      });
      const js = await parseApiJson<{ error?: string; tx_sig?: string | null }>(rs);
      if (!rs.ok) throw new Error(js.error || 'PM send failed');
      setBody('');
      setStatusMsg(js.tx_sig ? 'PM sent and attested on-chain.' : 'PM sent.');
      pushLog(
        js.tx_sig
          ? `PM sent. On-chain tx confirmed: ${js.tx_sig.slice(0, 10)}…`
          : 'PM sent (no tx returned).'
      );
      await loadMessages();
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'PM send failed');
      pushLog(`PM send failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (id: string) => {
    try {
      pushLog(`Deleting message ${id.slice(0, 8)}…`);
      const r = await pmFetch(apiUrl('/api/pm/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await parseApiJson<{ error?: string }>(r);
      if (!r.ok) throw new Error(j.error || 'Delete failed');
      pushLog('Message deleted.');
      await loadMessages();
    } catch (e) {
      pushLog(`Delete failed: ${e instanceof Error ? e.message : 'unknown error'}`);
      setStatusMsg(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const clearHistory = async () => {
    try {
      pushLog('Clearing message history…');
      const r = await pmFetch(apiUrl('/api/pm/clear'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await parseApiJson<{ error?: string }>(r);
      if (!r.ok) throw new Error(j.error || 'Clear history failed');
      pushLog('Message history cleared.');
      await loadMessages();
    } catch (e) {
      pushLog(
        `Clear history failed: ${e instanceof Error ? e.message : 'unknown error'}`
      );
      setStatusMsg(e instanceof Error ? e.message : 'Clear history failed');
    }
  };

  if (!publicKey) return <Navigate to="/forums" replace />;
  if (!isRegistered && !profileLoading) return <Navigate to="/forums/register" replace />;

  const filteredRows = rows.filter((r) =>
    messageTab === 'received'
      ? r.recipient_wallet === publicKey
      : r.sender_wallet === publicKey
  );
  const receivedCount = rows.filter((r) => r.recipient_wallet === publicKey).length;
  const sentCount = rows.filter((r) => r.sender_wallet === publicKey).length;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between text-sm" style={{ fontFamily: 'Arial, sans-serif' }}>
          <Link to="/forums" className="text-blue-700 hover:text-blue-900 underline">← Forums</Link>
          <LoginDropdown />
        </div>
        <h1 className="section-header" style={{ marginTop: 0 }}>Private messages</h1>
        <p className="text-sm text-gray-700 mb-4" style={{ fontFamily: 'Times New Roman, serif' }}>
          Encrypted in browser, stored encrypted in DB, and attested on-chain (metadata + cipher hash).
        </p>

        <div className="border border-gray-400 bg-gray-50 p-3 mb-4">
          <label className="block text-xs text-gray-600 mb-1">To (username)</label>
          <input
            value={toUser}
            onChange={(e) => setToUser(e.target.value)}
            className="w-full border border-gray-400 px-2 py-1.5 text-sm mb-2"
            placeholder="username"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full border border-gray-400 px-2 py-1.5 text-sm h-24 mb-2"
            placeholder="Write encrypted PM..."
          />
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void sendPm()}
              disabled={sending || !toUser.trim() || !body.trim()}
              className="w-40 text-sm px-3 py-1.5 border border-gray-800 bg-white hover:bg-gray-100 disabled:opacity-50 text-center"
            >
              {sending ? 'Sending…' : 'Sign & send PM'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmState({ type: 'clear' })}
              className="w-40 text-sm px-3 py-1.5 border border-red-700 text-red-800 bg-white hover:bg-red-50 text-center"
            >
              Clear history
            </button>
          </div>
        </div>

        <div className="border border-gray-400 bg-gray-900 text-gray-100 p-3 mb-4">
          <p className="text-xs uppercase tracking-wide m-0 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
            PM activity log
          </p>
          <div className="h-40 overflow-auto space-y-1">
            {debugLog.length === 0 ? (
              <p className="text-xs text-gray-300 m-0 font-mono">No activity yet.</p>
            ) : (
              debugLog.map((l, i) => (
                <p key={`${l.ts}-${i}`} className="text-xs m-0 font-mono">
                  [{l.ts}] {l.msg}
                </p>
              ))
            )}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setMessageTab('received')}
            className={`text-sm px-3 py-1.5 border ${
              messageTab === 'received'
                ? 'border-gray-800 bg-gray-900 text-white'
                : 'border-gray-400 bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            Received private messages ({receivedCount})
          </button>
          <button
            type="button"
            onClick={() => setMessageTab('sent')}
            className={`text-sm px-3 py-1.5 border ${
              messageTab === 'sent'
                ? 'border-gray-800 bg-gray-900 text-white'
                : 'border-gray-400 bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            Sent private messages ({sentCount})
          </button>
        </div>

        {statusMsg ? <p className="text-sm text-gray-700 mb-3">{statusMsg}</p> : null}
        {loading ? <p className="text-sm text-gray-600">Loading PMs…</p> : null}

        <div className="space-y-2">
          {filteredRows.map((r) => (
            <div key={r.id} className="border border-gray-300 p-3 bg-white">
              <p className="text-xs text-gray-600 m-0 mb-1">
                with{' '}
                {r.counterparty_username ? (
                  <Link
                    to={`/forums/u/${encodeURIComponent(r.counterparty_username)}`}
                    className="text-blue-800 underline"
                  >
                    {r.counterparty_username}
                  </Link>
                ) : (
                  <span className="font-mono">{r.counterparty_wallet.slice(0, 8)}…</span>
                )}
                {' · '}
                {new Date(r.created_at).toLocaleString()}
              </p>
              <p className="text-sm m-0 mb-1" style={{ fontFamily: 'Times New Roman, serif' }}>
                {decryptedById[r.id] ?? '[Cannot decrypt on this device]'}
              </p>
              <p className="text-xs text-gray-600 m-0">
                status: {r.status}
                {r.tx_sig ? (
                  <>
                    {' · '}tx:{' '}
                    <a
                      href={solscanTxUrl(r.tx_sig)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-800 underline font-mono"
                    >
                      {r.tx_sig.slice(0, 10)}…{r.tx_sig.slice(-8)}
                    </a>
                  </>
                ) : null}
              </p>
              <button
                type="button"
                onClick={() => setConfirmState({ type: 'delete', messageId: r.id })}
                className="mt-2 text-xs text-red-800 underline hover:text-red-900"
              >
                Delete message
              </button>
            </div>
          ))}
          {!loading && filteredRows.length === 0 ? (
            <p className="text-sm text-gray-600 text-center">No messages in this tab.</p>
          ) : null}
        </div>
      </div>

      {confirmState ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md border border-gray-500 bg-white shadow-xl p-4">
            <h2
              className="text-base font-bold text-gray-900 m-0 mb-2"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              Confirm action
            </h2>
            <p className="text-sm text-gray-800 m-0 mb-4" style={{ fontFamily: 'Times New Roman, serif' }}>
              {confirmState.type === 'clear'
                ? 'Clear all PM history for this account? This cannot be undone.'
                : 'Delete this message from history? This cannot be undone.'}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                className="text-sm px-3 py-1.5 border border-gray-500 bg-white text-gray-900 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const current = confirmState;
                  setConfirmState(null);
                  if (current.type === 'clear') {
                    void clearHistory();
                  } else {
                    void deleteMessage(current.messageId);
                  }
                }}
                className="text-sm px-3 py-1.5 border border-red-700 bg-red-700 text-white hover:bg-red-800"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
