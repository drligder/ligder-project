import type { ForumBoardMinRank } from '../types/forumBoards';

export type UserForumRankLevel = 'member' | 'moderator' | 'administrator';

export function userRankLevel(opts: {
  isAdmin: boolean;
  isModerator: boolean;
}): UserForumRankLevel {
  if (opts.isAdmin) return 'administrator';
  if (opts.isModerator) return 'moderator';
  return 'member';
}

const RANK_ORDER: Record<'member' | 'moderator' | 'administrator', number> = {
  member: 0,
  moderator: 1,
  administrator: 2,
};

export function meetsMinRank(
  user: UserForumRankLevel,
  min: ForumBoardMinRank | null | undefined
): boolean {
  const m = min ?? 'member';
  if (m === 'none') return false; // locked: nobody can reply/start (unless you ignore server-side gating)
  return RANK_ORDER[user] >= RANK_ORDER[m];
}

export function effectiveMinStartThread(board: {
  admin_only_post: boolean;
  min_rank_start_thread?: ForumBoardMinRank | null;
}): ForumBoardMinRank {
  if (board.min_rank_start_thread) return board.min_rank_start_thread;
  return board.admin_only_post ? 'administrator' : 'member';
}

export function effectiveMinReply(board: {
  min_rank_reply?: ForumBoardMinRank | null;
}): ForumBoardMinRank {
  return board.min_rank_reply ?? 'member';
}
