export {};

/** Phantom injects this; we only type what Ligder uses */
type PhantomPublicKey = { toBase58: () => string };

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      isConnected?: boolean;
      publicKey?: PhantomPublicKey | null;
      connect: (opts?: {
        onlyIfTrusted?: boolean;
      }) => Promise<{ publicKey: PhantomPublicKey }>;
      disconnect?: () => Promise<void>;
      signMessage: (
        message: Uint8Array,
        display?: string
      ) => Promise<{ signature: Uint8Array }>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}
