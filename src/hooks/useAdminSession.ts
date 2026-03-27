import { useCallback, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { adminSessionMessage } from '../lib/adminMessages';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import { uint8ToBase64 } from '../lib/uint8Base64';

const STORAGE_KEY = 'ligder_admin_session_token';

export function useAdminSession() {
  const { publicKey, signMessage } = useWallet();

  useEffect(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [publicKey]);

  const establishSession = useCallback(async () => {
    if (!publicKey || !signMessage) {
      throw new Error('Connect your wallet');
    }
    const nr = await fetch(apiUrl('/api/admin/session-nonce'));
    const jn = await parseApiJson<{ nonce?: string; error?: string }>(nr);
    if (!nr.ok || !jn.nonce) {
      throw new Error(jn.error || 'Could not start admin session');
    }
    const message = adminSessionMessage(publicKey, jn.nonce);
    const sig = await signMessage(new TextEncoder().encode(message));
    const r = await fetch(apiUrl('/api/admin/session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: publicKey,
        message,
        signature: uint8ToBase64(sig),
      }),
    });
    const j = await parseApiJson<{ token?: string; error?: string }>(r);
    if (!r.ok || !j.token) {
      throw new Error(j.error || 'Admin session failed');
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, j.token);
    } catch {
      throw new Error('Could not store session');
    }
  }, [publicKey, signMessage]);

  const adminFetch = useCallback(
    async (input: string, init?: RequestInit) => {
      let token: string | null = null;
      try {
        token = sessionStorage.getItem(STORAGE_KEY);
      } catch {
        token = null;
      }
      if (!token) {
        await establishSession();
        try {
          token = sessionStorage.getItem(STORAGE_KEY);
        } catch {
          token = null;
        }
      }
      if (!token) {
        throw new Error('Admin session unavailable');
      }

      const run = (t: string) => {
        const h = new Headers(init?.headers);
        h.set('Authorization', `Bearer ${t}`);
        return fetch(input, { ...init, headers: h });
      };

      let res = await run(token);
      if (res.status === 401) {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        await establishSession();
        let t2: string | null = null;
        try {
          t2 = sessionStorage.getItem(STORAGE_KEY);
        } catch {
          t2 = null;
        }
        if (!t2) {
          throw new Error('Admin session expired.');
        }
        res = await run(t2);
      }
      return res;
    },
    [establishSession]
  );

  return { establishSession, adminFetch };
}
