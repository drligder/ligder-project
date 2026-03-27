import { useForumAccount } from './useForumAccount';

/**
 * Whether the connected registered wallet has is_admin (ACP, admin-only boards, mod tools).
 */
export function useProfileAdmin() {
  const { isAdmin, loading } = useForumAccount();
  return { isAdmin, loading };
}
