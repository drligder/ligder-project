import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatLiteHoldings } from '../../lib/formatLite';
import { solscanAccountUrl, solscanTxUrl, truncateWalletDisplay } from '../../lib/solscan';
import type { AuthorForumSidebarStats, ForumMemberRank, ForumThreadPost } from '../../types/forum';
import type { PostVoteAction, PostVoteSnapshot } from '../../types/forumVotes';
import { PostVoteBar } from './PostVoteBar';
import { ForumMarkdown } from './ForumMarkdown';
import { ForumPollPanel } from './ForumPollPanel';

/** Rank label color + matching avatar frame (gentle, readable). */
const RANK_THEME: Record<ForumMemberRank, { text: string; avatarBorder: string }> = {
  Member: {
    text: 'text-green-800',
    avatarBorder: 'border-2 border-green-600/45',
  },
  Moderator: {
    text: 'text-blue-800',
    avatarBorder: 'border-2 border-blue-600/50',
  },
  Administrator: {
    text: 'text-red-800',
    avatarBorder: 'border-2 border-red-600/50',
  },
};

function formatStatInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.trunc(n).toLocaleString();
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.86 8.36 6.84 9.72.5.1.68-.22.68-.48 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.38-3.37-1.38-.45-1.17-1.11-1.48-1.11-1.48-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.36 1.11 2.94.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.15-4.56-5.13 0-1.13.39-2.05 1.03-2.77-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 7.07c.85 0 1.71.12 2.51.35 1.91-1.32 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.64 1.03 2.77 0 3.99-2.35 4.86-4.58 5.12.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.84 0 .26.18.58.69.48A10.02 10.02 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M18.9 2H22l-6.8 7.77L23.2 22h-6.3l-4.95-6.4L5.4 22H2.3l7.4-8.46L1 2h6.5l4.48 5.8L18.9 2Zm-1.1 18h1.75L6.5 3.9H4.6L17.8 20Z" />
    </svg>
  );
}

function SidebarStatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_8rem] w-full border-b border-gray-400 last:border-b-0">
      <div
        className="min-w-0 border-r border-gray-400 bg-gray-100 px-1.5 py-1 text-left font-semibold text-gray-800"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        {label}
      </div>
      <div
        className="min-w-0 w-full px-1.5 py-1 text-right tabular-nums text-gray-900 flex items-center justify-end min-h-[1.75rem]"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        <span className="block w-full min-w-0 text-right">{value}</span>
      </div>
    </div>
  );
}

type ThreadPostProps = {
  post: ForumThreadPost;
  /** 1-based index in thread (#1 = OP) */
  index1Based: number;
  /** From /api/reputation/by-usernames; null if unknown user */
  authorStats: AuthorForumSidebarStats | null;
  statsLoading: boolean;
  voteSnapshot: PostVoteSnapshot;
  voteLoading: boolean;
  canVote: boolean;
  onVote: (postId: string, action: PostVoteAction) => Promise<void>;
  /** Reply nesting depth (indents body only, not sidebar) */
  replyDepth?: number;
  showReplyButton?: boolean;
  onReply?: () => void;
  viewerIsAdmin?: boolean;
  onAdminDeletePost?: (postId: string) => void | Promise<void>;
  onAdminBanUser?: (wallet: string, username: string) => void;
  viewerCanEdit?: boolean;
  onEditPost?: (postId: string) => void | Promise<void>;
  /** Board section is LIGDER GOVERNANCE — poll copy + server gates */
  isGovernanceBoard?: boolean;
  /** Refetch thread after poll create/vote */
  onThreadPollsRefresh?: () => void;
};

/**
 * Single post row: narrow author column + body. Striped rows alternate background.
 * Map API/DB rows to {@link ForumThreadPost} and render in a list.
 */
function ReplyIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1" />
      <path d="M17 3v4h4" />
    </svg>
  );
}

