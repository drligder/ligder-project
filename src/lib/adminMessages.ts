import type { ForumBoardMinRank } from '../types/forumBoards';

/** One-time sign to obtain a session token (Bearer) for admin API routes. */
export function adminSessionMessage(wallet: string, nonce: string): string {
  return ['Ligder admin session', `Wallet: ${wallet}`, `Nonce: ${nonce}`].join('\n');
}

export function adminBoardUpdateMessage(
  wallet: string,
  boardId: string,
  min_rank_start_thread: ForumBoardMinRank,
  min_rank_reply: ForumBoardMinRank,
  nonce: string
): string {
  return [
    'Ligder admin board update',
    `Wallet: ${wallet}`,
    `Board: ${boardId}`,
    `min_rank_start_thread: ${min_rank_start_thread}`,
    `min_rank_reply: ${min_rank_reply}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

export function adminUserSearchMessage(
  wallet: string,
  query: string,
  nonce: string
): string {
  return [
    'Ligder admin user search',
    `Wallet: ${wallet}`,
    `Query: ${query.trim().toLowerCase()}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

export function adminUserPatchMessage(
  adminWallet: string,
  targetWallet: string,
  opts: {
    username: string | null;
    is_moderator: boolean;
    is_admin: boolean;
  },
  nonce: string
): string {
  return [
    'Ligder admin user patch',
    `Wallet: ${adminWallet}`,
    `Target wallet: ${targetWallet}`,
    `username: ${opts.username ?? '-'}`,
    `is_moderator: ${opts.is_moderator}`,
    `is_admin: ${opts.is_admin}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

export function adminBanMessage(
  adminWallet: string,
  targetWallet: string,
  days: number,
  nonce: string
): string {
  return [
    'Ligder admin ban user',
    `Wallet: ${adminWallet}`,
    `Target wallet: ${targetWallet}`,
    `Days: ${days}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

export function adminDeletePostMessage(
  adminWallet: string,
  postId: string,
  nonce: string
): string {
  return [
    'Ligder admin delete post',
    `Wallet: ${adminWallet}`,
    `Post id: ${postId}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}
