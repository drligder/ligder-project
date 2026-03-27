import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useWallet } from '../contexts/WalletContext';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import { LIGDER_PROFILE_UPDATED_EVENT } from './useLigderProfile';

/**
 * Loads server profile (admin / moderator flags) and disconnects + clears registration if banned.
 */
export function useForumAccount() {
  const { publicKey, disconnect } = useWallet();
  const { showToast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setIsAdmin(false);
      setIsModerator(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(
        apiUrl(`/api/profile?wallet=${encodeURIComponent(publicKey)}`)
      );
      const j = await parseApiJson<{
        is_admin?: boolean;
        is_moderator?: boolean;
        banned?: boolean;
        banned_until?: string;
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
        return;
      }
      if (r.status === 404) {
        setIsAdmin(false);
        setIsModerator(false);
        return;
      }
      if (!r.ok) {
        setIsAdmin(false);
        setIsModerator(false);
        return;
      }
      setIsAdmin(j.is_admin === true);
      setIsModerator(j.is_moderator === true && j.is_admin !== true);
    } catch {
      setIsAdmin(false);
      setIsModerator(false);
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

  return { isAdmin, isModerator, loading, refresh };
}
