export {};

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: { toBase58: () => string } }>;
      disconnect?: () => Promise<void>;
      signMessage: (
        message: Uint8Array,
        display?: string
      ) => Promise<{ signature: Uint8Array }>;
    };
  }
}
