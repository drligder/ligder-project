/**
 * Shapes for forum threads and posts. Use these when wiring Supabase/API data later.
 */

import type { ForumBoardRow } from './forumBoards';

export type ForumMemberRank = 'Member' | 'Moderator' | 'Administrator';

/** Poll option + vote count from GET thread */
export type ForumThreadPollOption = {
  id: string;
  label: string;
  sort_order: number;
  votes: number;
};

/** Poll attached to a post (server `poll` field) */
export type ForumThreadPoll = {
  id: string;
  question: string;
  allow_multiple: boolean;
  created_at: string;
  options: ForumThreadPollOption[];
  my_option_ids: string[] | null;
  viewer_can_vote: boolean;
};

/** Row from GET thread / merged reply API (snake_case from server) */
export type ThreadDetailPost = {
  id: string;
  parent_id: string | null;
  body: string;
  author_wallet: string;
  author_username: string | null;
  author_is_admin: boolean;
  author_is_moderator?: boolean;
  author_avatar_url: string | null;
  author_lite_holdings_ui: string | number | null;
  author_x_handle?: string | null;
  author_github_handle?: string | null;
  created_at: string;
  /** Optional Solana tx signature if server recorded this post on-chain */
  onchain_tx_sig?: string | null;
  /** Optional status: 'pending' | 'failed' | 'confirmed' */
  onchain_status?: string | null;
  poll?: ForumThreadPoll | null;
  /** Server: current wallet may add a poll to this post (author + holder rules) */
  poll_create_eligible?: boolean;
};

/** Passed via React Router state after creating a thread to avoid a loading flash */
export type ForumThreadSeed = {
  board: ForumBoardRow | null;
  threadMeta: {
    id: string;
    thread_number: number;
    title: string;
    author_username: string | null;
    created_at: string;
    onchain_tx_sig?: string | null;
  };
  posts: ThreadDetailPost[];
};

/** Sidebar stats from GET /api/reputation/by-usernames (per author) */
export type AuthorForumSidebarStats = {
  reputation: number | null;
  likesOnPosts: number | null;
  dislikesOnPosts: number | null;
};

export type ForumThreadPost = {
  /** Stable id from DB or chain attestation */
  id: string;
  username: string;
  /** Pre-formatted for display (server or client) */
  postedAt: string;
  body: string;
  avatarUrl: string | null;
  rank: ForumMemberRank;
  /** Registered Solana address (base58); sidebar + Solscan link */
  authorWallet?: string | null;
  /** Raw UI amount; formatted with formatLiteHoldings. Omit or null → "—" */
  liteHoldingsUi?: string | number | null;
  /** Optional Solana tx signature if server recorded this post on-chain */
  onchainTxSig?: string | null;
  /** Optional status: 'pending' | 'failed' | 'confirmed' */
  onchainStatus?: string | null;
  /** Parent quote when replying to a specific post; omitted for generic replies under the opening post */
  replyTo?: {
    parentPostId: string;
    authorLabel: string;
    excerpt: string;
  };

  /** Saved social handles for forum sidebar ("Socials" row). */
  socials?: {
    x?: string | null;
    github?: string | null;
  };

  poll?: ForumThreadPoll | null;
  pollCreateEligible?: boolean;
};

export type ForumThreadMeta = {
  id: string;
  title: string;
  /** OP username (shown in thread header byline) */
  authorUsername: string;
  /** Thread start date, display string */
  startedAt: string;
  posts: ForumThreadPost[];
};
