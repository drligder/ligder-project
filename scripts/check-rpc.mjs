/**
 * Load root .env and verify SOLANA_RPC_URL + LITE_TOKEN_MINT.
 * Run: npm run check-rpc   or   node scripts/check-rpc.mjs
 *
 * LITE_TOKEN_MINT must be the SPL mint address (base58), not a balance.
 */
import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';

function redactRpc(url) {
  if (!url) return '(empty)';
  return String(url).replace(/api_key=[^&]+/gi, 'api_key=***');
}

const rpc = process.env.SOLANA_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com';
const mint = process.env.LITE_TOKEN_MINT?.trim() || '';

console.log('SOLANA_RPC_URL:', redactRpc(rpc));
console.log('LITE_TOKEN_MINT:', mint ? `${mint.slice(0, 4)}…${mint.slice(-4)} (${mint.length} chars)` : '(empty — sync returns 0)');

async function main() {
  const connection = new Connection(rpc, 'confirmed');
  try {
    const bh = await connection.getLatestBlockhash('finalized');
    const label =
      bh.context?.slot != null
        ? `slot ${bh.context.slot}`
        : `lastValidBlockHeight ${bh.lastValidBlockHeight}`;
    console.log('RPC ping: OK —', label);
  } catch (e) {
    console.error('RPC ping: FAILED —', e?.message || e);
    process.exitCode = 1;
    return;
  }

  if (!mint) {
    console.log('Mint: skipped (empty).');
    return;
  }

  let mintPk;
  try {
    mintPk = new PublicKey(mint);
    console.log('Mint public key: OK —', mintPk.toBase58());
  } catch (e) {
    console.error('Mint public key: INVALID —', e?.message || e);
    console.error('Use the token mint address from Solscan (base58), not a balance number.');
    process.exitCode = 1;
    return;
  }

  const testWallet = process.env.TEST_WALLET?.trim();
  if (testWallet) {
    try {
      const owner = new PublicKey(testWallet);
      const { value } = await connection.getParsedTokenAccountsByOwner(
        owner,
        { mint: mintPk },
        'confirmed'
      );
      console.log(
        'Accounts for this mint + wallet:',
        value.length,
        value.length ? '(first balance will be used)' : '(no token account — 0 balance is normal)'
      );
    } catch (e) {
      console.error('getParsedTokenAccountsByOwner:', e?.message || e);
      process.exitCode = 1;
    }
  }
}

main();
