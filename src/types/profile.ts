/** Row shape from GET /api/profile (Supabase profiles) */
export type ProfileRow = {
  wallet: string;
  username: string;
  /** Forum moderation; set in DB (006_profiles_admin.sql). */
  is_admin?: boolean;
  created_at: string;
  avatar_url: string | null;
  posts_count: number;
  threads_started: number;
  likes_received: number;
  likes_given: number;
  lite_holdings_ui: string | number | null;
  lite_holdings_updated_at: string | null;
  /** Computed on GET /api/profile (LITE tier + posts + threads + vote balance on your posts). */
  reputation?: number | null;
  reputation_breakdown?: {
    lite_tier: number;
    posts_points: number;
    threads_points: number;
    vote_points: number;
    likes_on_posts: number;
    dislikes_on_posts: number;
  };

  /** Social handles (stored as handles without @). */
  github_handle?: string | null;
  x_handle?: string | null;
};
