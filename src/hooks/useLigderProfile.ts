import { useEffect, useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';

export const LIGDER_PROFILE_UPDATED_EVENT = 'ligder-profile-updated';

function getStoredUsername(wallet: string | null): string | null {
  if (!wallet || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('ligder_forum_profile');
    if (!raw) return null;
    const p = JSON.parse(raw) as { wallet?: string; username?: string };
    if (p.wallet === wallet && typeof p.username === 'string' && p.username.length > 0) {
      return p.username;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** localStorage profile from registration; username only when it matches the connected wallet */
export function useLigderProfile() {
  const { publicKey } = useWallet();
  const [cacheKey, setCacheKey] = useState(0);
  const initialUsername = getStoredUsername(publicKey);
  const [username, setUsername] = useState<string | null>(() => initialUsername);
  const [profileLoading, setProfileLoading] = useState(
    () => !!publicKey && !initialUsername
  );

  useEffect(() => {
    const stored = getStoredUsername(publicKey);
    setUsername(stored);

    // If we don't have a cached username for this wallet, recover it from the server.
    // This prevents "registered" UI from breaking when the browser origin/port changes.
    if (!publicKey) {
      setProfileLoading(false);
      return;
    }
    if (stored) {
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    void (async () => {
      try {
        const r = await fetch(apiUrl(`/api/profile?wallet=${encodeURIComponent(publicKey)}`));
        if (!r.ok) return;
        const j = await parseApiJson<{ username?: string }>(r);
        const u = typeof j.username === 'string' ? j.username : null;
        if (!u || cancelled) return;
        setUsername(u);
        try {
          localStorage.setItem(
            'ligder_forum_profile',
            JSON.stringify({
              wallet: publicKey,
              username: u,
              registeredAt: new Date().toISOString(),
            })
          );
        } catch {
          /* ignore */
        }
      } catch {
        // If the API is temporarily offline, keep UI in "not loaded yet" mode until next bump.
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicKey, cacheKey]);

  useEffect(() => {
    const bump = () => setCacheKey((k) => k + 1);
    window.addEventListener('focus', bump);
    window.addEventListener(LIGDER_PROFILE_UPDATED_EVENT, bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener(LIGDER_PROFILE_UPDATED_EVENT, bump);
    };
  }, []);

  return {
    username,
    /** Connected wallet has a matching saved profile (registered) */
    isRegistered: !!username,
    profileLoading,
  };
}
