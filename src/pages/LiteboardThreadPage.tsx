import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ForumMarkdown } from '../components/forum/ForumMarkdown';
import { MarkdownEditor } from '../components/forum/MarkdownEditor';
import { LoginDropdown } from '../components/LoginDropdown';
import { useToast } from '../contexts/ToastContext';
import { useWallet } from '../contexts/WalletContext';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import { uint8ToBase64 } from '../lib/uint8Base64';

const FORUM_REPLY_BODY_MAX = 30000;
const CHANNELS = new Set(['announcement', 'general']);

type PostRow = {
  id: string;
  parent_id: string | null;
  body: string;
  author_wallet: string;
  author_username: string | null;
  created_at: string;
};

const LiteboardThreadPage = () => {
  const { mint: mintParam, channel: chRaw, threadNumber: tnRaw } = useParams<{
    mint: string;
    channel: string;
    threadNumber: string;
  }>();
  const mint = mintParam ? decodeURIComponent(mintParam) : '';
  const channel = (chRaw ?? '').toLowerCase();
  const threadNum = parseInt(String(tnRaw ?? '').trim(), 10);
  const { publicKey, signMessage } = useWallet();
  const { isRegistered, profileLoading } = useLigderProfile();
  const { showToast } = useToast();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [title, setTitle] = useState('');
  const [ownerWallet, setOwnerWallet] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);

  const valid =
    CHANNELS.has(channel) && Number.isFinite(threadNum) && threadNum >= 1 && mint.length > 0;

  const load = useCallback(async () => {
    if (!valid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        apiUrl(
          `/api/liteboards/${encodeURIComponent(mint)}/threads/${threadNum}?channel=${encodeURIComponent(channel)}`
        )
      );
      const j = await parseApiJson<{
        thread?: { title: string };
        posts?: PostRow[];
        liteboard?: { owner_wallet: string };
        error?: string;
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || 'Failed to load');
      }
      setTitle(j.thread?.title ?? '');
      setPosts(j.posts ?? []);
      setOwnerWallet(j.liteboard?.owner_wallet ?? null);
    } catch (e) {
      setPosts([]);
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [mint, channel, threadNum, valid]);

  useEffect(() => {
    void load();
  }, [load]);

  const canReply =
    Boolean(publicKey && isRegistered) &&
    (channel === 'general' || (ownerWallet != null && publicKey === ownerWallet));

  const encMint = encodeURIComponent(mint);

  const submitReply = async () => {
    if (!publicKey || !canReply) return;
    const b = replyBody.trim();
    if (b.length < 1 || b.length > FORUM_REPLY_BODY_MAX) {
      showToast(`Reply must be 1–${FORUM_REPLY_BODY_MAX} characters.`, 'error');
      return;
    }
    const nonce = crypto.randomUUID();
    const message = [
      'Ligder liteboard thread reply',
      `Wallet: ${publicKey}`,
      `Mint: ${mint}`,
      `Channel: ${channel}`,
      `Thread number: ${threadNum}`,
      `Parent post: root`,
      `Nonce: ${nonce}`,
      '',
      b,
    ].join('\n');
    setReplying(true);
    try {
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/liteboard/replies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey, message, signature: uint8ToBase64(sig) }),
      });
      const j = await parseApiJson<{ error?: string }>(r);
      if (!r.ok) {
        throw new Error(j.error || 'Reply failed');
      }
      setReplyBody('');
      showToast('Reply posted.', 'success');
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reply failed', 'error');
    } finally {
      setReplying(false);
    }
  };

  if (!valid) {
    return (
      <div className="min-h-screen bg-white p-6">
        <p className="text-red-800">Invalid URL.</p>
        <Link to="/liteboard/explorer" className="underline">
          Explorer
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="mb-4 flex flex-wrap justify-between gap-3 text-sm">
          <div className="flex flex-wrap gap-x-3">
            <Link to={`/liteboard/${encMint}/${channel}`} className="text-blue-700 underline">
              ← {channel}
            </Link>
            <Link to={`/liteboard/${encMint}`} className="text-blue-700 underline">
              Home
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
        ) : (
          <>
            <h1 className="text-xl font-bold mb-6" style={{ fontFamily: 'Arial, sans-serif' }}>
              {title}
            </h1>
            <div className="space-y-6">
              {posts.map((p) => (
                <article
                  key={p.id}
                  className="border-b border-gray-200 pb-4"
                  style={{ fontFamily: 'Times New Roman, serif' }}
                >
                  <div className="text-xs text-gray-600 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
                    <strong>{p.author_username ?? `${p.author_wallet.slice(0, 8)}…`}</strong> ·{' '}
                    {new Date(p.created_at).toLocaleString()}
                  </div>
                  <ForumMarkdown text={p.body} />
                </article>
              ))}
            </div>

            {canReply ? (
              <div className="mt-8 border border-gray-400 bg-gray-50 p-4 space-y-2">
                <p className="text-sm font-semibold m-0" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Reply (signed)
                </p>
                <MarkdownEditor
                  value={replyBody}
                  onChange={setReplyBody}
                  disabled={replying}
                  maxLength={FORUM_REPLY_BODY_MAX}
                  placeholder="Markdown supported"
                />
                <button
                  type="button"
                  className="text-sm px-3 py-2 border border-gray-800 bg-white disabled:opacity-50"
                  disabled={replying || !replyBody.trim()}
                  onClick={() => void submitReply()}
                >
                  {replying ? 'Signing…' : 'Sign & post reply'}
                </button>
              </div>
            ) : (
              <p className="mt-6 text-sm text-gray-600">
                {!publicKey
                  ? 'Connect to reply.'
                  : !isRegistered
                    ? 'Register to reply in this thread.'
                    : 'You cannot reply in this channel.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LiteboardThreadPage;
