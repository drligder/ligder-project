/** Mainnet account page on Solscan */
export function solscanAccountUrl(wallet: string): string {
  return `https://solscan.io/account/${encodeURIComponent(wallet.trim())}`;
}

/** Mainnet transaction page on Solscan */
export function solscanTxUrl(
  signature: string,
  cluster: 'mainnet' | 'devnet' = 'mainnet'
): string {
  const base = `https://solscan.io/tx/${encodeURIComponent(signature.trim())}`;
  if (cluster === 'devnet') return `${base}?cluster=devnet`;
  return base;
}

/** Short form: `xxxx…xxxx` for display */
export function truncateWalletDisplay(
  wallet: string,
  headChars = 4,
  tailChars = 4
): string {
  const w = wallet.trim();
  if (w.length <= headChars + tailChars + 1) return w;
  return `${w.slice(0, headChars)}…${w.slice(-tailChars)}`;
}
