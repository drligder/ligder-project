/** Row from `forum_boards` (GET /api/forum/boards) */
/** Minimum rank for board actions (migration 009) */
export type ForumBoardMinRank = 'member' | 'moderator' | 'administrator' | 'none';

export type ForumBoardRow = {
  id: string;
  section: string;
  title: string;
  description: string | null;
  sort_order: number;
  admin_only_post: boolean;
  /** New in 009; if absent, derive from admin_only_post */
  min_rank_start_thread?: ForumBoardMinRank | null;
  min_rank_reply?: ForumBoardMinRank | null;
  icon_key: string;
  created_at?: string;
  /** From API enrichment */
  topics_count?: number;
  posts_count?: number;
  last_post?: string;
  last_thread_id?: string | null;
};

export type ForumThreadListRow = {
  id: string;
  board_id: string;
  /** Per-board sequence for URLs: /ligder-official/{board}/{thread_number} */
  thread_number?: number | string | null;
  title: string;
  author_wallet: string;
  author_username: string | null;
  created_at: string;
  updated_at: string;
  posts_count: number;
  /** Optional Solana tx signature if server recorded creation on-chain */
  onchain_tx_sig?: string | null;
  /** Optional status: 'pending' | 'failed' | 'confirmed' */
  onchain_status?: string | null;
};
