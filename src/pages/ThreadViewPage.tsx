import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { ThreadHeader, ThreadPost } from '../components/forum';
import { useToast } from '../contexts/ToastContext';
import { useWallet } from '../contexts/WalletContext';
import { useForumAccount } from '../hooks/useForumAccount';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { useForumPostVotes } from '../hooks/useForumPostVotes';
import {
  adminBanMessage,
  adminDeletePostMessage,
} from '../lib/adminMessages';
import { apiUrl, describeForumApiFailure } from '../lib/apiBase';
import { excerptParentBody } from '../lib/forumExcerpt';
import { solscanTxUrl } from '../lib/solscan';
import {
  effectiveMinReply,
  meetsMinRank,
  userRankLevel,
} from '../lib/forumRanks';
import { MarkdownEditor } from '../components/forum/MarkdownEditor';
import { parseApiJson } from '../lib/parseApiJson';
import { uint8ToBase64 } from '../lib/uint8Base64';
import type {
  AuthorForumSidebarStats,
  ForumThreadPost,
  ForumThreadSeed,
  ThreadDetailPost,
} from '../types/forum';
import type { ForumBoardRow } from '../types/forumBoards';
import type { PostVoteAction } from '../types/forumVotes';
import {
  forumBoardBaseFromPathname,
  forumSectionLabelFromBase,
} from '../lib/forumBoardBasePath';

function forumThreadSeedMatchesRoute(
  seed: ForumThreadSeed,
  boardSlug: string | undefined,
  threadNumber: string | undefined
): boolean {
  if (!boardSlug || !threadNumber || !seed.board) return false;
  if (seed.board.id !== boardSlug) return false;
  const raw = threadNumber.trim();
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(raw)) {
    return seed.threadMeta.id === raw;
  }
  const n = parseInt(raw, 10);
  return (
    Number.isFinite(n) &&
    n >= 1 &&
    n === seed.threadMeta.thread_number
  );
}

function mapThreadReplyApiPostToDetail(
  p: Record<string, unknown>
): ThreadDetailPost {
  const isAdmin = p.author_is_admin === true;
  const isModRaw = p.author_is_moderator === true;
  return {
    id: String(p.id),
    parent_id:
      p.parent_id == null || p.parent_id === undefined
        ? null
        : String(p.parent_id),
    body: String(p.body ?? ''),
    author_wallet: String(p.author_wallet ?? ''),
    author_username: (p.author_username as string | null) ?? null,
    author_is_admin: isAdmin,
    author_is_moderator: isModRaw && !isAdmin,
    author_avatar_url: (p.author_avatar_url as string | null) ?? null,
    author_lite_holdings_ui: p.author_lite_holdings_ui ?? null,
    author_x_handle: (p.author_x_handle as string | null) ?? null,
    author_github_handle: (p.author_github_handle as string | null) ?? null,
    created_at: String(p.created_at ?? ''),
    onchain_tx_sig: (p.onchain_tx_sig as string | null) ?? null,
    onchain_status: (p.onchain_status as string | null) ?? null,
  };
}

function orderThreadPosts(posts: ThreadDetailPost[]): ThreadDetailPost[] {
  const ops = posts
    .filter((p) => p.parent_id === null)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  const op = ops[0];
  if (!op) return posts.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  function collect(parentId: string): ThreadDetailPost[] {
    const ch = posts
      .filter((p) => p.parent_id === parentId)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    const out: ThreadDetailPost[] = [];
    for (const c of ch) {
      out.push(c);
      out.push(...collect(c.id));
    }
    return out;
  }

  return [op, ...collect(op.id)];
}

function depthFor(
  post: ThreadDetailPost,
  byId: Map<string, ThreadDetailPost>,
  opId: string
): number {
  if (post.id === opId) return 0;
  let d = 0;
  let pid: string | null = post.parent_id;
  while (pid && pid !== opId) {
    d++;
    const p = byId.get(pid);
    if (!p) break;
    pid = p.parent_id;
  }
  return d + 1;
}

