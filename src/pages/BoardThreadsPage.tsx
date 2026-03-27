import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { ForumBoardIcon } from '../components/forum/ForumBoardIcon';
import { LoginDropdown } from '../components/LoginDropdown';
import { useToast } from '../contexts/ToastContext';
import { useWallet } from '../contexts/WalletContext';
import { useForumAccount } from '../hooks/useForumAccount';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl, describeForumApiFailure } from '../lib/apiBase';
import {
  effectiveMinReply,
  effectiveMinStartThread,
  meetsMinRank,
  userRankLevel,
} from '../lib/forumRanks';
import { threadListNumber } from '../lib/threadListNumber';
import { parseApiJson } from '../lib/parseApiJson';
import { uint8ToBase64 } from '../lib/uint8Base64';
import { solscanTxUrl } from '../lib/solscan';
import type { ForumThreadSeed, ThreadDetailPost } from '../types/forum';
import type { ForumBoardRow, ForumThreadListRow } from '../types/forumBoards';
import { MarkdownEditor } from '../components/forum/MarkdownEditor';
import {
  forumBoardBaseFromPathname,
  forumSectionLabelFromBase,
} from '../lib/forumBoardBasePath';

const BoardThreadsPage = () => {
  const location = useLocation();
  const boardBase = forumBoardBaseFromPathname(location.pathname);
  const sectionBackLabel = forumSectionLabelFromBase(boardBase);
  const navigate = useNavigate();
  const { boardSlug } = useParams<{ boardSlug: string }>();
  const { publicKey, signMessage } = useWallet();
  const { showToast } = useToast();
  const { isRegistered, profileLoading } = useLigderProfile();
  const { isAdmin, isModerator, loading: accountLoading } = useForumAccount();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [board, setBoard] = useState<ForumBoardRow | null>(null);
  const [threads, setThreads] = useState<ForumThreadListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [creating, setCreating] = useState(false);

  const loadBoardThreads = useCallback(async () => {
    if (!boardSlug) {
      setError('Missing board');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const walletQ = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : '';
      const r = await fetch(
        apiUrl(`/api/forum/boards/${encodeURIComponent(boardSlug)}/threads${walletQ}`)
      );
      const j = await parseApiJson<{
        board?: ForumBoardRow;
        threads?: ForumThreadListRow[];
        error?: string;
      }>(r);
      if (!r.ok) {
        throw new Error(describeForumApiFailure(j.error, r.status));
      }
      setBoard(j.board ?? null);
      setThreads(j.threads ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setBoard(null);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [boardSlug, publicKey]);

  useEffect(() => {
    void loadBoardThreads();
  }, [loadBoardThreads]);

  const canStartThread =
    Boolean(board && publicKey && isRegistered) &&
    meetsMinRank(
      userRankLevel({ isAdmin, isModerator }),
      effectiveMinStartThread(board)
    ) &&
    !accountLoading;

  const handleCreateThread = async () => {
    if (!publicKey || !board) return;
    const title = newTitle.trim();
    if (title.length < 1 || title.length > 200) {
      showToast('Title must be 1–200 characters.', 'error');
      return;
    }
    if (/[\r\n]/.test(title)) {
      showToast('Title cannot contain line breaks.', 'error');
      return;
    }
    const body = newBody.trim();
    if (body.length < 1) {
      showToast('Opening post (body) is required.', 'error');
      return;
    }
    if (body.length > 1000) {
      showToast('Body is too long (max 1,000 characters).', 'error');
      return;
    }
    const nonce = crypto.randomUUID();
    const message = [
      'Ligder forum new thread',
      `Wallet: ${publicKey}`,
      `Board: ${board.id}`,
      `Title: ${title}`,
      `Nonce: ${nonce}`,
      '',
      body,
    ].join('\n');

    const openingBody = newBody.trim();

    setCreating(true);
    try {
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/forum/threads'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });
      const j = await parseApiJson<{
        thread?: ForumThreadListRow & { op_post_id?: string };
        error?: string;
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || `Could not create thread (${r.status})`);
      }
      setNewTitle('');
      setNewBody('');
      const slug = boardSlug ?? board?.id;
      const tn = j.thread ? threadListNumber(j.thread) : null;
      if (slug && tn != null) {
        const path = `${boardBase}/${encodeURIComponent(slug)}/${tn}`;
        const th = j.thread;
        const opPostId = th?.op_post_id;
        if (th && opPostId && publicKey && board) {
          const op: ThreadDetailPost = {
            id: opPostId,
            parent_id: null,
            body: openingBody,
            author_wallet: publicKey,
            author_username: th.author_username ?? null,
            author_is_admin: isAdmin === true,
            author_is_moderator: isModerator === true,
            author_avatar_url: null,
            author_lite_holdings_ui: null,
            created_at: th.created_at,
            onchain_tx_sig: (th as { onchain_tx_sig?: string | null }).onchain_tx_sig ?? null,
          };
          const seed: ForumThreadSeed = {
            board,
            threadMeta: {
              id: th.id,
              thread_number: tn,
              title: th.title,
              author_username: th.author_username ?? null,
              created_at: th.created_at,
              onchain_tx_sig: (th as { onchain_tx_sig?: string | null }).onchain_tx_sig ?? null,
            },
            posts: [op],
          };
          navigate(path, { state: { forumThreadSeed: seed } });
        } else {
          navigate(path);
        }
      } else if (slug && j.thread?.id) {
        navigate(
          `${boardBase}/${encodeURIComponent(slug)}/${encodeURIComponent(j.thread.id)}`
        );
      } else {
        showToast('Thread created.', 'success');
        await loadBoardThreads();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not create thread', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/forums" className="text-blue-700 hover:text-blue-900 underline">
              ← Forums
            </Link>
            <Link to={boardBase} className="text-blue-700 hover:text-blue-900 underline">
              ← {sectionBackLabel}
            </Link>
          </div>
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

        <div className="flex justify-center mb-4">
          <img
            src="/images/readmore.png"
            alt=""
            className="h-auto w-auto max-w-md sm:max-w-lg object-contain opacity-95"
          />
        </div>

        <h1
          className="section-header flex flex-wrap items-center gap-2"
          style={{ marginTop: 0 }}
        >
          {board ? (
            <>
              <ForumBoardIcon iconKey={board.icon_key} />
              <span>{board.title}</span>
            </>
          ) : (
            'Board'
          )}
        </h1>

        {board ? (
          <p
            className="text-sm text-gray-700 mb-4"
            style={{ fontFamily: 'Times New Roman, serif' }}
          >
            {board.description ?? ''}{' '}
            <span className="text-gray-600">
              New threads: <strong>{effectiveMinStartThread(board)}</strong> or higher. Replies:{' '}
              <strong>{effectiveMinReply(board)}</strong> or higher.
            </span>
          </p>
        ) : null}

        {isRegistered && !accountLoading && board && !canStartThread ? (
          <p className="text-xs text-gray-600 mb-3" style={{ fontFamily: 'Arial, sans-serif' }}>
            Your rank cannot start threads here (requires {effectiveMinStartThread(board)} or higher).
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-800 mb-4">{error}</p>
        ) : null}

        {!loading && !error && board ? (
          <div className="forum-table-wrap">
            <table className="forum-table w-full border-collapse text-sm">
              <thead>
                <tr className="forum-table-head">
                  <th className="text-left p-2 border border-gray-400">Thread</th>
                  <th className="text-left p-2 border border-gray-400 w-36">Author</th>
                  <th className="text-center p-2 border border-gray-400 w-20">Replies</th>
                  <th className="text-left p-2 border border-gray-400">Last update</th>
                </tr>
              </thead>
              <tbody>
                {threads.length === 0 ? (
                  <tr className="bg-white">
                    <td
                      colSpan={4}
                      className="p-4 border border-gray-400 text-gray-600 text-center"
                      style={{ fontFamily: 'Times New Roman, serif' }}
                    >
                      No threads yet.
                    </td>
                  </tr>
                ) : (
                  threads.map((t) => {
                    const slugForPath = boardSlug ?? board?.id ?? '';
                    const num = threadListNumber(t);
                    const threadHref =
                      slugForPath &&
                      (num != null
                        ? `${boardBase}/${encodeURIComponent(slugForPath)}/${num}`
                        : `${boardBase}/${encodeURIComponent(slugForPath)}/${encodeURIComponent(t.id)}`);
                    return (
                    <tr key={t.id} className="forum-table-row bg-white">
                      <td className="p-2 border border-gray-400">
                        {threadHref ? (
                          <div className="flex flex-col gap-1">
                            <Link
                              to={threadHref}
                              className="font-bold text-blue-800 hover:underline inline-block cursor-pointer"
                              style={{ fontFamily: 'Arial, sans-serif' }}
                            >
                              {t.title}
                            </Link>
                            {t.onchain_tx_sig ? (
                              <a
                                href={solscanTxUrl(t.onchain_tx_sig)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[0.7rem] text-gray-700 hover:text-gray-900 underline font-mono"
                                title={t.onchain_tx_sig}
                              >
                                Creation TX: {t.onchain_tx_sig.slice(0, 10)}…{t.onchain_tx_sig.slice(-8)}
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <span
                            className="font-bold text-gray-900"
                            style={{ fontFamily: 'Arial, sans-serif' }}
                          >
                            {t.title}
                          </span>
                        )}
                        {num != null ? (
                          <span
                            className="block text-xs text-gray-500 font-mono mt-0.5"
                            title="Thread id in this board"
                          >
                            #{num}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="p-2 border border-gray-400 text-gray-800 text-xs"
                        style={{ fontFamily: 'Arial, sans-serif' }}
                      >
                        {t.author_username ? (
                          <Link
                            to={`/forums/u/${encodeURIComponent(t.author_username)}`}
                            className="text-blue-800 hover:text-blue-950 underline"
                          >
                            {t.author_username}
                          </Link>
                        ) : (
                          `${t.author_wallet.slice(0, 8)}…`
                        )}
                      </td>
                      <td className="p-2 border border-gray-400 text-center font-mono text-xs">
                        {t.posts_count}
                      </td>
                      <td
                        className="p-2 border border-gray-400 text-gray-700 text-xs"
                        style={{ fontFamily: 'Times New Roman, serif' }}
                      >
                        {new Date(t.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {canStartThread && board ? (
          <div
            className="mt-4 p-4 border border-gray-400 bg-gray-50"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            <p className="text-sm text-gray-800 m-0 mb-2" style={{ fontFamily: 'Times New Roman, serif' }}>
              <strong>New thread</strong> — title + opening post; Phantom signs the full message.
            </p>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Thread title"
              maxLength={200}
              className="w-full text-sm px-2 py-1.5 border border-gray-400 bg-white mb-2"
              disabled={creating}
            />
            <MarkdownEditor
              value={newBody}
              onChange={setNewBody}
              placeholder="Opening post (supports Markdown: bold/italic/headers/lists)…"
              maxLength={1000}
              disabled={creating}
            />
            <button
              type="button"
              onClick={() => void handleCreateThread()}
              disabled={creating || !newTitle.trim() || !newBody.trim()}
              className="text-sm px-4 py-2 border border-gray-800 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Signing…' : 'Sign & create'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default BoardThreadsPage;
