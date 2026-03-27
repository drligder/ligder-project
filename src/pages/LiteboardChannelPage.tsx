import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { MarkdownEditor } from '../components/forum/MarkdownEditor';
import { useToast } from '../contexts/ToastContext';
import { useWallet } from '../contexts/WalletContext';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import { uint8ToBase64 } from '../lib/uint8Base64';

const FORUM_OP_BODY_MAX = 2500;
const CHANNELS = new Set(['announcement', 'general']);

type ThreadRow = {
  id: string;
  thread_number: number;
  title: string;
  author_wallet: string;
  author_username: string | null;
  updated_at: string;
  posts_count: number;
};

const LiteboardChannelPage = () => {
  const { mint: mintParam, channel: chRaw } = useParams<{ mint: string; channel: string }>();
  const mint = mintParam ? decodeURIComponent(mintParam) : '';
  const channel = (chRaw ?? '').toLowerCase();
  const navigate = useNavigate();
  const { publicKey, signMessage } = useWallet();
  const { isRegistered, profileLoading } = useLigderProfile();
  const { showToast } = useToast();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [ownerWallet, setOwnerWallet] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [creating, setCreating] = useState(false);

  const validChannel = CHANNELS.has(channel);

  const load = useCallback(async () => {
    if (!mint || !validChannel) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        apiUrl(
          `/api/liteboards/${encodeURIComponent(mint)}/threads?channel=${encodeURIComponent(channel)}`
        )
      );
      const j = await parseApiJson<{
        threads?: ThreadRow[];
        error?: string;
        liteboard_id?: string;
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || 'Failed to load');
      }
      setThreads(j.threads ?? []);
      const r2 = await fetch(apiUrl(`/api/liteboards/${encodeURIComponent(mint)}`));
      const j2 = await parseApiJson<{ liteboard?: { owner_wallet: string } }>(r2);
      if (r2.ok && j2.liteboard) {
        setOwnerWallet(j2.liteboard.owner_wallet);
      }
    } catch (e) {
      setThreads([]);
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [mint, channel, validChannel]);

  useEffect(() => {
    void load();
  }, [load]);

  const canPost =
    Boolean(publicKey && isRegistered) &&
    (channel === 'general' || (ownerWallet != null && publicKey === ownerWallet));

  const encMint = encodeURIComponent(mint);

  const createThread = async () => {
    if (!publicKey || !canPost) return;
    const t = title.trim();
    if (t.length < 1 || t.length > 200 || /[\r\n]/.test(t)) {
      showToast('Title must be 1–200 characters, no line breaks.', 'error');
      return;
    }
    const b = body.trim();
    if (b.length < 1 || b.length > FORUM_OP_BODY_MAX) {
      showToast(`Body required (max ${FORUM_OP_BODY_MAX} chars).`, 'error');
      return;
    }
    const nonce = crypto.randomUUID();
    const message = [
      'Ligder liteboard new thread',
      `Wallet: ${publicKey}`,
      `Mint: ${mint}`,
      `Channel: ${channel}`,
      `Title: ${t}`,
      `Nonce: ${nonce}`,
      '',
      b,
    ].join('\n');
    setCreating(true);
    try {
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/liteboard/threads'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey, message, signature: uint8ToBase64(sig) }),
      });
      const j = await parseApiJson<{ thread?: ThreadRow; error?: string }>(r);
      if (!r.ok) {
        throw new Error(j.error || 'Could not create thread');
      }
      const tn = j.thread?.thread_number;
      setTitle('');
      setBody('');
      showToast('Thread created.', 'success');
      if (tn != null) {
        navigate(`/liteboard/${encMint}/${channel}/${tn}`);
      } else {
        void load();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setCreating(false);
    }
  };

  if (!validChannel) {
    return (
      <div className="min-h-screen bg-white p-6">
        <p className="text-red-800">Invalid channel.</p>
        <Link to={mint ? `/liteboard/${encodeURIComponent(mint)}` : '/liteboard/explorer'} className="underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="mb-4 flex flex-wrap justify-between gap-3 text-sm">
          <div className="flex flex-wrap gap-x-3">
            <Link to={`/liteboard/${encMint}`} className="text-blue-700 underline">
              ← Liteboard home
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

        <h1 className="text-xl font-bold capitalize mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
          {channel}
        </h1>
        <p className="text-xs font-mono text-gray-600 break-all mb-4">{mint}</p>

        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : err ? (
          <p className="text-sm text-red-800">{err}</p>
        ) : (
          <>
            <ul className="list-none m-0 p-0 border border-gray-300 mb-6">
              {threads.length === 0 ? (
                <li className="p-3 text-sm text-gray-600">No threads yet.</li>
              ) : (
                threads.map((t) => (
                  <li key={t.id} className="border-b border-gray-200 last:border-b-0 p-3 hover:bg-gray-50">
                    <Link
                      to={`/liteboard/${encMint}/${channel}/${t.thread_number}`}
                      className="text-blue-800 font-semibold underline"
                    >
                      {t.title}
                    </Link>
                    <div className="text-xs text-gray-500 mt-1">
                      {t.author_username ?? `${t.author_wallet.slice(0, 6)}…`} ·{' '}
                      {new Date(t.updated_at).toLocaleString()} · {t.posts_count} posts
                    </div>
                  </li>
                ))
              )}
            </ul>

            {canPost ? (
              <div className="border border-gray-400 bg-gray-50 p-4 space-y-2">
                <p className="text-sm font-semibold m-0">New thread (signed)</p>
                <input
                  type="text"
                  className="w-full text-sm border border-gray-400 px-2 py-1 bg-white"
                  placeholder="Title"
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={creating}
                />
                <MarkdownEditor
                  value={body}
                  onChange={setBody}
                  disabled={creating}
                  maxLength={FORUM_OP_BODY_MAX}
                  placeholder="Opening post (markdown supported)"
                />
                <button
                  type="button"
                  className="text-sm px-3 py-2 border border-gray-800 bg-white disabled:opacity-50"
                  disabled={creating}
                  onClick={() => void createThread()}
                >
                  {creating ? 'Signing…' : 'Sign & create thread'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                {!publicKey
                  ? 'Connect to post.'
                  : !isRegistered
                    ? 'Register on Ligder to post in General.'
                    : channel === 'announcement'
                      ? 'Only the Liteboard owner can post here.'
                      : 'You cannot post.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LiteboardChannelPage;
