import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useToast } from './ToastContext';
import { useWallet } from './WalletContext';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import { LIGDER_PROFILE_UPDATED_EVENT } from '../hooks/useLigderProfile';

type ForumAccountValue = {
  isAdmin: boolean;
  isModerator: boolean;
  /** HTTPS avatar from profile; null if none or not loaded */
  avatarUrl: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ForumAccountContext = createContext<ForumAccountValue | null>(null);

function normalizeAvatarUrl(raw: unknown): string | null {
  return typeof raw === 'string' && raw.startsWith('https://') ? raw : null;
}

export function ForumAccountProvider({ children }: { children: ReactNode }) {
  const { publicKey, disconnect } = useWallet();
  const { showToast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setIsAdmin(false);
      setIsModerator(false);
      setAvatarUrl(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/profile?wallet=${encodeURIComponent(publicKey)}`));
      const j = await parseApiJson<{
        is_admin?: boolean;
        is_moderator?: boolean;
        banned?: boolean;
        banned_until?: string;
        avatar_url?: string | null;
        error?: string;
      }>(r);
      if (r.status === 403 && j.banned) {
        try {
          localStorage.removeItem('ligder_forum_profile');
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new Event(LIGDER_PROFILE_UPDATED_EVENT));
        showToast(
          `This account is banned until ${j.banned_until ? new Date(j.banned_until).toLocaleString() : 'further notice'}.`,
          'error'
        );
        await disconnect();
        setIsAdmin(false);
        setIsModerator(false);
        setAvatarUrl(null);
        return;
      }
      if (r.status === 404) {
        setIsAdmin(false);
        setIsModerator(false);
        setAvatarUrl(null);
        return;
      }
      if (!r.ok) {
        setIsAdmin(false);
        setIsModerator(false);
        setAvatarUrl(null);
        return;
      }
      setIsAdmin(j.is_admin === true);
      setIsModerator(j.is_moderator === true && j.is_admin !== true);
      setAvatarUrl(normalizeAvatarUrl(j.avatar_url));
    } catch {
      setIsAdmin(false);
      setIsModerator(false);
      setAvatarUrl(null);
    } finally {
      setLoading(false);
    }
  }, [publicKey, disconnect, showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUp = () => void refresh();
    window.addEventListener(LIGDER_PROFILE_UPDATED_EVENT, onUp);
    return () => window.removeEventListener(LIGDER_PROFILE_UPDATED_EVENT, onUp);
  }, [refresh]);

  const value = useMemo(
    () => ({
      isAdmin,
      isModerator,
      avatarUrl,
      loading,
      refresh,
    }),
    [isAdmin, isModerator, avatarUrl, loading, refresh]
  );

  return <ForumAccountContext.Provider value={value}>{children}</ForumAccountContext.Provider>;
}

export function useForumAccount(): ForumAccountValue {
  const ctx = useContext(ForumAccountContext);
  if (!ctx) {
    throw new Error('useForumAccount must be used within ForumAccountProvider');
  }
  return ctx;
}
