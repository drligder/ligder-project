import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import type { PostVoteAction, PostVoteSnapshot } from '../../types/forumVotes';

type PostVoteBarProps = {
  postId: string;
  /** Post number in thread (#1, #2, …) — centered between votes and time */
  postIndexInThread: number;
  /** Display string for when the post was made */
  postedAt: string;
  snapshot: PostVoteSnapshot;
  canVote: boolean;
  voteLoading: boolean;
  onVote: (postId: string, action: PostVoteAction) => Promise<void>;
  /** ACP delete control (shown on admin). */
  viewerIsAdmin?: boolean;
  onAdminDeletePost?: (postId: string) => void | Promise<void>;

  /** Edit control (shown for post author + admin). */
  viewerCanEdit?: boolean;
  onEditPost?: (postId: string) => void | Promise<void>;
};

/**
 * Thumbs up/down counts; mutually exclusive per user (handled by API + parent).
 */
export function PostVoteBar({
  postId,
  postIndexInThread,
  postedAt,
  snapshot,
  canVote,
  voteLoading,
  onVote,
  viewerIsAdmin = false,
  onAdminDeletePost,
  viewerCanEdit = false,
  onEditPost,
}: PostVoteBarProps) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const { up, down, myVote } = snapshot;

  const run = async (action: PostVoteAction) => {
    if (!canVote || busy) return;
    setBusy(true);
    try {
      await onVote(postId, action);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Vote failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onThumbUp = () => {
    if (myVote === 1) void run('clear');
    else void run('up');
  };

  const onThumbDown = () => {
    if (myVote === -1) void run('clear');
    else void run('down');
  };

  const disabled = !canVote || busy || voteLoading;
  const upActive = myVote === 1;
  const downActive = myVote === -1;

  const thumbBtn =
    'inline-flex items-center gap-1.5 px-2 py-1 border border-gray-200 rounded-sm bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div
      className="mt-3 pt-2 border-t border-gray-200 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-2 text-xs w-full items-center"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0 justify-self-start">
        <button
          type="button"
          disabled={disabled}
          onClick={() => void onThumbUp()}
          title={canVote ? (upActive ? 'Remove your upvote' : 'Upvote') : 'Register and connect to vote'}
          aria-pressed={upActive}
          className={thumbBtn}
        >
          <span className="text-base leading-none" aria-hidden>
            👍
          </span>
          <span className="tabular-nums font-semibold">{up}</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void onThumbDown()}
          title={canVote ? (downActive ? 'Remove your downvote' : 'Downvote') : 'Register and connect to vote'}
          aria-pressed={downActive}
          className={thumbBtn}
        >
          <span className="text-base leading-none" aria-hidden>
            👎
          </span>
          <span className="tabular-nums font-semibold">{down}</span>
        </button>
        {viewerCanEdit && onEditPost ? (
          <button
            type="button"
            disabled={editBusy}
            onClick={() => {
              const r = onEditPost(postId);
              setEditBusy(true);
              void Promise.resolve(r).finally(() => setEditBusy(false));
            }}
            title="Edit post"
            aria-label="Edit post"
            className="w-7 h-7 p-0 flex items-center justify-center leading-none text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5 block"
            >
              <path d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-8.7 8.7a1 1 0 0 1-.469.263l-3 0.75a.5.5 0 0 1-.607-.607l.75-3a1 1 0 0 1 .263-.469l8.7-8.7zM2 17.5A1.5 1.5 0 0 0 3.5 19h13A1.5 1.5 0 0 0 18 17.5v-13A1.5 1.5 0 0 0 16.5 3h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5h3a.5.5 0 0 0 0-1h-3A1.5 1.5 0 0 0 2 4.5v13z" />
            </svg>
          </button>
        ) : null}
        {viewerIsAdmin && onAdminDeletePost ? (
          <button
            type="button"
            disabled={deleteBusy}
            onClick={() => {
              const r = onAdminDeletePost(postId);
              setDeleteBusy(true);
              void Promise.resolve(r).finally(() => setDeleteBusy(false));
            }}
            title="Remove post (admin)"
            aria-label="Remove post"
            className="w-7 h-7 p-0 flex items-center justify-center leading-none text-red-700 border border-red-400 bg-white hover:bg-red-50 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5 block"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : null}
        {!canVote ? (
          <span className="text-gray-500">Connect and register to vote</span>
        ) : null}
      </div>
      <span className="text-gray-800 font-semibold tabular-nums text-center justify-self-center px-1">
        #{postIndexInThread}
      </span>
      <span className="text-gray-600 shrink-0 tabular-nums text-right justify-self-end">
        {postedAt}
      </span>
    </div>
  );
}