function mapToForumThreadPost(
  p: ThreadDetailPost,
  byId: Map<string, ThreadDetailPost>,
  opId: string
): ForumThreadPost {
  const av = p.author_avatar_url;
  const rank: ForumThreadPost['rank'] = p.author_is_admin
    ? 'Administrator'
    : p.author_is_moderator
      ? 'Moderator'
      : 'Member';
  let replyTo: ForumThreadPost['replyTo'];
  /** Only show parent quote when replying to a specific post (not a generic thread reply under the OP). */
  const isReplyUnderOpOnly =
    p.parent_id != null && opId !== '' && p.parent_id === opId;
  if (p.parent_id && !isReplyUnderOpOnly) {
    const parent = byId.get(p.parent_id);
    if (parent) {
      replyTo = {
        parentPostId: parent.id,
        authorLabel:
          parent.author_username ?? `${parent.author_wallet.slice(0, 6)}…`,
        excerpt: excerptParentBody(parent.body),
      };
    }
  }
  return {
    id: p.id,
    username: p.author_username ?? `${p.author_wallet.slice(0, 6)}…`,
    authorWallet: p.author_wallet,
    postedAt: new Date(p.created_at).toLocaleString(),
    body: p.body,
    avatarUrl:
      typeof av === 'string' && av.startsWith('https://') ? av : null,
    rank,
    liteHoldingsUi: p.author_lite_holdings_ui ?? null,
    onchainTxSig: p.onchain_tx_sig ?? null,
    onchainStatus: p.onchain_status ?? null,
    socials:
      p.author_x_handle || p.author_github_handle
        ? {
            x: p.author_x_handle ?? null,
            github: p.author_github_handle ?? null,
          }
        : undefined,
    replyTo,
    poll: p.poll ?? null,
    pollCreateEligible: p.poll_create_eligible === true,
    pollEditEligible: p.poll_edit_eligible === true,
  };
}

