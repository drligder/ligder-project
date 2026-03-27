/* eslint-disable react-refresh/only-export-components -- provider + useWallet hook */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type WalletContextValue = {
  publicKey: string | null;
  connecting: boolean;
  error: string | null;
  clearError: () => void;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function getPhantom() {
  const s = window.solana;
  return s?.isPhantom ? s : null;
}

function publicKeyToBase58(pk: unknown): string | null {
  if (pk && typeof pk === 'object' && 'toBase58' in pk) {
    const t = (pk as { toBase58?: () => string }).toBase58;
    if (typeof t === 'function') {
      try {
        const s = t.call(pk);
        return typeof s === 'string' && s.length > 0 ? s : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Keep React state in sync with Phantom after refresh / tab switch / account change */
  useEffect(() => {
    const provider = getPhantom();
    if (!provider) return;

    const readConnectedPk = (): string | null => {
      const pk = publicKeyToBase58(provider.publicKey);
      if (!pk) return null;
      if (provider.isConnected === false) return null;
      return pk;
    };

    const syncFromExtension = () => {
      setPublicKey(readConnectedPk());
    };

    const initialPk = readConnectedPk();
    if (initialPk) {
      setPublicKey(initialPk);
    } else {
      void (async () => {
        try {
          const resp = await provider.connect({ onlyIfTrusted: true });
          const pk =
            publicKeyToBase58(resp.publicKey) ??
            (typeof resp.publicKey === 'object' && resp.publicKey != null
              ? String(resp.publicKey)
              : null);
          if (pk) setPublicKey(pk);
        } catch {
          /* not linked yet or user rejected a prior session */
        }
      })();
    }

    const onConnect = () => syncFromExtension();
    const onDisconnect = () => setPublicKey(null);
    const onAccountChanged = (next?: unknown) => {
      if (next == null) {
        setPublicKey(null);
        return;
      }
      const pk = publicKeyToBase58(next);
      if (pk) setPublicKey(pk);
    };

    provider.on?.('connect', onConnect);
    provider.on?.('disconnect', onDisconnect);
    provider.on?.('accountChanged', onAccountChanged);

    return () => {
      provider.removeListener?.('connect', onConnect);
      provider.removeListener?.('disconnect', onDisconnect);
      provider.removeListener?.('accountChanged', onAccountChanged);
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const connect = useCallback(async (): Promise<boolean> => {
    setError(null);
    const provider = getPhantom();
    if (!provider) {
      setError('Phantom not found. Install from https://phantom.app/');
      return false;
    }
    setConnecting(true);
    try {
      const resp = await provider.connect();
      const pk = resp.publicKey.toBase58?.() ?? String(resp.publicKey);
      setPublicKey(pk);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect');
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    const provider = getPhantom();
    try {
      if (provider?.disconnect) await provider.disconnect();
    } catch {
      /* ignore */
    }
    setPublicKey(null);
  }, []);

  const signMessage = useCallback(async (message: Uint8Array) => {
    const provider = getPhantom();
    if (!provider?.signMessage) {
      throw new Error('Wallet cannot sign messages');
    }
    const { signature } = await provider.signMessage(message);
    return signature;
  }, []);

  const value = useMemo(
    () => ({
      publicKey,
      connecting,
      error,
      clearError,
      connect,
      disconnect,
      signMessage,
    }),
    [publicKey, connecting, error, clearError, connect, disconnect, signMessage]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return ctx;
}