export function ThreadPost({
  post,
  index1Based,
  authorStats,
  statsLoading,
  voteSnapshot,
  voteLoading,
  canVote,
  onVote,
  replyDepth = 0,
  showReplyButton = false,
  onReply,
  viewerIsAdmin = false,
  onAdminDeletePost,
  onAdminBanUser,
  viewerCanEdit = false,
  onEditPost,
}: ThreadPostProps) {
  const stripe = index1Based % 2 === 1 ? 'bg-white' : 'bg-gray-50';
  const liteLabel = formatLiteHoldings(post.liteHoldingsUi ?? null);
  const rankTheme = RANK_THEME[post.rank];

  const repVal = statsLoading
    ? '…'
    : formatStatInt(authorStats?.reputation ?? null);
  const likesVal = statsLoading
    ? '…'
    : formatStatInt(authorStats?.likesOnPosts ?? null);
  const xHandle = post.socials?.x ? post.socials.x.trim().replace(/^@/, '') : '';
  const githubHandle = post.socials?.github
    ? post.socials.github.trim().replace(/^@/, '')
    : '';
  const socialsVal =
    !xHandle && !githubHandle ? (
      '—'
    ) : (
      <div className="flex items-center justify-end gap-2 w-full">
        {xHandle ? (
          <a
            href={`https://x.com/${encodeURIComponent(xHandle)}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`X: @${xHandle}`}
            className="text-blue-800 hover:text-blue-950"
          >
            <XIcon className="w-4 h-4" />
          </a>
        ) : null}
        {githubHandle ? (
          <a
            href={`https://github.com/${encodeURIComponent(githubHandle)}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`GitHub: ${githubHandle}`}
            className="text-gray-900 hover:text-black"
          >
            <GithubIcon className="w-4 h-4" />
          </a>
        ) : null}
      </div>
    );

  const bodyIndentPx = Math.min(replyDepth, 8) * 12;

  const walletDisplay = post.authorWallet ? (
    <a
      href={solscanAccountUrl(post.authorWallet)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-800 underline hover:text-blue-950 font-mono text-[0.65rem] leading-tight"
      title={post.authorWallet}
    >
      {truncateWalletDisplay(post.authorWallet)}
    </a>
  ) : (
    '—'
  );

  return (
    <article
      id={`forum-post-${post.id}`}
      className={`forum-thread-post flex border-b border-gray-300 last:border-b-0 scroll-mt-4 ${stripe}`}
      data-post-id={post.id}
    >
      <div
        className="forum-thread-post-sidebar w-[17rem] shrink-0 p-2.5 border-r border-gray-300 text-xs flex flex-col items-stretch"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        <div className="w-full flex justify-center mb-2">
          {post.avatarUrl ? (
            <img
              src={post.avatarUrl}
              alt=""
              className={`w-12 h-12 object-cover bg-gray-50 rounded-sm ${rankTheme.avatarBorder}`}
            />
          ) : (
            <div
              className={`w-12 h-12 bg-gray-100 flex items-center justify-center text-gray-600 text-sm font-serif rounded-sm ${rankTheme.avatarBorder}`}
            >
              {post.username.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        {viewerIsAdmin && onAdminBanUser && post.authorWallet ? (
          <button
            type="button"
            className="font-bold text-gray-900 break-words w-full text-center text-[0.8125rem] hover:underline text-blue-900"
            onClick={() => onAdminBanUser(post.authorWallet!, post.username)}
          >
            {post.username}
          </button>
        ) : (
          <Link
            to={`/forums/u/${encodeURIComponent(post.username)}`}
            className="font-bold text-blue-900 break-words w-full text-center text-[0.8125rem] hover:underline"
          >
            {post.username}
          </Link>
        )}
        <div
          className={`forum-rank mt-1.5 text-[18px] font-normal leading-snug w-full px-0.5 text-center ${rankTheme.text}`}
        >
          {post.rank}
        </div>

        <div
          className="mt-2 w-full border border-gray-400 bg-white overflow-hidden rounded-[1px]"
          title="Profile stats (forum-wide)"
        >
          <SidebarStatRow label="Register Wallet" value={walletDisplay} />
          <SidebarStatRow label="$LITE Holdings" value={liteLabel} />
          <SidebarStatRow label="Reputation" value={repVal} />
          <SidebarStatRow label="Likes" value={likesVal} />
          <SidebarStatRow label="Socials" value={socialsVal} />
        </div>
      </div>
      <div
        className="forum-thread-post-body p-3 flex-1 min-w-0 flex flex-col text-sm min-h-0"
        style={
          bodyIndentPx > 0
            ? { marginLeft: bodyIndentPx, marginRight: 0 }
            : undefined
        }
      >
        {showReplyButton && onReply ? (
          <div className="flex flex-col items-end shrink-0 gap-1 mb-1 -mt-0.5">
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-1 text-xs text-blue-800 hover:text-blue-950 font-sans"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              <ReplyIcon className="w-3.5 h-3.5 opacity-90" />
              Reply
            </button>
          </div>
        ) : null}
        {post.replyTo ? (
          <div
            className="mb-3 shrink-0 border border-gray-300 bg-gray-50/90 px-3 py-2 rounded-sm"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            <p className="text-[0.7rem] text-gray-600 m-0 mb-1.5">
              Replying to{' '}
              <a
                href={`#forum-post-${post.replyTo.parentPostId}`}
                className="text-blue-800 font-semibold hover:text-blue-950 underline"
              >
                {post.replyTo.authorLabel}
              </a>
            </p>
            <p
              className="text-sm text-gray-800 m-0 pl-3 border-l-4 border-gray-400 italic leading-snug"
              style={{ fontFamily: 'Times New Roman, serif' }}
            >
              {post.replyTo.excerpt}
            </p>
          </div>
        ) : null}
        {post.onchainTxSig ? (
          <div
            className="mb-2 text-[0.75rem] text-gray-700"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            This reply was recorded on-chain:{' '}
            <a
              href={solscanTxUrl(post.onchainTxSig)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-800 underline hover:text-blue-950 font-mono"
              title={post.onchainTxSig}
            >
              {post.onchainTxSig.slice(0, 10)}…{post.onchainTxSig.slice(-8)}
            </a>
          </div>
        ) : post.onchainStatus === 'pending' ? (
          <div
            className="mb-2 text-[0.75rem] text-gray-600"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            On-chain attestation pending…
          </div>
        ) : post.onchainStatus === 'failed' ? (
          <div
            className="mb-2 text-[0.75rem] text-red-800"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            On-chain attestation failed (server will retry).
          </div>
        ) : null}
        <div className="leading-relaxed break-words flex-1 min-w-0" style={{ fontFamily: 'Times New Roman, serif' }}>
          <ForumMarkdown text={post.body} />
        </div>
        <ForumPollPanel
          postId={post.id}
          poll={post.poll}
          pollCreateEligible={post.pollCreateEligible === true}
          isGovernanceBoard={isGovernanceBoard}
          onPollsChanged={() => onThreadPollsRefresh?.()}
        />
        <PostVoteBar
          postId={post.id}
          postIndexInThread={index1Based}
          postedAt={post.postedAt}
          snapshot={voteSnapshot}
          voteLoading={voteLoading}
          canVote={canVote}
          onVote={onVote}
          viewerIsAdmin={viewerIsAdmin}
          onAdminDeletePost={onAdminDeletePost}
          viewerCanEdit={viewerCanEdit}
          onEditPost={onEditPost}
        />
      </div>
    </article>
  );
}