const ThreadViewPage = () => {
  const { boardSlug, threadNumber } = useParams<{
    boardSlug: string;
    threadNumber: string;
  }>();
  const location = useLocation();
  const boardBase = forumBoardBaseFromPathname(location.pathname);
  const sectionBackLabel = forumSectionLabelFromBase(boardBase);
  const navigate = useNavigate();
  const skipNextThreadLoadRef = useRef(false);
  const { publicKey, signMessage } = useWallet();
  const { showToast } = useToast();
  const { isRegistered, profileLoading } = useLigderProfile();
  const { isAdmin, isModerator } = useForumAccount();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [banTarget, setBanTarget] = useState<{
    wallet: string;
    username: string;
  } | null>(null);
  const [banDays, setBanDays] = useState(7);
  const [banning, setBanning] = useState(false);

  const [board, setBoard] = useState<ForumBoardRow | null>(null);
  const [threadTitle, setThreadTitle] = useState('');
  const [threadMeta, setThreadMeta] = useState<{
    id: string;
    thread_number: number;
    author_username: string | null;
    created_at: string;
  } | null>(null);
  const [posts, setPosts] = useState<ThreadDetailPost[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [replyBody, setReplyBody] = useState('');
  const [replyParent, setReplyParent] = useState<'root' | string>('root');
  const [replying, setReplying] = useState(false);

  const [editPost, setEditPost] = useState<{
    postId: string;
    draft: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const ordered = useMemo(() => orderThreadPosts(posts), [posts]);
  const byId = useMemo(
    () => new Map(posts.map((p) => [p.id, p])),
    [posts]
  );
  const opId = ordered[0]?.id ?? '';

  const postIds = useMemo(() => posts.map((p) => p.id), [posts]);
  const usernames = useMemo(
    () => [...new Set(posts.map((p) => p.author_username).filter(Boolean) as string[])],
    [posts]
  );

  const [statsByUser, setStatsByUser] = useState<
    Record<string, AuthorForumSidebarStats>
  >({});
  const [statsLoading, setStatsLoading] = useState(true);

  const voteThreadKey =
    boardSlug && threadNumber ? `${boardSlug}:${threadNumber}` : undefined;

  const { votes: voteMap, loading: voteLoading, error: voteError, castVote } =
    useForumPostVotes(postIds, publicKey, signMessage, voteThreadKey);

  const fetchReputations = useCallback(async () => {
    if (usernames.length === 0) {
      setStatsByUser({});
      setStatsLoading(false);
      return;
    }
    setStatsLoading(true);
    const q = encodeURIComponent(usernames.join(','));
    try {
      const r = await fetch(apiUrl(`/api/reputation/by-usernames?usernames=${q}`));
      const j = await parseApiJson<{
        reputations?: Record<
          string,
          { total?: number; likes?: number; dislikes?: number }
        >;
        error?: string;
      }>(r);
      if (!r.ok) throw new Error(j.error || 'Reputation request failed');
      const raw = j.reputations ?? {};
      const next: Record<string, AuthorForumSidebarStats> = {};
      for (const name of usernames) {
        const row = raw[name];
        next[name] = {
          reputation: typeof row?.total === 'number' ? row.total : null,
          likesOnPosts: typeof row?.likes === 'number' ? row.likes : null,
          dislikesOnPosts:
            typeof row?.dislikes === 'number' ? row.dislikes : null,
        };
      }
      setStatsByUser(next);
    } catch {
      const next: Record<string, AuthorForumSidebarStats> = {};
      for (const name of usernames) {
        next[name] = {
          reputation: null,
          likesOnPosts: null,
          dislikesOnPosts: null,
        };
      }
      setStatsByUser(next);
    } finally {
      setStatsLoading(false);
    }
  }, [usernames]);

  useEffect(() => {
    void fetchReputations();
  }, [fetchReputations]);

  const loadThread = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!boardSlug || !threadNumber) {
      setLoadError('Invalid URL');
      setLoading(false);
      return;
    }
    const raw = threadNumber.trim();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        raw
      );
    const pathSeg = isUuid
      ? encodeURIComponent(raw)
      : (() => {
          const n = parseInt(raw, 10);
          return Number.isFinite(n) && n >= 1 ? String(n) : '';
        })();
    if (!pathSeg) {
      setLoadError('Invalid thread number');
      setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const walletQ = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : '';
      const r = await fetch(
        apiUrl(
          `/api/forum/boards/${encodeURIComponent(boardSlug)}/threads/${pathSeg}${walletQ}`
        )
      );
      const j = await parseApiJson<{
        board?: ForumBoardRow;
        thread?: {
          id: string;
          thread_number: number;
          title: string;
          author_username: string | null;
          created_at: string;
          onchain_tx_sig?: string | null;
          onchain_status?: string | null;
        };
        posts?: ThreadDetailPost[];
        error?: string;
      }>(r);
      if (!r.ok) {
        throw new Error(describeForumApiFailure(j.error, r.status));
      }
      setBoard(j.board ?? null);
      const th = j.thread;
      if (th) {
        setThreadTitle(th.title);
        setThreadMeta({
          id: th.id,
          thread_number: th.thread_number,
          author_username: th.author_username,
          created_at: th.created_at,
          onchain_tx_sig: th.onchain_tx_sig ?? null,
          onchain_status: th.onchain_status ?? null,
        });
      } else {
        setThreadTitle('');
        setThreadMeta(null);
      }
      setPosts(j.posts ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load');
      setBoard(null);
      setThreadMeta(null);
      setPosts([]);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [boardSlug, threadNumber, publicKey]);

  useEffect(() => {
    if (!boardSlug || !threadNumber) return;

    const seed = (location.state as { forumThreadSeed?: ForumThreadSeed } | null)
      ?.forumThreadSeed;

    if (seed && forumThreadSeedMatchesRoute(seed, boardSlug, threadNumber)) {
      setBoard(seed.board);
      setThreadTitle(seed.threadMeta.title);
      setThreadMeta({
        id: seed.threadMeta.id,
        thread_number: seed.threadMeta.thread_number,
        author_username: seed.threadMeta.author_username,
        created_at: seed.threadMeta.created_at,
          onchain_tx_sig: seed.threadMeta.onchain_tx_sig ?? null,
          onchain_status: (seed.threadMeta as { onchain_status?: string | null }).onchain_status ?? null,
      });
      setPosts(seed.posts);
      setLoadError(null);
      setLoading(false);
      skipNextThreadLoadRef.current = true;
      navigate(location.pathname, { replace: true, state: {} });
      void loadThread({ silent: true });
      return;
    }

    if (skipNextThreadLoadRef.current) {
      skipNextThreadLoadRef.current = false;
      return;
    }

    void loadThread();
  }, [boardSlug, threadNumber, location.state, location.pathname, navigate, loadThread]);

  const handleForumVote = useCallback(
    async (postId: string, action: PostVoteAction) => {
      await castVote(postId, action);
      await fetchReputations();
    },
    [castVote, fetchReputations]
  );

  const canReplyRank = useMemo(() => {
    if (!board) return true;
    return meetsMinRank(
      userRankLevel({ isAdmin, isModerator }),
      effectiveMinReply(board)
    );
  }, [board, isAdmin, isModerator]);

  const handleAdminDeletePost = useCallback(
    async (postId: string) => {
      if (!publicKey || !isAdmin) return;
      if (!window.confirm('Remove this post from the thread?')) return;
      const nonce = crypto.randomUUID();
      const message = adminDeletePostMessage(publicKey, postId, nonce);
      try {
        const sig = await signMessage(new TextEncoder().encode(message));
        const r = await fetch(apiUrl('/api/admin/delete-post'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: publicKey,
            message,
            signature: uint8ToBase64(sig),
          }),
        });
        const j = await parseApiJson<{ error?: string; deleted?: string }>(r);
        if (!r.ok) {
          throw new Error(j.error || 'Delete failed');
        }
        showToast(
          j.deleted === 'thread' ? 'Thread removed.' : 'Post removed.',
          'success'
        );
        await loadThread({ silent: true });
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
      }
    },
    [publicKey, isAdmin, signMessage, showToast, loadThread]
  );

  const submitBan = useCallback(async () => {
    if (!publicKey || !banTarget || !isAdmin) return;
    setBanning(true);
    try {
      const nonce = crypto.randomUUID();
      const message = adminBanMessage(
        publicKey,
        banTarget.wallet,
        Math.min(365, Math.max(1, banDays)),
        nonce
      );
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/admin/ban'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });
      const j = await parseApiJson<{ error?: string }>(r);
      if (!r.ok) {
        throw new Error(j.error || 'Ban failed');
      }
      showToast('User banned.', 'success');
      setBanTarget(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Ban failed', 'error');
    } finally {
      setBanning(false);
    }
  }, [publicKey, banTarget, banDays, isAdmin, signMessage, showToast]);

  const submitReply = async () => {
    if (!publicKey || !boardSlug || !threadNumber || !isRegistered) return;
    const body = replyBody.trim();
    if (body.length < 1) {
      showToast('Write a reply first.', 'error');
      return;
    }
    if (body.length > 30000) {
      showToast('Reply is too long.', 'error');
      return;
    }
    const numForReply =
      threadMeta?.thread_number != null
        ? Number(threadMeta.thread_number)
        : parseInt(threadNumber ?? '', 10);
    if (!Number.isFinite(numForReply) || numForReply < 1) {
      showToast('Thread is still loading.', 'error');
      return;
    }
    const nonce = crypto.randomUUID();
    const message = [
      'Ligder forum thread reply',
      `Wallet: ${publicKey}`,
      `Board: ${boardSlug}`,
      `Thread number: ${numForReply}`,
      `Parent post: ${replyParent}`,
      `Nonce: ${nonce}`,
      '',
      body,
    ].join('\n');

    setReplying(true);
    try {
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/forum/thread-replies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });
      const j = await parseApiJson<{
        error?: string;
        post?: Record<string, unknown>;
      }>(r);
      if (!r.ok) {
        throw new Error(j.error || `Reply failed (${r.status})`);
      }
      const raw = j.post;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        setPosts((prev) => [...prev, mapThreadReplyApiPostToDetail(raw)]);
      } else {
        await loadThread({ silent: true });
      }
      setReplyBody('');
      setReplyParent('root');
      showToast('Reply posted.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reply failed', 'error');
    } finally {
      setReplying(false);
    }
  };

  const submitEdit = async () => {
    if (!publicKey || !editPost) return;
    const body = editPost.draft.trim();
    if (body.length < 1) {
      showToast('Write something to edit.', 'error');
      return;
    }
    if (body.length > 30000) {
      showToast('Post is too long.', 'error');
      return;
    }

    setEditSaving(true);
    try {
      const nonce = crypto.randomUUID();
      const message = [
        'Ligder forum edit post',
        `Wallet: ${publicKey}`,
        `Post ID: ${editPost.postId}`,
        `Nonce: ${nonce}`,
        '',
        body,
      ].join('\n');

      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl(`/api/forum/thread-posts/${editPost.postId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });

      const j = await parseApiJson<{ error?: string }>(r);
      if (!r.ok) {
        if (r.status === 404) {
          throw new Error(
            'Edit endpoint not found (`/api/forum/thread-posts/:postId`). Make sure the backend server is restarted after updates.'
          );
        }
        throw new Error(j.error || `Edit failed (${r.status})`);
      }

      setEditPost(null);
      showToast('Post updated.', 'success');
      await loadThread({ silent: true });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Edit failed', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const byline =
    threadMeta && threadMeta.author_username
      ? `by ${threadMeta.author_username} · ${new Date(threadMeta.created_at).toLocaleString()} · #${threadMeta.thread_number}`
      : threadMeta
        ? `· ${new Date(threadMeta.created_at).toLocaleString()} · #${threadMeta.thread_number}`
        : '';

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-5 sm:px-6 sm:py-6">
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
            {boardSlug ? (
              <Link
                to={`${boardBase}/${encodeURIComponent(boardSlug)}`}
                className="text-blue-700 hover:text-blue-900 underline"
              >
                ← {board?.title ?? 'Board'}
              </Link>
            ) : null}
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

        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : null}
        {loadError ? (
          <p className="text-sm text-red-800 mb-4">{loadError}</p>
        ) : null}

        {!loading && !loadError && threadMeta ? (
          <div className="forum-thread border border-gray-400 mb-4">
            <ThreadHeader title={threadTitle} byline={byline} />
            {threadMeta.onchain_tx_sig ? (
              <div
                className="px-3 py-2 border-b border-gray-300 text-[0.75rem] text-gray-700"
                style={{ fontFamily: 'Arial, sans-serif' }}
              >
                Creation TX:{' '}
                <a
                  href={solscanTxUrl(threadMeta.onchain_tx_sig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-800 underline hover:text-blue-950 font-mono"
                  title={threadMeta.onchain_tx_sig}
                >
                  {threadMeta.onchain_tx_sig.slice(0, 10)}…{threadMeta.onchain_tx_sig.slice(-8)}
                </a>
              </div>
            ) : threadMeta.onchain_status === 'pending' ? (
              <div
                className="px-3 py-2 border-b border-gray-300 text-[0.75rem] text-gray-700"
                style={{ fontFamily: 'Arial, sans-serif' }}
              >
                On-chain attestation: pending…
              </div>
            ) : threadMeta.onchain_status === 'failed' ? (
              <div
                className="px-3 py-2 border-b border-gray-300 text-[0.75rem] text-red-800"
                style={{ fontFamily: 'Arial, sans-serif' }}
              >
                On-chain attestation: failed (server will retry).
              </div>
            ) : null}
            {voteError ? (
              <p
                className="text-sm text-red-800 px-3 py-2 border-b border-gray-300"
                style={{ fontFamily: 'Times New Roman, serif' }}
              >
                {voteError}
              </p>
            ) : null}
            {ordered.map((p, i) => {
              const fp = mapToForumThreadPost(p, byId, opId);
              const depth = depthFor(p, byId, opId);
              const authorStats =
                fp.username && statsByUser[fp.username]
                  ? statsByUser[fp.username]
                  : null;
              const viewerIsOwner =
                Boolean(publicKey && fp.authorWallet && fp.authorWallet === publicKey);
              const viewerCanEdit =
                Boolean(publicKey && isRegistered && viewerIsOwner);
              return (
                <div
                  key={p.id}
                  className="border-b border-gray-400 last:border-b-0"
                >
                  <ThreadPost
                    post={fp}
                    index1Based={i + 1}
                    authorStats={authorStats}
                    statsLoading={statsLoading}
                    voteSnapshot={
                      voteMap[p.id] ?? { up: 0, down: 0, myVote: null }
                    }
                    voteLoading={voteLoading}
                    canVote={Boolean(publicKey && isRegistered)}
                    onVote={handleForumVote}
                    replyDepth={depth}
                    showReplyButton={Boolean(
                      isRegistered && publicKey && canReplyRank
                    )}
                    onReply={() =>
                      setReplyParent(p.id === opId ? 'root' : p.id)
                    }
                    viewerIsAdmin={isAdmin}
                    onAdminDeletePost={
                      isAdmin ? handleAdminDeletePost : undefined
                    }
                    onAdminBanUser={
                      isAdmin
                        ? (w, u) => {
                            setBanTarget({ wallet: w, username: u });
                            setBanDays(7);
                          }
                        : undefined
                    }
                    viewerCanEdit={viewerCanEdit}
                    onEditPost={
                      viewerCanEdit
                        ? () => setEditPost({ postId: fp.id, draft: fp.body })
                        : undefined
                    }
                    isGovernanceBoard={board?.section === 'LIGDER GOVERNANCE'}
                    onThreadPollsRefresh={() => void loadThread({ silent: true })}
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        {isRegistered && publicKey && threadMeta && canReplyRank ? (
          <div
            className="p-4 border border-gray-400 bg-gray-50"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            <p className="text-sm text-gray-800 m-0 mb-2" style={{ fontFamily: 'Times New Roman, serif' }}>
              <strong>Reply</strong>
              {replyParent === 'root'
                ? ' — attaches under the opening post.'
                : ` — target post id ${replyParent.slice(0, 8)}…`}
              {replyParent !== 'root' ? (
                <button
                  type="button"
                  className="ml-2 text-blue-800 underline text-xs"
                  onClick={() => setReplyParent('root')}
                >
                  (use thread reply instead)
                </button>
              ) : null}
            </p>
            <MarkdownEditor
              value={replyBody}
              onChange={setReplyBody}
              placeholder="Your message (supports Markdown)…"
              maxLength={30000}
              disabled={replying}
            />
            <button
              type="button"
              onClick={() => void submitReply()}
              disabled={replying || !replyBody.trim()}
              className="text-sm px-4 py-2 border border-gray-800 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-50"
            >
              {replying ? 'Signing…' : 'Sign & post reply'}
            </button>
          </div>
        ) : null}

        {editPost ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal
            aria-labelledby="edit-post-title"
          >
            <div
              className="bg-white border border-gray-400 shadow-lg max-w-2xl w-full p-4 text-sm"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              <h2 id="edit-post-title" className="text-base font-bold m-0 mb-2">
                Edit post
              </h2>
              <div className="mb-3 text-xs text-gray-600">
                Formatting uses Markdown. Your changes will update this post immediately.
              </div>
              <MarkdownEditor
                value={editPost.draft}
                onChange={(next) =>
                  setEditPost((prev) =>
                    prev ? { ...prev, draft: next } : prev
                  )
                }
                maxLength={30000}
                disabled={editSaving}
                placeholder="Edit your post…"
              />
              <div className="flex gap-2 justify-end mt-3">
                <button
                  type="button"
                  className="px-3 py-1.5 border border-gray-400 bg-white hover:bg-gray-50"
                  onClick={() => setEditPost(null)}
                  disabled={editSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 border border-gray-800 bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
                  onClick={() => void submitEdit()}
                  disabled={editSaving}
                >
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!profileLoading && !isRegistered ? (
          <p className="text-sm text-gray-600 mt-4" style={{ fontFamily: 'Times New Roman, serif' }}>
            Connect and register to reply and vote.
          </p>
        ) : null}
        {isRegistered && publicKey && threadMeta && !canReplyRank ? (
          <p
            className="text-sm text-amber-900 mt-4 border border-amber-300 bg-amber-50 px-3 py-2"
            style={{ fontFamily: 'Times New Roman, serif' }}
          >
            Your rank does not allow replying in this board.
          </p>
        ) : null}

        {banTarget ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal
            aria-labelledby="ban-dialog-title"
          >
            <div
              className="bg-white border border-gray-400 shadow-lg max-w-md w-full p-4 text-sm"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              <h2 id="ban-dialog-title" className="text-base font-bold m-0 mb-2">
                Ban {banTarget.username}
              </h2>
              <p className="text-gray-700 m-0 mb-3">
                Block this wallet from the forum for a number of days (1–365). They will be
                disconnected on their next profile check.
              </p>
              <label className="block text-xs text-gray-600 mb-1">Days</label>
              <input
                type="number"
                min={1}
                max={365}
                value={banDays}
                onChange={(e) =>
                  setBanDays(
                    Math.min(
                      365,
                      Math.max(1, parseInt(e.target.value, 10) || 1)
                    )
                  )
                }
                className="w-full border border-gray-400 px-2 py-1 mb-4"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="px-3 py-1.5 border border-gray-400 bg-white hover:bg-gray-50"
                  onClick={() => setBanTarget(null)}
                  disabled={banning}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 border border-red-700 bg-red-50 text-red-900 hover:bg-red-100 disabled:opacity-50"
                  onClick={() => void submitBan()}
                  disabled={banning}
                >
                  {banning ? 'Signing…' : 'Sign & ban'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ThreadViewPage;
