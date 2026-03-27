/* eslint-disable react-refresh/only-export-components -- provider + useWallet hook */
import {
  createContext,
  useCallback,
  useContext,
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

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
