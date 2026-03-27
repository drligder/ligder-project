import 'dotenv/config';
import http from 'http';
import crypto from 'crypto';
import cors from 'cors';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const RESERVED = new Set([
  'admin',
  'moderator',
  'ligder',
  'lite',
  'support',
  'system',
  'root',
  'null',
]);

/** When DEV_VITE=1, API + Vite share one port (default 2000). Otherwise API-only (PORT from host, else SERVER_PORT, default 8787). */
const DEV_VITE = process.env.DEV_VITE === '1';
const LISTEN_PORT = DEV_VITE
  ? Number(process.env.PORT || 2000)
  : Number(process.env.PORT || process.env.SERVER_PORT || 8787);
/** API-only: bind 0.0.0.0 so Railway/Render/etc. can route; override with LISTEN_HOST=127.0.0.1 for localhost-only. */
const LISTEN_HOST =
  DEV_VITE ? '127.0.0.1' : (process.env.LISTEN_HOST?.trim() || '0.0.0.0');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LITE_TOKEN_MINT = process.env.LITE_TOKEN_MINT?.trim() || '';
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com';
const SOLANA_MEMO_RPC_URL = process.env.SOLANA_MEMO_RPC_URL?.trim() || SOLANA_RPC_URL;
const SOLANA_MEMO_FEE_PAYER_SECRET_KEY_RAW =
  process.env.SOLANA_MEMO_FEE_PAYER_SECRET_KEY?.trim() || '';
const TREASURY_WALLET_SECRET_KEY_RAW =
  process.env.TREASURY_WALLET_SECRET_KEY?.trim() || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in environment variables (e.g. Railway Variables) or in .env for local dev — server-side only.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex');
}

function parseFeePayerKeypairFromEnv() {
  const raw = SOLANA_MEMO_FEE_PAYER_SECRET_KEY_RAW;
  if (!raw) return null;
  try {
    // A) JSON array (Solana CLI `id.json` / Phantom export as bytes): [12,34,...]
    if (raw.startsWith('[')) {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      const sk = Uint8Array.from(arr);
      if (sk.length !== 64) return null;
      return Keypair.fromSecretKey(sk);
    }
    // B) Base58-encoded 64-byte secret key (common single-string export)
    const decoded = bs58.decode(raw);
    if (decoded.length === 64) {
      return Keypair.fromSecretKey(decoded);
    }
    // C) Hex 64-byte secret (128 hex chars)
    if (/^[0-9a-fA-F]{128}$/.test(raw)) {
      const sk = Uint8Array.from(Buffer.from(raw, 'hex'));
      if (sk.length === 64) return Keypair.fromSecretKey(sk);
    }
    return null;
  } catch {
    return null;
  }
}

function parseKeypairFromRawSecretKey(raw) {
  if (!raw) return null;
  try {
    if (raw.startsWith('[')) {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      const sk = Uint8Array.from(arr);
      if (sk.length !== 64) return null;
      return Keypair.fromSecretKey(sk);
    }
    const decoded = bs58.decode(raw);
    if (decoded.length === 64) {
      return Keypair.fromSecretKey(decoded);
    }
    if (/^[0-9a-fA-F]{128}$/.test(raw)) {
      const sk = Uint8Array.from(Buffer.from(raw, 'hex'));
      if (sk.length === 64) return Keypair.fromSecretKey(sk);
    }
    return null;
  } catch {
    return null;
  }
}

const memoFeePayer = parseFeePayerKeypairFromEnv();
const memoConnection = new Connection(SOLANA_MEMO_RPC_URL, 'confirmed');
const dividendsConnection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Dividends treasury: used to pay claims (SPL token transfer).
const dividendsTreasuryKeypair = parseKeypairFromRawSecretKey(
  TREASURY_WALLET_SECRET_KEY_RAW
);
if (!dividendsTreasuryKeypair) {
  console.warn(
    '[dividends] TREASURY_WALLET_SECRET_KEY missing or invalid — claim payouts disabled'
  );
}

const LITE_TOKEN_DECIMALS = 6;
const DIVIDENDS_PERIOD_SECONDS = 6 * 60 * 60; // 6h

function dividendsPeriodIdForNowMs(nowMs) {
  const unixSec = Math.floor(nowMs / 1000);
  const start = Math.floor(unixSec / DIVIDENDS_PERIOD_SECONDS) * DIVIDENDS_PERIOD_SECONDS;
  return BigInt(start);
}

function dividendsPeriodStartEndFromId(periodIdBigint) {
  const start = BigInt(periodIdBigint);
  const end = start + BigInt(DIVIDENDS_PERIOD_SECONDS);
  return { start, end };
}

function rawToLiteTokenFloatDisplay(rawBigInt) {
  // Only used for UI display text; keep precision reasonable.
  const raw = BigInt(rawBigInt);
  const denom = 10n ** BigInt(LITE_TOKEN_DECIMALS);
  const whole = raw / denom;
  const frac = raw % denom;
  const fracStr = frac.toString().padStart(LITE_TOKEN_DECIMALS, '0');
  // Trim trailing zeros.
  const fracTrimmed = fracStr.replace(/0+$/g, '');
  return fracTrimmed.length ? `${whole.toString()}.${fracTrimmed}` : whole.toString();
}

function parseTokenAmountRawFromParsedTokenBalance(tb) {
  if (!tb || typeof tb !== 'object') return null;
  // In parsed token balances, amount is usually under uiTokenAmount.amount.
  const raw =
    tb.amount ?? tb.tokenAmount?.amount ?? tb.uiTokenAmount?.amount ?? tb.uiTokenAmount?.amountString;
  if (raw == null) return null;
  try {
    return BigInt(String(raw));
  } catch {
    return null;
  }
}

async function parseLiteDepositFromTxSig(txSig) {
  if (!dividendsTreasuryKeypair) {
    throw new Error('Treasury keypair missing (TREASURY_WALLET_SECRET_KEY).');
  }
  const treasuryOwner = dividendsTreasuryKeypair.publicKey.toBase58();
  /** Optional: restrict LITE pool deposits to this sender (public base58). Legacy: DIVIDENDS_DEV_WALLET. */
  const allowedSender = (
    process.env.SPL_DIVIDEND_SENDER ?? process.env.DIVIDENDS_DEV_WALLET ?? ''
  ).trim();

  const tx = await dividendsConnection.getParsedTransaction(txSig, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });
  if (!tx || !tx.meta) return null;

  const pre = tx.meta.preTokenBalances ?? [];
  const post = tx.meta.postTokenBalances ?? [];

  const mint = LITE_TOKEN_MINT;
  if (!mint) return null;

  /** @type {Map<string, bigint>} */
  const preByOwner = new Map();
  /** @type {Map<string, bigint>} */
  const postByOwner = new Map();

  const addToMap = (map, owner, amountRaw) => {
    if (!owner) return;
    const prev = map.get(owner) ?? 0n;
    map.set(owner, prev + amountRaw);
  };

  for (const tb of pre) {
    if (tb?.mint !== mint) continue;
    const owner = tb?.owner;
    const amt = parseTokenAmountRawFromParsedTokenBalance(tb);
    if (amt == null) continue;
    addToMap(preByOwner, owner, amt);
  }
  for (const tb of post) {
    if (tb?.mint !== mint) continue;
    const owner = tb?.owner;
    const amt = parseTokenAmountRawFromParsedTokenBalance(tb);
    if (amt == null) continue;
    addToMap(postByOwner, owner, amt);
  }

  const owners = new Set([...preByOwner.keys(), ...postByOwner.keys()]);
  /** @type {Array<{ owner: string; delta: bigint }>} */
  const changed = [];

  for (const owner of owners) {
    const preAmt = preByOwner.get(owner) ?? 0n;
    const postAmt = postByOwner.get(owner) ?? 0n;
    const delta = postAmt - preAmt;
    if (delta !== 0n) changed.push({ owner, delta });
  }

  if (changed.length === 0) return null;

  const treasuryChange = changed.find((c) => c.owner === treasuryOwner)?.delta ?? 0n;
  if (treasuryChange <= 0n) return null;

  const devCandidates = changed.filter((c) => c.owner !== treasuryOwner);
  if (devCandidates.length !== 1) {
    // If we can't confidently identify the sender, we reject rather than mis-account.
    return null;
  }

  const devWallet = devCandidates[0].owner;
  const devDelta = devCandidates[0].delta;
  if (devDelta >= 0n) return null;

  if (allowedSender && devWallet !== allowedSender) return null;

  const amountRaw = treasuryChange;
  // In a clean transfer, treasury increase equals sender decrease (in raw units).
  if (amountRaw !== -devDelta) return null;

  return { devWallet, amount_raw: amountRaw };
}

async function finalizeDividendsPeriodsOnce(maxPeriods = 2) {
  if (!dividendsTreasuryKeypair || !LITE_TOKEN_MINT) return;

  const nowSec = Math.floor(Date.now() / 1000);

  // Pick up all periods that have ended but are not finalized yet.
  const { data: due, error: dueErr } = await supabase
    .from('dividend_periods')
    .select('period_id, period_end_unix')
    .eq('status', 'open')
    .lte('period_end_unix', nowSec)
    .order('period_end_unix', { ascending: true })
    .limit(maxPeriods);

  if (dueErr) {
    console.error('[dividends] finalize due query failed:', dueErr);
    return;
  }

  for (const p of due ?? []) {
    const periodId = BigInt(p.period_id);
    const periodEndUnix = BigInt(p.period_end_unix);

    // Move to "finalizing" to avoid double work.
    const { data: started } = await supabase
      .from('dividend_periods')
      .update({ status: 'finalizing', updated_at: new Date().toISOString() })
      .eq('period_id', periodId.toString())
      .eq('status', 'open')
      .select('period_id')
      .maybeSingle();

    if (!started) continue;

    try {
      const { data: depRows, error: depErr } = await supabase
        .from('dividend_deposits')
        .select('amount_raw')
        .eq('deposit_period_id', periodId.toString());

      if (depErr) throw depErr;

      let depositTotal = 0n;
      for (const r of depRows ?? []) {
        const v = r?.amount_raw;
        if (v == null) continue;
        depositTotal += BigInt(String(v));
      }

      const claimablePot = (depositTotal * 75n) / 100n; // floor
      const managementReserve = depositTotal - claimablePot;

      // Snapshot all registered profiles (no claims for unregistered wallets).
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('wallet');
      if (profErr) throw profErr;

      const wallets = (profiles ?? []).map((x) => String(x.wallet)).filter(Boolean);
      if (wallets.length === 0) {
        await supabase
          .from('dividend_periods')
          .update({
            status: 'finalized',
            deposit_total_raw: depositTotal.toString(),
            claimable_pot_raw: claimablePot.toString(),
            management_reserve_raw: managementReserve.toString(),
            snapshot_taken_at: new Date().toISOString(),
            snapshot_total_balance_raw: '0',
            finalized_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('period_id', periodId.toString());
        continue;
      }

      // Concurrency-limited RPC reads for snapshot balances.
      const concurrency = 8;
      /** @type {Array<{ wallet: string; balanceRaw: bigint }>} */
      const balances = [];
      let idx = 0;

      async function worker() {
        while (idx < wallets.length) {
          const myIndex = idx;
          idx++;
          const w = wallets[myIndex];
          try {
            const bal = await fetchLiteHoldingsRaw(w);
            balances.push({ wallet: w, balanceRaw: bal });
          } catch (e) {
            console.error('[dividends] balance fetch failed for', w, e);
            balances.push({ wallet: w, balanceRaw: 0n });
          }
        }
      }

      await Promise.all(
        Array.from({ length: concurrency }).map(() => worker())
      );

      // Only wallets with >0 balance get entitlements (keeps archive readable).
      const positive = balances.filter((b) => b.balanceRaw > 0n);
      const totalBalance = positive.reduce((acc, b) => acc + b.balanceRaw, 0n);

      if (totalBalance <= 0n || claimablePot <= 0n) {
        await supabase
          .from('dividend_wallet_entitlements')
          .delete()
          .eq('period_id', periodId.toString());

        await supabase
          .from('dividend_periods')
          .update({
            status: 'finalized',
            deposit_total_raw: depositTotal.toString(),
            claimable_pot_raw: claimablePot.toString(),
            management_reserve_raw: managementReserve.toString(),
            snapshot_taken_at: new Date().toISOString(),
            snapshot_total_balance_raw: totalBalance.toString(),
            finalized_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('period_id', periodId.toString());
        continue;
      }

      // Compute entitlements with deterministic remainder distribution.
      const allocations = positive.map((b) => {
        const numerator = claimablePot * b.balanceRaw;
        const base = numerator / totalBalance;
        const remainderFraction = numerator % totalBalance;
        return {
          wallet: b.wallet,
          balanceSnapshotRaw: b.balanceRaw,
          baseEntitlementRaw: base,
          remainderFraction,
          shareBps: (b.balanceRaw * 10000n) / totalBalance,
        };
      });

      let sumBase = 0n;
      for (const a of allocations) sumBase += a.baseEntitlementRaw;

      allocations.sort((a, b) =>
        a.remainderFraction > b.remainderFraction ? -1 : a.remainderFraction < b.remainderFraction ? 1 : 0
      );

      let remainderUnits = claimablePot - sumBase; // raw base units remaining
      for (let i = 0; i < allocations.length; i++) {
        allocations[i].entitlementRaw = allocations[i].baseEntitlementRaw;
      }
      let i = 0;
      while (remainderUnits > 0n && i < allocations.length) {
        allocations[i].entitlementRaw += 1n;
        remainderUnits -= 1n;
        i++;
      }

      // Remove old entitlements if re-running.
      await supabase
        .from('dividend_wallet_entitlements')
        .delete()
        .eq('period_id', periodId.toString());

      // Insert allocations.
      const rowsToInsert = allocations.map((a) => ({
        period_id: periodId.toString(),
        wallet: a.wallet,
        balance_snapshot_raw: a.balanceSnapshotRaw.toString(),
        share_bps: a.shareBps.toString(),
        entitlement_raw: a.entitlementRaw.toString(),
      }));

      if (rowsToInsert.length) {
        const { error: insErr } = await supabase
          .from('dividend_wallet_entitlements')
          .insert(rowsToInsert);
        if (insErr) throw insErr;
      }

      await supabase
        .from('dividend_periods')
        .update({
          status: 'finalized',
          deposit_total_raw: depositTotal.toString(),
          claimable_pot_raw: claimablePot.toString(),
          management_reserve_raw: managementReserve.toString(),
          snapshot_taken_at: new Date().toISOString(),
          snapshot_total_balance_raw: totalBalance.toString(),
          finalized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('period_id', periodId.toString());
    } catch (e) {
      console.error('[dividends] finalize failed for period', periodId.toString(), e);
      // Best-effort: revert to open so another tick can retry.
      await supabase
        .from('dividend_periods')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('period_id', periodId.toString());
    }
  }
}

/** Solana Memo program: instruction data max 566 bytes (UTF-8). */
const SOLANA_MEMO_MAX_BYTES = 566;

if (!memoFeePayer) {
  console.warn(
    '[memo] SOLANA_MEMO_FEE_PAYER_SECRET_KEY missing or invalid — use Solana id.json JSON array [..], or base58 64-byte secret — on-chain attestations disabled'
  );
} else {
  console.log(`[memo] fee payer pubkey: ${memoFeePayer.publicKey.toBase58()}`);
}

/** Compact ASCII memo (fits Memo limit); DB still has hashes + ids. */
function compactThreadMemo({
  board_id,
  thread_number,
  thread_id,
  post_id,
  wallet,
  title_sha256,
  body_sha256,
  lite_holdings_ui,
}) {
  const z = lite_holdings_ui == null ? '' : String(lite_holdings_ui).slice(0, 32);
  return [
    'v1',
    'tc',
    String(board_id ?? ''),
    String(thread_number ?? ''),
    String(thread_id ?? ''),
    String(post_id ?? ''),
    String(wallet ?? ''),
    String(title_sha256 ?? ''),
    String(body_sha256 ?? ''),
    z,
  ].join('|');
}

function compactReplyMemo({
  board_id,
  thread_number,
  thread_id,
  post_id,
  parent_post_id,
  wallet,
  body_sha256,
  lite_holdings_ui,
}) {
  const z = lite_holdings_ui == null ? '' : String(lite_holdings_ui).slice(0, 32);
  return [
    'v1',
    'rp',
    String(board_id ?? ''),
    String(thread_number ?? ''),
    String(thread_id ?? ''),
    String(post_id ?? ''),
    String(parent_post_id ?? ''),
    String(wallet ?? ''),
    String(body_sha256 ?? ''),
    z,
  ].join('|');
}

function compactVoteMemo({
  board_id,
  thread_number,
  thread_id,
  post_id,
  wallet,
  action,
  lite_holdings_ui,
}) {
  const z = lite_holdings_ui == null ? '' : String(lite_holdings_ui).slice(0, 32);
  return [
    'v1',
    'pv',
    String(board_id ?? ''),
    String(thread_number ?? ''),
    String(thread_id ?? ''),
    String(post_id ?? ''),
    String(wallet ?? ''),
    String(action ?? ''),
    z,
  ].join('|');
}

function compactPmMemo({ pm_id, from_wallet, to_wallet, cipher_sha256 }) {
  return [
    'v1',
    'pm',
    String(pm_id ?? ''),
    String(from_wallet ?? ''),
    String(to_wallet ?? ''),
    String(cipher_sha256 ?? ''),
  ].join('|');
}

async function sendMemoAttestation(memoText) {
  if (!memoFeePayer) {
    return { ok: false, tx_sig: null, fee_payer: null, error: 'Missing fee payer key' };
  }
  const memo = String(memoText ?? '');
  const buf = Buffer.from(memo, 'utf8');
  if (buf.length < 1) {
    return { ok: false, tx_sig: null, fee_payer: memoFeePayer.publicKey.toBase58(), error: 'Empty memo' };
  }
  if (buf.length > SOLANA_MEMO_MAX_BYTES) {
    return {
      ok: false,
      tx_sig: null,
      fee_payer: memoFeePayer.publicKey.toBase58(),
      error: `Memo too long: ${buf.length} bytes (max ${SOLANA_MEMO_MAX_BYTES})`,
    };
  }

  try {
    const ix = new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: buf,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = memoFeePayer.publicKey;
    const { blockhash, lastValidBlockHeight } = await memoConnection.getLatestBlockhash(
      'confirmed'
    );
    tx.recentBlockhash = blockhash;
    tx.sign(memoFeePayer);
    const sig = await memoConnection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });
    await memoConnection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    return { ok: true, tx_sig: sig, fee_payer: memoFeePayer.publicKey.toBase58(), error: null };
  } catch (e) {
    let detail = e instanceof Error ? e.message : String(e);
    if (e && typeof e === 'object' && Array.isArray(e.logs) && e.logs.length) {
      detail += ` | sim: ${e.logs.slice(-5).join(' | ')}`;
    }
    console.error('[memo] send failed:', detail);
    return {
      ok: false,
      tx_sig: null,
      fee_payer: memoFeePayer.publicKey.toBase58(),
      error: detail,
    };
  }
}

async function queueOnchainAttestation(row) {
  // Insert a pending attestation row; send tx; then update status + tx_sig.
  // Best-effort: if the table isn't migrated yet, just skip quietly.
  const payload = {
    ...row,
    status: 'pending',
    attempts: 0,
    last_error: null,
    tx_sig: null,
    updated_at: new Date().toISOString(),
  };
  const { data: inserted, error: insErr } = await supabase
    .from('forum_onchain_attestations')
    .insert(payload)
    .select('id')
    .single();

  if (insErr) {
    const m = String(insErr.message ?? '');
    if (/does not exist|relation/i.test(m)) return { ok: false, reason: 'missing_table' };
    console.error(insErr);
    return { ok: false, reason: 'insert_failed' };
  }

  const id = inserted?.id;
  try {
    const sent = await sendMemoAttestation(row.memo);
    if (sent.ok && sent.tx_sig) {
      await supabase
        .from('forum_onchain_attestations')
        .update({
          status: 'confirmed',
          tx_sig: sent.tx_sig,
          fee_payer: sent.fee_payer,
          attempts: 1,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      return { ok: true, tx_sig: sent.tx_sig };
    }
    await supabase
      .from('forum_onchain_attestations')
      .update({
        status: 'failed',
        attempts: 1,
        last_error: sent.error ?? 'Send failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    return { ok: false, reason: 'send_failed' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from('forum_onchain_attestations')
      .update({
        status: 'failed',
        attempts: 1,
        last_error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    return { ok: false, reason: 'exception' };
  }
}

async function retryFailedOnchainAttestationsOnce(limit = 10) {
  try {
    const { data: rows, error } = await supabase
      .from('forum_onchain_attestations')
      .select('id, memo, attempts')
      .eq('status', 'failed')
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (error) {
      const m = String(error.message ?? '');
      if (/does not exist|relation/i.test(m)) return;
      console.error(error);
      return;
    }
    for (const r of rows ?? []) {
      const attempts = Number(r.attempts) || 0;
      // Simple cap to avoid infinite loops if RPC is down.
      if (attempts >= 10) continue;
      try {
        await supabase
          .from('forum_onchain_attestations')
          .update({
            status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.id);
        const sent = await sendMemoAttestation(String(r.memo ?? ''));
        if (sent.ok && sent.tx_sig) {
          await supabase
            .from('forum_onchain_attestations')
            .update({
              status: 'confirmed',
              tx_sig: sent.tx_sig,
              fee_payer: sent.fee_payer,
              attempts: attempts + 1,
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', r.id);
        } else {
          await supabase
            .from('forum_onchain_attestations')
            .update({
              status: 'failed',
              attempts: attempts + 1,
              last_error: sent.error ?? 'Send failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', r.id);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase
          .from('forum_onchain_attestations')
          .update({
            status: 'failed',
            attempts: attempts + 1,
            last_error: msg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.id);
      }
    }
  } catch (e) {
    console.error(e);
  }
}

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));

function uint8FromBase64(b64) {
  const buf = Buffer.from(b64, 'base64');
  return new Uint8Array(buf);
}

function isValidBase64Len(raw, exactLen) {
  if (typeof raw !== 'string' || raw.length < 1) return false;
  try {
    const b = Buffer.from(raw, 'base64');
    return b.length === exactLen;
  } catch {
    return false;
  }
}

function verifyWalletSignature(walletAddress, message, signatureBase64) {
  try {
    const pk = new PublicKey(walletAddress);
    const sig = uint8FromBase64(signatureBase64);
    if (sig.length !== 64) return false;
    const msgBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msgBytes, sig, pk.toBytes());
  } catch {
    return false;
  }
}

function messageLooksValid(message, wallet) {
  if (!message || typeof message !== 'string') return false;
  return (
    message.includes('Ligder forum registration') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Nonce:')
  );
}

function messageLooksLikeProfileUpdate(message, wallet) {
  if (!message || typeof message !== 'string') return false;
  return (
    message.includes('Ligder profile update') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Avatar URL:') &&
    message.includes('Nonce:')
  );
}

function messageLooksLikeAvatarUpload(message, wallet) {
  if (!message || typeof message !== 'string') return false;
  return (
    message.includes('Ligder avatar upload') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Nonce:')
  );
}

function messageLooksLikeForumNewThread(message, wallet) {
  if (!message || typeof message !== 'string') return false;
  return (
    message.includes('Ligder forum new thread') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Board:') &&
    message.includes('Title:') &&
    message.includes('Nonce:')
  );
}

function messageLooksLikeForumThreadReply(message, wallet) {
  if (!message || typeof message !== 'string') return false;
  return (
    message.includes('Ligder forum thread reply') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Board:') &&
    message.includes('Thread number:') &&
    message.includes('Parent post:') &&
    message.includes('Nonce:')
  );
}

const FORUM_BOARD_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;
const FORUM_OP_BODY_MAX = 1000;
const FORUM_REPLY_BODY_MAX = 30000;
const FORUM_EDIT_BODY_MAX = 30000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractBodyAfterNonceLine(message) {
  const m = message.match(/^Nonce:\s*\S+\s*$/m);
  if (!m || m.index === undefined) return null;
  const rest = message.slice(m.index + m[0].length).replace(/^\s*\n+/, '');
  return rest.trimEnd();
}

function parseForumNewThreadMessage(message) {
  const boardLine = message.match(/^Board:\s*(.+)$/m);
  const titleLine = message.match(/^Title:\s*(.+)$/m);
  if (!boardLine || !titleLine) return null;
  const board_id = boardLine[1].trim();
  const title = titleLine[1].trim();
  if (!FORUM_BOARD_ID_RE.test(board_id)) return null;
  const body = extractBodyAfterNonceLine(message);
  if (body === null) return null;
  return { board_id, title, body };
}

function parseForumThreadReplyMessage(message) {
  const boardLine = message.match(/^Board:\s*(.+)$/m);
  const threadNumLine = message.match(/^Thread number:\s*(\d+)\s*$/m);
  const parentLine = message.match(/^Parent post:\s*(.+)$/m);
  if (!boardLine || !threadNumLine || !parentLine) return null;
  const board_id = boardLine[1].trim();
  const thread_number = parseInt(threadNumLine[1], 10);
  const parentRaw = parentLine[1].trim();
  if (!FORUM_BOARD_ID_RE.test(board_id)) return null;
  if (!Number.isFinite(thread_number) || thread_number < 1) return null;
  const body = extractBodyAfterNonceLine(message);
  if (body === null) return null;
  const pl = parentRaw.toLowerCase();
  const parent_post = pl === 'root' ? 'root' : parentRaw;
  return { board_id, thread_number, parent_post, body };
}

function messageLooksLikeForumEditPost(message, wallet) {
  if (!message || typeof message !== 'string') return false;
  return (
    message.includes('Ligder forum edit post') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Post ID:') &&
    message.includes('Nonce:')
  );
}

function parseForumEditPostMessage(message) {
  const idLine = message.match(/^Post ID:\s*(.+)\s*$/m);
  if (!idLine) return null;
  const body = extractBodyAfterNonceLine(message);
  if (body === null) return null;
  return { post_id: idLine[1].trim(), body };
}

/** PostgREST / Postgres when migration 008 (thread_number) not applied yet */
function supabaseErrorMissingColumn(err, col) {
  const msg = String(err?.message ?? err?.details ?? err?.hint ?? '');
  return msg.includes(col) && /does not exist/i.test(msg);
}

const RANK_LEVEL = { member: 0, moderator: 1, administrator: 2 };
const LITE_TOTAL_SUPPLY = 1_000_000_000;
const GOVERNANCE_MIN_PERCENT = 0.25;
const GOVERNANCE_MIN_HOLDINGS =
  (LITE_TOTAL_SUPPLY * GOVERNANCE_MIN_PERCENT) / 100; // 2,500,000

function profileRankLevel(row) {
  if (!row) return 0;
  if (row.is_admin === true) return RANK_LEVEL.administrator;
  if (row.is_moderator === true) return RANK_LEVEL.moderator;
  return RANK_LEVEL.member;
}

function minRankStringToLevel(s) {
  const k = String(s ?? 'member').toLowerCase().trim();
  if (k === 'none') return null; // locked
  if (k === 'administrator') return RANK_LEVEL.administrator;
  if (k === 'moderator') return RANK_LEVEL.moderator;
  return RANK_LEVEL.member;
}

function rankAllows(profileRow, minRankStr) {
  const lvl = minRankStringToLevel(minRankStr);
  if (lvl == null) return false;
  return profileRankLevel(profileRow) >= lvl;
}

function parseLiteUiToNumber(v) {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isGovernanceSectionName(section) {
  return String(section ?? '').trim().toUpperCase() === 'LIGDER GOVERNANCE';
}

async function hasGovernanceAccessForWallet(walletOk) {
  if (!walletOk) return false;
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('wallet', walletOk)
      .maybeSingle();
    if (prof?.is_admin === true) return true;
  } catch {
    // continue with holder check
  }
  try {
    const liveUi = await fetchLiteHoldingsUi(walletOk);
    const liveNum = parseLiteUiToNumber(liveUi);
    if (liveNum != null) return liveNum >= GOVERNANCE_MIN_HOLDINGS;
  } catch {
    // fallback below
  }
  try {
    const { data: p } = await supabase
      .from('profiles')
      .select('lite_holdings_ui')
      .eq('wallet', walletOk)
      .maybeSingle();
    const cached = parseLiteUiToNumber(p?.lite_holdings_ui ?? null);
    return cached != null && cached >= GOVERNANCE_MIN_HOLDINGS;
  } catch {
    return false;
  }
}

async function getActiveBan(wallet) {
  try {
    const { data, error } = await supabase
      .from('profile_bans')
      .select('banned_until, reason')
      .eq('wallet', wallet)
      .maybeSingle();
    if (error) {
      const m = String(error.message ?? '');
      if (/does not exist|relation/i.test(m)) return null;
      return null;
    }
    if (!data) return null;
    const until = new Date(data.banned_until).getTime();
    if (!Number.isFinite(until) || until <= Date.now()) return null;
    return { banned_until: data.banned_until, reason: data.reason ?? null };
  } catch {
    return null;
  }
}

async function verifyIsAdmin(walletOk) {
  const { data: p } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('wallet', walletOk)
    .maybeSingle();
  return p?.is_admin === true;
}

/** HMAC key for admin Bearer tokens (set ADMIN_SESSION_SECRET in production). */
function adminSessionSecretBytes() {
  const raw =
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    sha256Hex(String(SUPABASE_SERVICE_ROLE_KEY) + 'ligder-admin-session-v1');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

/** One-time nonces for POST /api/admin/session (wallet signature). */
const adminSessionNonces = new Map();

function pruneAdminSessionNonces() {
  const now = Date.now();
  for (const [k, t] of adminSessionNonces) {
    if (now - t > 10 * 60 * 1000) adminSessionNonces.delete(k);
  }
}

function adminSessionCreateToken(wallet) {
  const exp = Date.now() + ADMIN_SESSION_MS;
  const payload = JSON.stringify({ w: wallet, exp });
  const key = adminSessionSecretBytes();
  const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return Buffer.from(payload, 'utf8').toString('base64url') + '.' + sig;
}

function adminSessionVerifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const lastDot = token.lastIndexOf('.');
  const payloadB64 = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  let payload;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const key = adminSessionSecretBytes();
  const expected = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(payload);
    if (typeof j.w !== 'string' || typeof j.exp !== 'number') return null;
    if (Date.now() > j.exp) return null;
    try {
      return new PublicKey(j.w).toBase58();
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function messageLooksLikeAdminSession(message, wallet) {
  return (
    typeof message === 'string' &&
    message.includes('Ligder admin session') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Nonce:')
  );
}

function parseAdminSessionNonce(message) {
  const n = message.match(/^Nonce:\s*(.+)$/m);
  return n ? n[1].trim() : null;
}

async function requireAdminAuth(req, res) {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Admin session required. Sign in from the admin panel.',
    });
    return null;
  }
  const token = auth.slice(7).trim();
  const walletOk = adminSessionVerifyToken(token);
  if (!walletOk) {
    res.status(401).json({ error: 'Invalid or expired admin session.' });
    return null;
  }
  if (!(await verifyIsAdmin(walletOk))) {
    res.status(403).json({ error: 'Administrator only' });
    return null;
  }
  return walletOk;
}

/**
 * Resolve thread by board + 1-based index. Uses thread_number when present; if that column
 * is missing (pre-008 DB), falls back to nth row ordered by created_at.
 */
async function fetchForumThreadByBoardAndIndex(boardId, threadNum) {
  const res = await supabase
    .from('forum_threads')
    .select('*')
    .eq('board_id', boardId)
    .eq('thread_number', threadNum)
    .maybeSingle();

  if (!res.error && res.data) {
    return { data: res.data, error: null };
  }
  if (res.error && supabaseErrorMissingColumn(res.error, 'thread_number')) {
    const { data: rows, error: rErr } = await supabase
      .from('forum_threads')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true });
    if (rErr) return { data: null, error: rErr };
    const list = rows ?? [];
    const t = list[threadNum - 1] ?? null;
    return { data: t, error: null };
  }
  if (res.error) {
    return { data: null, error: res.error };
  }
  return { data: null, error: null };
}

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function isValidAvatarUrl(value) {
  if (value === '' || value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (s.length > 2048) return false;
  if (!/^https:\/\//i.test(s)) return false;
  return true;
}

function parseAvatarUrlFromProfileMessage(message) {
  const line = message.split('\n').find((l) => l.startsWith('Avatar URL:'));
  if (!line) return null;
  return line.slice('Avatar URL:'.length).trim();
}

async function fetchLiteHoldingsUi(walletBase58) {
  if (!LITE_TOKEN_MINT) return '0';
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const owner = new PublicKey(walletBase58);
  const mintPk = new PublicKey(LITE_TOKEN_MINT);
  // web3.js v1.98+ requires a filter: { mint } or { programId }. Omitting it throws.
  const { value } = await connection.getParsedTokenAccountsByOwner(
    owner,
    { mint: mintPk },
    'confirmed'
  );
  if (!value.length) return '0';
  let sum = 0;
  for (const acct of value) {
    const parsed = acct.account.data.parsed;
    const info = parsed?.info;
    if (!info?.tokenAmount) continue;
    const ta = info.tokenAmount;
    const ui =
      ta.uiAmount != null
        ? Number(ta.uiAmount)
        : parseFloat(String(ta.uiAmountString ?? '0'));
    if (Number.isFinite(ui)) sum += ui;
  }
  return String(sum);
}

async function fetchLiteHoldingsRaw(walletBase58) {
  if (!LITE_TOKEN_MINT) return 0n;
  const connection = dividendsConnection;
  const owner = new PublicKey(walletBase58);
  const mintPk = new PublicKey(LITE_TOKEN_MINT);
  const { value } = await connection.getParsedTokenAccountsByOwner(
    owner,
    { mint: mintPk },
    'confirmed'
  );
  if (!value.length) return 0n;
  let sum = 0n;
  for (const acct of value) {
    const parsed = acct.account.data.parsed;
    const info = parsed?.info;
    const ta = info?.tokenAmount;
    if (!ta?.amount) continue;
    // SPL base units as integer string.
    try {
      sum += BigInt(String(ta.amount));
    } catch {
      // ignore
    }
  }
  return sum;
}

/** $LITE UI amount assumed same units as 1B total supply (whole tokens). */
const LITE_TOTAL_SUPPLY_UI = 1_000_000_000;

function liteTierReputationPoints(holdingsUi) {
  const h = Number(holdingsUi ?? 0);
  if (!Number.isFinite(h) || h <= 0) return 0;
  const pct = (h / LITE_TOTAL_SUPPLY_UI) * 100;
  if (pct >= 1) return 10_000;
  if (pct > 0.1) return 1_000;
  return 0;
}

function computeReputationFromProfileAndVoteTotals(profile, likes, dislikes) {
  const tier = liteTierReputationPoints(profile.lite_holdings_ui);
  const postsPts = (Number(profile.posts_count) || 0) * 100;
  const threadsPts = (Number(profile.threads_started) || 0) * 500;
  const votePts = 100 * (likes - dislikes);
  const total = tier + postsPts + threadsPts + votePts;
  return {
    total,
    breakdown: {
      lite_tier: tier,
      posts_points: postsPts,
      threads_points: threadsPts,
      vote_points: votePts,
      likes_on_posts: likes,
      dislikes_on_posts: dislikes,
    },
  };
}

async function getVoteTotalsByAuthorWallets(wallets) {
  if (!wallets.length) {
    return {};
  }
  const { data: posts, error: pErr } = await supabase
    .from('forum_posts')
    .select('id, author_wallet')
    .in('author_wallet', wallets);
  if (pErr) {
    console.error(pErr);
    throw new Error(pErr.message);
  }
  const byWallet = Object.fromEntries(wallets.map((w) => [w, { likes: 0, dislikes: 0 }]));
  if (!posts?.length) {
    return byWallet;
  }
  const postIds = posts.map((p) => p.id);
  const postToAuthor = new Map(posts.map((p) => [p.id, p.author_wallet]));
  const { data: votes, error: vErr } = await supabase
    .from('forum_post_votes')
    .select('post_id, vote')
    .in('post_id', postIds);
  if (vErr) {
    console.error(vErr);
    throw new Error(vErr.message);
  }
  for (const v of votes ?? []) {
    const auth = postToAuthor.get(v.post_id);
    if (!auth || !byWallet[auth]) continue;
    if (v.vote === 1) byWallet[auth].likes += 1;
    else if (v.vote === -1) byWallet[auth].dislikes += 1;
  }
  return byWallet;
}

async function reputationForProfileRow(profile) {
  const totals = await getVoteTotalsByAuthorWallets([profile.wallet]);
  const t = totals[profile.wallet] ?? { likes: 0, dislikes: 0 };
  return computeReputationFromProfileAndVoteTotals(profile, t.likes, t.dislikes);
}

app.get('/api/lite-holdings', async (req, res) => {
  const raw = String(req.query.wallet ?? '').trim();
  if (!raw) {
    return res.status(400).json({ error: 'Missing wallet' });
  }
  let walletOk;
  try {
    walletOk = new PublicKey(raw).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }
  if (!LITE_TOKEN_MINT) {
    return res.json({ lite_holdings_ui: '0' });
  }
  try {
    const ui = await fetchLiteHoldingsUi(walletOk);
    return res.json({ lite_holdings_ui: ui });
  } catch (e) {
    console.error(e);
    const detail = e instanceof Error ? e.message : String(e);
    return res.status(502).json({
      error: 'Could not read LITE balance from chain.',
      detail,
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

function messageLooksLikeDividendClaim(message, wallet, periodId) {
  if (!message || typeof message !== 'string') return false;
  const p = String(periodId ?? '').trim();
  return (
    message.includes('Ligder dividend claim') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes(`Period: ${p}`) &&
    message.includes('Nonce:')
  );
}

function parseDividendClaimPeriodFromMessage(message) {
  const m = message.match(/^Period:\s*(\d+)\s*$/m);
  return m ? m[1].trim() : null;
}

// Submit a deposit tx signature (admin-only). Server verifies tx contains SPL transfer of LITE
// from dev wallet to treasury wallet, then records it idempotently by tx_sig.
app.post('/api/dividends/deposits/submit', async (req, res) => {
  const walletOk = await requireAdminAuth(req, res);
  if (!walletOk) return;

  const { tx_sig } = req.body ?? {};
  if (typeof tx_sig !== 'string' || !tx_sig.trim()) {
    return res.status(400).json({ error: 'Missing tx_sig' });
  }
  const sig = tx_sig.trim();

  if (!dividendsTreasuryKeypair || !LITE_TOKEN_MINT) {
    return res.status(500).json({ error: 'Treasury not configured' });
  }

  // Idempotency: tx_sig is UNIQUE in dividend_deposits.
  const { data: already, error: alreadyErr } = await supabase
    .from('dividend_deposits')
    .select('tx_sig')
    .eq('tx_sig', sig)
    .maybeSingle();
  if (alreadyErr) {
    console.error('[dividends] deposit lookup failed', alreadyErr);
    return res.status(500).json({ error: alreadyErr.message });
  }
  if (already) {
    return res.json({ ok: true, alreadyRecorded: true, tx_sig: sig });
  }

  let parsed;
  try {
    parsed = await parseLiteDepositFromTxSig(sig);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(400).json({ error: msg });
  }
  if (!parsed) {
    return res.status(400).json({
      error:
        'Tx did not match expected LITE transfer (dev -> treasury). Submit the correct tx signature.',
    });
  }

  const { devWallet, amount_raw: amountRaw } = parsed;
  if (amountRaw <= 0n) {
    return res.status(400).json({ error: 'Deposit amount must be > 0' });
  }

  const periodId = dividendsPeriodIdForNowMs(Date.now());
  const { start, end } = dividendsPeriodStartEndFromId(periodId);

  // Ensure period row exists, but do not override finalized periods.
  const periodIdStr = periodId.toString();
  const { data: periodRow } = await supabase
    .from('dividend_periods')
    .select('status')
    .eq('period_id', periodIdStr)
    .maybeSingle();
  if (periodRow?.status === 'finalized') {
    return res.status(400).json({ error: 'This period is already finalized; deposit rejected.' });
  }
  if (!periodRow) {
    const { error: pInsErr } = await supabase.from('dividend_periods').insert({
      period_id: periodIdStr,
      period_start_unix: start.toString(),
      period_end_unix: end.toString(),
      status: 'open',
    });
    if (pInsErr) return res.status(500).json({ error: pInsErr.message });
  } else if (periodRow.status !== 'open') {
    return res.status(400).json({ error: `This period is not open (status=${periodRow.status}).` });
  }

  const treasuryWallet = dividendsTreasuryKeypair.publicKey.toBase58();

  const { error: insErr } = await supabase
    .from('dividend_deposits')
    .insert({
      tx_sig: sig,
      dev_wallet: devWallet,
      treasury_wallet: treasuryWallet,
      amount_raw: amountRaw.toString(),
      deposit_period_id: periodIdStr,
      block_time: new Date().toISOString(),
    });

  if (insErr) {
    // Could be a race on unique constraint: re-check.
    const { data: rec2 } = await supabase
      .from('dividend_deposits')
      .select('tx_sig')
      .eq('tx_sig', sig)
      .maybeSingle();
    if (rec2) return res.json({ ok: true, alreadyRecorded: true, tx_sig: sig });
    console.error('[dividends] insert deposit failed', insErr);
    return res.status(500).json({ error: insErr.message });
  }

  return res.json({ ok: true, alreadyRecorded: false, tx_sig: sig });
});

// Public server clock for dividends UI (same time basis as period buckets / status).
app.get('/api/dividends/clock', (_req, res) => {
  res.json({ server_now_unix: Math.floor(Date.now() / 1000) });
});

// Read dividends status for a wallet (must be registered to claim; unregistered gets zero/empty entitlement).
app.get('/api/dividends/status', async (req, res) => {
  const walletRaw = String(req.query.wallet ?? '').trim();
  if (!walletRaw) {
    return res.status(400).json({ error: 'Missing wallet' });
  }
  let walletOk;
  try {
    walletOk = new PublicKey(walletRaw).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }
  if (!LITE_TOKEN_MINT) return res.json({ error: 'LITE_TOKEN_MINT not configured' });

  // Latest finalized period.
  const { data: latest, error: latestErr } = await supabase
    .from('dividend_periods')
    .select(
      'period_id, period_end_unix, deposit_total_raw, claimable_pot_raw, management_reserve_raw, snapshot_total_balance_raw, snapshot_taken_at, status'
    )
    .eq('status', 'finalized')
    .order('period_end_unix', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) return res.status(500).json({ error: latestErr.message });
  if (!latest) {
    return res.json({
      latestPeriod: null,
      claimable_pot_raw: '0',
      management_reserve_raw: '0',
      deposit_total_raw: '0',
      snapshot_total_balance_raw: '0',
      snapshot_taken_at: null,
      myEntitlement: null,
      myClaimed: false,
      isEligible: false,
    });
  }

  const periodId = BigInt(latest.period_id);
  const periodEndUnix = Number(latest.period_end_unix);
  const nowUnix = Math.floor(Date.now() / 1000);
  const claimDeadlineUnix = periodEndUnix + DIVIDENDS_PERIOD_SECONDS; // next snapshot boundary
  const withinWindow = nowUnix <= claimDeadlineUnix;
  const snapshotTakenUnix = periodEndUnix;
  const nextSnapshotUnix = claimDeadlineUnix;

  const { data: prof } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('wallet', walletOk)
    .maybeSingle();
  const isRegistered = Boolean(prof);
  if (!isRegistered) {
    return res.json({
      latestPeriod: latest.period_id,
      claimable_pot_raw: latest.claimable_pot_raw,
      management_reserve_raw: latest.management_reserve_raw,
      deposit_total_raw: latest.deposit_total_raw,
      snapshot_total_balance_raw: latest.snapshot_total_balance_raw,
      snapshot_taken_at: latest.snapshot_taken_at,
      myEntitlement: null,
      myClaimed: false,
      isEligible: false,
      withinWindow,
      server_now_unix: nowUnix,
      snapshot_taken_unix: snapshotTakenUnix,
      next_snapshot_unix: nextSnapshotUnix,
      claim_window_end_unix: claimDeadlineUnix,
    });
  }

  const { data: ent } = await supabase
    .from('dividend_wallet_entitlements')
    .select(
      'period_id,balance_snapshot_raw,entitlement_raw,claimed_amount_raw,claim_tx_sig'
    )
    .eq('period_id', periodId.toString())
    .eq('wallet', walletOk)
    .maybeSingle();

  if (!ent) {
    return res.json({
      latestPeriod: latest.period_id,
      claimable_pot_raw: latest.claimable_pot_raw,
      management_reserve_raw: latest.management_reserve_raw,
      deposit_total_raw: latest.deposit_total_raw,
      snapshot_total_balance_raw: latest.snapshot_total_balance_raw,
      snapshot_taken_at: latest.snapshot_taken_at,
      myEntitlement: null,
      myClaimed: false,
      isEligible: false,
      withinWindow,
      server_now_unix: nowUnix,
      snapshot_taken_unix: snapshotTakenUnix,
      next_snapshot_unix: nextSnapshotUnix,
      claim_window_end_unix: claimDeadlineUnix,
    });
  }

  const balanceSnapshotRaw = BigInt(ent.balance_snapshot_raw);
  const entitlementRaw = BigInt(ent.entitlement_raw);
  const claimedRaw = BigInt(ent.claimed_amount_raw ?? 0);
  const myClaimed = claimedRaw > 0n;

  // Tolerance eligibility check (10% tolerance).
  const currentBalRaw = await fetchLiteHoldingsRaw(walletOk);
  const eligibleByTolerance =
    balanceSnapshotRaw > 0n
      ? currentBalRaw * 100n >= balanceSnapshotRaw * 90n
      : false;

  return res.json({
    latestPeriod: latest.period_id,
    claimable_pot_raw: latest.claimable_pot_raw,
    management_reserve_raw: latest.management_reserve_raw,
    deposit_total_raw: latest.deposit_total_raw,
    snapshot_total_balance_raw: latest.snapshot_total_balance_raw,
    snapshot_taken_at: latest.snapshot_taken_at,
    myEntitlement: {
      balance_snapshot_raw: ent.balance_snapshot_raw,
      entitlement_raw: ent.entitlement_raw,
    },
    myClaimed,
    isEligible: withinWindow && !myClaimed && eligibleByTolerance && entitlementRaw > 0n,
    withinWindow,
    current_balance_raw: currentBalRaw.toString(),
    server_now_unix: nowUnix,
    snapshot_taken_unix: snapshotTakenUnix,
    next_snapshot_unix: nextSnapshotUnix,
    claim_window_end_unix: claimDeadlineUnix,
  });
});

app.get('/api/dividends/periods', async (req, res) => {
  const rawLimit = String(req.query.limit ?? '10').trim();
  const rawOffset = String(req.query.offset ?? '0').trim();
  const limit = Math.min(50, Math.max(1, parseInt(rawLimit, 10) || 10));
  const offset = Math.max(0, parseInt(rawOffset, 10) || 0);

  const { data, error } = await supabase
    .from('dividend_periods')
    .select('period_id,period_start_unix,period_end_unix,deposit_total_raw,claimable_pot_raw,management_reserve_raw,finalized_at')
    .eq('status', 'finalized')
    .order('period_end_unix', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ periods: data ?? [], limit, offset });
});

app.get('/api/dividends/periods/:periodId/allocations', async (req, res) => {
  const periodIdRaw = String(req.params.periodId ?? '').trim();
  if (!/^\d+$/.test(periodIdRaw)) {
    return res.status(400).json({ error: 'Invalid periodId' });
  }

  const rawLimit = String(req.query.limit ?? '25').trim();
  const rawOffset = String(req.query.offset ?? '0').trim();
  const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 25));
  const offset = Math.max(0, parseInt(rawOffset, 10) || 0);

  const orderBy = String(req.query.orderBy ?? 'entitlement_raw').trim();
  const dirRaw = String(req.query.dir ?? 'desc').trim().toLowerCase();
  const dir = dirRaw === 'asc' ? 'asc' : 'desc';

  const allowed = new Set(['balance_snapshot_raw', 'entitlement_raw', 'share_bps', 'wallet']);
  const safeOrderBy = allowed.has(orderBy) ? orderBy : 'entitlement_raw';

  const { data, error, count } = await supabase
    .from('dividend_wallet_entitlements')
    .select(
      'wallet,balance_snapshot_raw,share_bps,entitlement_raw,claimed_amount_raw,claim_tx_sig',
      {
      count: 'exact',
      }
    )
    .eq('period_id', periodIdRaw)
    .order(safeOrderBy, { ascending: dir === 'asc' })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  // Normalize output for UI.
  const rows = (data ?? []).map((r) => ({
    wallet: String(r.wallet),
    username: null,
    balance_snapshot_raw: String(r.balance_snapshot_raw),
    share_bps: String(r.share_bps),
    entitlement_raw: String(r.entitlement_raw),
    claimed: BigInt(String(r.claimed_amount_raw ?? 0)) > 0n,
    claim_tx_sig: r.claim_tx_sig ? String(r.claim_tx_sig) : null,
  }));

  return res.json({ rows, total: typeof count === 'number' ? count : null, limit, offset });
});

app.post('/api/dividends/claims/claim', async (req, res) => {
  const { wallet, message, signature, periodId } = req.body ?? {};
  if (typeof wallet !== 'string' || typeof message !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  if (typeof periodId !== 'string' && typeof periodId !== 'number') {
    return res.status(400).json({ error: 'Missing periodId' });
  }
  const periodIdStr = String(periodId).trim();
  if (!/^\d+$/.test(periodIdStr)) return res.status(400).json({ error: 'Invalid periodId' });

  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }

  if (!messageLooksLikeDividendClaim(message, walletOk, periodIdStr)) {
    return res.status(400).json({ error: 'Invalid claim message' });
  }
  const okSig = verifyWalletSignature(walletOk, message, signature);
  if (!okSig) return res.status(401).json({ error: 'Invalid signature' });

  if (!dividendsTreasuryKeypair || !LITE_TOKEN_MINT) {
    return res.status(500).json({ error: 'Treasury not configured' });
  }
  if (!memoFeePayer) {
    return res.status(500).json({
      error:
        'SOLANA_MEMO_FEE_PAYER_SECRET_KEY not configured — relay wallet needed to pay claim tx fees.',
    });
  }

  const { data: prof } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('wallet', walletOk)
    .maybeSingle();
  if (!prof) {
    return res.status(403).json({ error: 'Register before claiming' });
  }

  const { data: period } = await supabase
    .from('dividend_periods')
    .select('period_id,period_end_unix,status')
    .eq('period_id', periodIdStr)
    .maybeSingle();
  if (!period) return res.status(404).json({ error: 'Period not found' });
  if (period.status !== 'finalized') return res.status(400).json({ error: 'Period not finalized yet' });

  const periodEndUnix = Number(period.period_end_unix);
  const claimDeadlineUnix = periodEndUnix + DIVIDENDS_PERIOD_SECONDS;
  const nowUnix = Math.floor(Date.now() / 1000);
  if (nowUnix > claimDeadlineUnix) {
    return res.status(400).json({ error: 'Claim window closed' });
  }

  const { data: ent } = await supabase
    .from('dividend_wallet_entitlements')
    .select('wallet,balance_snapshot_raw,entitlement_raw,claimed_amount_raw')
    .eq('period_id', periodIdStr)
    .eq('wallet', walletOk)
    .maybeSingle();
  if (!ent) return res.status(400).json({ error: 'Not eligible for this period' });

  const balanceSnapshotRaw = BigInt(ent.balance_snapshot_raw);
  const entitlementRaw = BigInt(ent.entitlement_raw);
  const claimedRaw = BigInt(ent.claimed_amount_raw ?? 0);
  if (claimedRaw > 0n || entitlementRaw <= 0n) {
    return res.json({ ok: true, alreadyClaimed: true });
  }

  // Tolerance eligibility.
  const currentBalRaw = await fetchLiteHoldingsRaw(walletOk);
  const eligible =
    balanceSnapshotRaw > 0n
      ? currentBalRaw * 100n >= balanceSnapshotRaw * 90n
      : false;
  if (!eligible) {
    return res.status(403).json({ error: 'Holdings changed too much since snapshot' });
  }

  // Atomic claim lock to prevent double payouts on concurrent requests.
  const lockToken = `PENDING:${crypto.randomUUID()}`;
  const lockTime = new Date().toISOString();
  const { data: lockRow, error: lockErr } = await supabase
    .from('dividend_wallet_entitlements')
    .update({
      claimed_amount_raw: entitlementRaw.toString(),
      claim_tx_sig: lockToken,
      claimed_at: lockTime,
      updated_at: lockTime,
    })
    .eq('period_id', periodIdStr)
    .eq('wallet', walletOk)
    .eq('claimed_amount_raw', '0')
    .select('wallet')
    .maybeSingle();

  if (lockErr) {
    console.error('[dividends] claim lock failed:', lockErr);
    return res.status(500).json({ error: 'Could not lock claim' });
  }
  if (!lockRow) {
    return res.json({ ok: true, alreadyClaimed: true });
  }

  const treasuryOwner = dividendsTreasuryKeypair.publicKey;
  const mintPk = new PublicKey(LITE_TOKEN_MINT);
  const treasuryAta = getAssociatedTokenAddressSync(mintPk, treasuryOwner);
  const userPk = new PublicKey(walletOk);
  const userAta = getAssociatedTokenAddressSync(mintPk, userPk);

  const decimals = LITE_TOKEN_DECIMALS;
  const transferAmount = entitlementRaw;

  const tx = new Transaction();
  // Idempotent ATA: memo fee wallet pays rent (same relay model as forum memos). Treasury only signs SPL transfer.
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      memoFeePayer.publicKey,
      userAta,
      userPk,
      mintPk
    )
  );
  tx.add(
    createTransferCheckedInstruction(
      treasuryAta,
      mintPk,
      userAta,
      treasuryOwner,
      transferAmount,
      decimals
    )
  );

  const { blockhash, lastValidBlockHeight } =
    await dividendsConnection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = memoFeePayer.publicKey;
  tx.sign(memoFeePayer, dividendsTreasuryKeypair);

  let sig;
  try {
    sig = await dividendsConnection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const confirmTime = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('dividend_wallet_entitlements')
      .update({
        claim_tx_sig: sig,
        updated_at: confirmTime,
      })
      .eq('period_id', periodIdStr)
      .eq('wallet', walletOk)
      .eq('claim_tx_sig', lockToken);

    if (updErr) {
      console.error('[dividends] claim DB update failed:', updErr);
    }

    return res.json({
      ok: true,
      claim_tx_sig: sig,
      entitlement_raw: entitlementRaw.toString(),
    });
  } catch (e) {
    // Best-effort revert so the user can retry.
    const revertTime = new Date().toISOString();
    try {
      await supabase.from('dividend_wallet_entitlements').update({
        claimed_amount_raw: '0',
        claim_tx_sig: null,
        claimed_at: null,
        updated_at: revertTime,
      }).eq('period_id', periodIdStr).eq('wallet', walletOk).eq('claim_tx_sig', lockToken);
    } catch (revertErr) {
      console.error('[dividends] claim revert failed:', revertErr);
    }
    const detail = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: 'Claim transfer failed', detail });
  }
});


app.get('/api/username-check', async (req, res) => {
  const raw = String(req.query.username ?? '').trim().toLowerCase();
  if (!USERNAME_RE.test(raw)) {
    return res.json({ available: false, reason: 'invalid' });
  }
  if (RESERVED.has(raw)) {
    return res.json({ available: false, reason: 'reserved' });
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', raw)
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database error' });
  }
  return res.json({ available: !data, reason: data ? 'taken' : undefined });
});

app.post('/api/register', async (req, res) => {
  const { wallet, username, message, signature } = req.body ?? {};

  if (typeof wallet !== 'string' || typeof username !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  if (typeof message !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing message or signature' });
  }

  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }

  const u = username.trim().toLowerCase();
  if (!USERNAME_RE.test(u) || RESERVED.has(u)) {
    return res.status(400).json({ error: 'Invalid or reserved username' });
  }

  if (!messageLooksValid(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid registration message' });
  }

  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { data: taken } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('wallet', walletOk)
    .maybeSingle();
  if (taken) {
    return res.status(409).json({ error: 'Wallet already registered' });
  }

  const { data: nameTaken } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', u)
    .maybeSingle();
  if (nameTaken) {
    return res.status(409).json({ error: 'Username taken' });
  }

  const ban = await getActiveBan(walletOk);
  if (ban) {
    return res.status(403).json({
      error: `This wallet is banned until ${new Date(ban.banned_until).toLocaleString()}.`,
      banned: true,
      banned_until: ban.banned_until,
    });
  }

  const { error: insertError } = await supabase.from('profiles').insert({
    wallet: walletOk,
    username: u,
  });

  if (insertError) {
    console.error(insertError);
    return res.status(500).json({ error: insertError.message });
  }

  return res.json({ ok: true, wallet: walletOk, username: u });
});

app.get('/api/profile', async (req, res) => {
  const wallet = String(req.query.wallet ?? '').trim();
  const username = String(req.query.username ?? '').trim().toLowerCase();
  if (!wallet && !username) {
    return res.status(400).json({ error: 'Missing wallet or username' });
  }

  let walletOk = '';
  if (wallet) {
    try {
      walletOk = new PublicKey(wallet).toBase58();
    } catch {
      return res.status(400).json({ error: 'Invalid wallet' });
    }
  } else {
    if (!USERNAME_RE.test(username) || RESERVED.has(username)) {
      return res.status(400).json({ error: 'Invalid username' });
    }
    const { data: byUser, error: byUserErr } = await supabase
      .from('profiles')
      .select('wallet')
      .eq('username', username)
      .maybeSingle();
    if (byUserErr) {
      console.error(byUserErr);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!byUser?.wallet) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    walletOk = byUser.wallet;
  }

  const ban = await getActiveBan(walletOk);
  if (ban) {
    return res.status(403).json({
      error: 'Account banned',
      banned: true,
      banned_until: ban.banned_until,
      reason: ban.reason,
    });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'wallet,username,created_at,avatar_url,posts_count,threads_started,likes_received,likes_given,lite_holdings_ui,lite_holdings_updated_at,is_admin,is_moderator,github_handle,x_handle'
    )
    .eq('wallet', walletOk)
    .maybeSingle();

  if (error) {
    if (supabaseErrorMissingColumn(error, 'is_moderator')) {
      const { data: d2, error: e2 } = await supabase
        .from('profiles')
        .select(
          'wallet,username,created_at,avatar_url,posts_count,threads_started,likes_received,likes_given,lite_holdings_ui,lite_holdings_updated_at,is_admin,github_handle,x_handle'
        )
        .eq('wallet', walletOk)
        .maybeSingle();
      if (e2) {
        console.error(e2);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!d2) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      const row = { ...d2, is_moderator: false };
      try {
        const rep = await reputationForProfileRow(row);
        return res.json({
          ...row,
          reputation: rep.total,
          reputation_breakdown: rep.breakdown,
        });
      } catch (e) {
        console.error(e);
        return res.json(row);
      }
    }
    console.error(error);
    return res.status(500).json({ error: 'Database error' });
  }
  if (!data) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const row = { ...data, is_moderator: data.is_moderator === true };

  try {
    const rep = await reputationForProfileRow(row);
    return res.json({
      ...row,
      reputation: rep.total,
      reputation_breakdown: rep.breakdown,
    });
  } catch (e) {
    console.error(e);
    return res.json(row);
  }
});

function messageLooksLikePmKeyRegister(message, wallet, encPublicKey) {
  return (
    typeof message === 'string' &&
    message.includes('Ligder PM key register') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes(`Enc public key: ${encPublicKey}`) &&
    message.includes('Nonce:')
  );
}

function messageLooksLikePmSend(
  message,
  wallet,
  recipientWallet,
  cipherSha256,
  nonceBase64
) {
  return (
    typeof message === 'string' &&
    message.includes('Ligder PM send') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes(`Recipient wallet: ${recipientWallet}`) &&
    message.includes(`Cipher SHA-256: ${cipherSha256}`) &&
    message.includes(`Nonce: ${nonceBase64}`) &&
    message.includes('Nonce id:')
  );
}

function messageLooksLikePmList(message, wallet) {
  return (
    typeof message === 'string' &&
    message.includes('Ligder PM list') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Nonce:')
  );
}

function pmSessionSecretBytes() {
  const raw =
    process.env.PM_SESSION_SECRET?.trim() ||
    sha256Hex(String(SUPABASE_SERVICE_ROLE_KEY) + 'ligder-pm-session-v1');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

const PM_SESSION_MS = 12 * 60 * 60 * 1000;
const pmSessionNonces = new Map();

function prunePmSessionNonces() {
  const now = Date.now();
  for (const [k, t] of pmSessionNonces) {
    if (now - t > 10 * 60 * 1000) pmSessionNonces.delete(k);
  }
}

function pmSessionCreateToken(wallet) {
  const exp = Date.now() + PM_SESSION_MS;
  const payload = JSON.stringify({ w: wallet, exp });
  const key = pmSessionSecretBytes();
  const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return Buffer.from(payload, 'utf8').toString('base64url') + '.' + sig;
}

function pmSessionVerifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const lastDot = token.lastIndexOf('.');
  const payloadB64 = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  let payload;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const key = pmSessionSecretBytes();
  const expected = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(payload);
    if (typeof j.w !== 'string' || typeof j.exp !== 'number') return null;
    if (Date.now() > j.exp) return null;
    return new PublicKey(j.w).toBase58();
  } catch {
    return null;
  }
}

function messageLooksLikePmSession(message, wallet) {
  return (
    typeof message === 'string' &&
    message.includes('Ligder PM session') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Nonce:')
  );
}

function parsePmSessionNonce(message) {
  const n = message.match(/^Nonce:\s*(.+)$/m);
  return n ? n[1].trim() : null;
}

async function requirePmAuth(req, res) {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'PM session required. Sign in from Messages.' });
    return null;
  }
  const token = auth.slice(7).trim();
  const walletOk = pmSessionVerifyToken(token);
  if (!walletOk) {
    res.status(401).json({ error: 'Invalid or expired PM session.' });
    return null;
  }
  const { data: prof } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('wallet', walletOk)
    .maybeSingle();
  if (!prof) {
    res.status(403).json({ error: 'Register a profile first' });
    return null;
  }
  return walletOk;
}

app.get('/api/pm/session-nonce', (req, res) => {
  prunePmSessionNonces();
  const nonce = crypto.randomUUID();
  pmSessionNonces.set(nonce, Date.now());
  return res.json({ nonce });
});

app.post('/api/pm/session', async (req, res) => {
  const { wallet, message, signature } = req.body ?? {};
  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }
  if (!messageLooksLikePmSession(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid PM session message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const nonce = parsePmSessionNonce(message);
  if (!nonce || !pmSessionNonces.has(nonce)) {
    return res
      .status(400)
      .json({ error: 'Invalid or expired nonce. Request a new one.' });
  }
  pmSessionNonces.delete(nonce);
  const { data: prof } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('wallet', walletOk)
    .maybeSingle();
  if (!prof) {
    return res.status(403).json({ error: 'Register a profile first' });
  }
  return res.json({ token: pmSessionCreateToken(walletOk) });
});

app.get('/api/pm/key', async (req, res) => {
  const wallet = String(req.query.wallet ?? '').trim();
  const username = String(req.query.username ?? '').trim().toLowerCase();
  if (!wallet && !username) {
    return res.status(400).json({ error: 'Missing wallet or username' });
  }

  let walletOk = '';
  if (wallet) {
    try {
      walletOk = new PublicKey(wallet).toBase58();
    } catch {
      return res.status(400).json({ error: 'Invalid wallet' });
    }
  } else {
    if (!USERNAME_RE.test(username) || RESERVED.has(username)) {
      return res.status(400).json({ error: 'Invalid username' });
    }
    const { data: profByUser, error: byUserErr } = await supabase
      .from('profiles')
      .select('wallet, username')
      .eq('username', username)
      .maybeSingle();
    if (byUserErr) {
      console.error(byUserErr);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!profByUser?.wallet) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    walletOk = profByUser.wallet;
  }

  const { data: keyRow, error: keyErr } = await supabase
    .from('profile_pm_keys')
    .select('enc_public_key')
    .eq('wallet', walletOk)
    .maybeSingle();
  if (keyErr) {
    const m = String(keyErr.message ?? '');
    if (/does not exist|relation/i.test(m)) {
      return res
        .status(500)
        .json({ error: 'Run SQL migration 015 (PM keys/messages) on the database' });
    }
    console.error(keyErr);
    return res.status(500).json({ error: keyErr.message });
  }
  if (!keyRow?.enc_public_key) {
    return res.status(404).json({ error: 'PM key not found' });
  }
  return res.json({ wallet: walletOk, enc_public_key: keyRow.enc_public_key });
});

app.post('/api/pm/key', async (req, res) => {
  const { wallet, message, signature, enc_public_key } = req.body ?? {};
  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string' ||
    typeof enc_public_key !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }
  if (!isValidBase64Len(enc_public_key, 32)) {
    return res.status(400).json({ error: 'Invalid encryption public key' });
  }
  if (!messageLooksLikePmKeyRegister(message, walletOk, enc_public_key)) {
    return res.status(400).json({ error: 'Invalid PM key message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('wallet', walletOk)
    .maybeSingle();
  if (!senderProfile) {
    return res.status(403).json({ error: 'Register a profile first' });
  }
  const { error } = await supabase.from('profile_pm_keys').upsert(
    {
      wallet: walletOk,
      enc_public_key,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet' }
  );
  if (error) {
    const m = String(error.message ?? '');
    if (/does not exist|relation/i.test(m)) {
      return res
        .status(500)
        .json({ error: 'Run SQL migration 015 (PM keys/messages) on the database' });
    }
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
  return res.json({ ok: true, wallet: walletOk, enc_public_key });
});

app.post('/api/pm/send', async (req, res) => {
  const {
    wallet,
    message,
    signature,
    recipient_wallet,
    nonce_base64,
    ciphertext_recipient_base64,
    ciphertext_sender_base64,
    cipher_sha256,
  } = req.body ?? {};
  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string' ||
    typeof recipient_wallet !== 'string' ||
    typeof nonce_base64 !== 'string' ||
    typeof ciphertext_recipient_base64 !== 'string' ||
    typeof ciphertext_sender_base64 !== 'string' ||
    typeof cipher_sha256 !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  let walletOk;
  let recipientOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
    recipientOk = new PublicKey(recipient_wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }
  if (!isValidBase64Len(nonce_base64, 24)) {
    return res.status(400).json({ error: 'Invalid nonce' });
  }
  const cipherSha = cipher_sha256.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cipherSha)) {
    return res.status(400).json({ error: 'Invalid cipher hash' });
  }
  const cRecLen = Buffer.from(ciphertext_recipient_base64, 'base64').length;
  const cSenLen = Buffer.from(ciphertext_sender_base64, 'base64').length;
  if (cRecLen < 17 || cSenLen < 17 || cRecLen > 65536 || cSenLen > 65536) {
    return res.status(400).json({ error: 'Invalid ciphertext size' });
  }
  if (!messageLooksLikePmSend(message, walletOk, recipientOk, cipherSha, nonce_base64)) {
    return res.status(400).json({ error: 'Invalid PM send message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { data: senderProf } = await supabase
    .from('profiles')
    .select('wallet, username')
    .eq('wallet', walletOk)
    .maybeSingle();
  if (!senderProf) {
    return res.status(403).json({ error: 'Register a profile first' });
  }
  const { data: recipientProf } = await supabase
    .from('profiles')
    .select('wallet, username')
    .eq('wallet', recipientOk)
    .maybeSingle();
  if (!recipientProf) {
    return res.status(404).json({ error: 'Recipient not found' });
  }
  const { data: recipientKey } = await supabase
    .from('profile_pm_keys')
    .select('enc_public_key')
    .eq('wallet', recipientOk)
    .maybeSingle();
  if (!recipientKey?.enc_public_key) {
    return res.status(400).json({ error: 'Recipient has not enabled PM yet' });
  }

  const { data: inserted, error: insErr } = await supabase
    .from('forum_private_messages')
    .insert({
      sender_wallet: walletOk,
      recipient_wallet: recipientOk,
      sender_username: senderProf.username ?? null,
      recipient_username: recipientProf.username ?? null,
      nonce_base64,
      ciphertext_recipient_base64,
      ciphertext_sender_base64,
      cipher_sha256: cipherSha,
      memo: 'pending',
      fee_payer: memoFeePayer ? memoFeePayer.publicKey.toBase58() : 'unknown',
      status: 'pending',
      attempts: 0,
      last_error: null,
      tx_sig: null,
      updated_at: new Date().toISOString(),
    })
    .select('id, created_at')
    .single();
  if (insErr) {
    const m = String(insErr.message ?? '');
    if (/does not exist|relation/i.test(m)) {
      return res
        .status(500)
        .json({ error: 'Run SQL migration 015 (PM keys/messages) on the database' });
    }
    console.error(insErr);
    return res.status(500).json({ error: insErr.message });
  }

  const memo = compactPmMemo({
    pm_id: inserted.id,
    from_wallet: walletOk,
    to_wallet: recipientOk,
    cipher_sha256: cipherSha,
  });
  let onchain_tx_sig = null;
  let onchain_status = 'failed';
  let last_error = null;
  try {
    const sent = await sendMemoAttestation(memo);
    if (sent.ok && sent.tx_sig) {
      onchain_tx_sig = sent.tx_sig;
      onchain_status = 'confirmed';
    } else {
      last_error = sent.error ?? 'Send failed';
    }
  } catch (e) {
    last_error = e instanceof Error ? e.message : String(e);
  }

  await supabase
    .from('forum_private_messages')
    .update({
      memo,
      tx_sig: onchain_tx_sig,
      status: onchain_status,
      attempts: 1,
      last_error,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inserted.id);

  return res.json({
    ok: true,
    id: inserted.id,
    created_at: inserted.created_at,
    tx_sig: onchain_tx_sig,
    status: onchain_status,
  });
});

app.post('/api/pm/list', async (req, res) => {
  const walletOk = await requirePmAuth(req, res);
  if (!walletOk) return;
  const { limit } = req.body ?? {};
  const lim = Math.max(1, Math.min(200, Number(limit) || 100));
  const { data: rows, error } = await supabase
    .from('forum_private_messages')
    .select(
      'id,sender_wallet,recipient_wallet,sender_username,recipient_username,nonce_base64,ciphertext_sender_base64,ciphertext_recipient_base64,tx_sig,status,created_at'
    )
    .or(`sender_wallet.eq.${walletOk},recipient_wallet.eq.${walletOk}`)
    .order('created_at', { ascending: false })
    .limit(lim);
  if (error) {
    const m = String(error.message ?? '');
    if (/does not exist|relation/i.test(m)) {
      return res
        .status(500)
        .json({ error: 'Run SQL migration 015 (PM keys/messages) on the database' });
    }
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
  const wallets = new Set();
  for (const r of rows ?? []) {
    wallets.add(r.sender_wallet);
    wallets.add(r.recipient_wallet);
  }
  const walletArr = [...wallets];
  let keyMap = {};
  if (walletArr.length > 0) {
    const { data: keys } = await supabase
      .from('profile_pm_keys')
      .select('wallet, enc_public_key')
      .in('wallet', walletArr);
    for (const k of keys ?? []) {
      keyMap[k.wallet] = k.enc_public_key;
    }
  }
  const messages = (rows ?? []).map((r) => {
    const mineAsSender = r.sender_wallet === walletOk;
    const counterparty_wallet = mineAsSender ? r.recipient_wallet : r.sender_wallet;
    const counterparty_username = mineAsSender ? r.recipient_username : r.sender_username;
    return {
      id: r.id,
      sender_wallet: r.sender_wallet,
      recipient_wallet: r.recipient_wallet,
      sender_username: r.sender_username,
      recipient_username: r.recipient_username,
      counterparty_wallet,
      counterparty_username,
      nonce_base64: r.nonce_base64,
      ciphertext_base64: mineAsSender
        ? r.ciphertext_sender_base64
        : r.ciphertext_recipient_base64,
      tx_sig: r.tx_sig ?? null,
      status: r.status,
      created_at: r.created_at,
    };
  });
  return res.json({ messages, key_map: keyMap });
});

app.post('/api/pm/delete', async (req, res) => {
  const walletOk = await requirePmAuth(req, res);
  if (!walletOk) return;
  const { id } = req.body ?? {};
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid message id' });
  }
  const { data: row, error: selErr } = await supabase
    .from('forum_private_messages')
    .select('id,sender_wallet,recipient_wallet')
    .eq('id', id)
    .maybeSingle();
  if (selErr) {
    console.error(selErr);
    return res.status(500).json({ error: selErr.message });
  }
  if (!row) {
    return res.status(404).json({ error: 'Message not found' });
  }
  if (row.sender_wallet !== walletOk && row.recipient_wallet !== walletOk) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  const { error: delErr } = await supabase
    .from('forum_private_messages')
    .delete()
    .eq('id', id);
  if (delErr) {
    console.error(delErr);
    return res.status(500).json({ error: delErr.message });
  }
  return res.json({ ok: true });
});

app.post('/api/pm/clear', async (req, res) => {
  const walletOk = await requirePmAuth(req, res);
  if (!walletOk) return;
  const { error: delErr } = await supabase
    .from('forum_private_messages')
    .delete()
    .or(`sender_wallet.eq.${walletOk},recipient_wallet.eq.${walletOk}`);
  if (delErr) {
    console.error(delErr);
    return res.status(500).json({ error: delErr.message });
  }
  return res.json({ ok: true });
});

function messageLooksLikeProfileSocialUpdate(message, wallet) {
  if (!message || typeof message !== 'string') return false;
  return (
    message.includes('Ligder profile socials update') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('X Handle:') &&
    message.includes('GitHub Handle:') &&
    message.includes('Nonce:')
  );
}

function parseProfileSocialUpdate(message) {
  const xLine = message.match(/^X Handle:\s*(.*)$/m);
  const gLine = message.match(/^GitHub Handle:\s*(.*)$/m);
  if (!xLine || !gLine) return null;
  const normalize = (raw) => {
    const v = String(raw ?? '').trim();
    if (!v || v === '-' || v === '_') return null;
    const noAt = v.replace(/^@/, '');
    return noAt.toLowerCase();
  };
  const x_handle = normalize(xLine[1]);
  const github_handle = normalize(gLine[1]);
  return { x_handle, github_handle };
}

function isValidSocialHandle(handle) {
  if (handle == null) return true;
  // X + GitHub handles: letters/numbers/underscore/hyphen (keep it permissive).
  return /^[a-z0-9_-]{1,40}$/i.test(handle);
}

app.patch('/api/profile/socials', async (req, res) => {
  const { wallet, message, signature, x_handle, github_handle } = req.body ?? {};
  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }

  if (!messageLooksLikeProfileSocialUpdate(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid profile socials update message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const parsed = parseProfileSocialUpdate(message);
  if (!parsed) {
    return res.status(400).json({ error: 'Could not parse social handles' });
  }

  if (!isValidSocialHandle(parsed.x_handle) || !isValidSocialHandle(parsed.github_handle)) {
    return res.status(400).json({ error: 'Invalid social handle format' });
  }

  const { error: upErr } = await supabase
    .from('profiles')
    .update({
      x_handle: parsed.x_handle,
      github_handle: parsed.github_handle,
    })
    .eq('wallet', walletOk);

  if (upErr) {
    console.error(upErr);
    return res.status(500).json({ error: upErr.message });
  }

  return res.json({ ok: true, x_handle: parsed.x_handle, github_handle: parsed.github_handle });
});

function parseUsernameListParam(raw) {
  const list = String(raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length > 50) return null;
  return [...new Set(list)];
}

app.get('/api/reputation/by-usernames', async (req, res) => {
  const names = parseUsernameListParam(req.query.usernames);
  if (!names) {
    return res.status(400).json({ error: 'Invalid or too many usernames (max 50)' });
  }
  if (names.length === 0) {
    return res.json({ reputations: {} });
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('wallet, username, posts_count, threads_started, lite_holdings_ui')
    .in('username', names);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  const wallets = (profiles ?? []).map((p) => p.wallet);
  let totalsByWallet = {};
  try {
    totalsByWallet = await getVoteTotalsByAuthorWallets(wallets);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Vote totals failed' });
  }

  const reputations = {};
  for (const p of profiles ?? []) {
    const t = totalsByWallet[p.wallet] ?? { likes: 0, dislikes: 0 };
    const r = computeReputationFromProfileAndVoteTotals(p, t.likes, t.dislikes);
    reputations[p.username] = {
      total: r.total,
      breakdown: r.breakdown,
      likes: t.likes,
      dislikes: t.dislikes,
    };
  }

  return res.json({ reputations });
});

app.patch('/api/profile', async (req, res) => {
  const { wallet, message, signature, avatar_url } = req.body ?? {};

  if (typeof wallet !== 'string' || typeof message !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  if (avatar_url !== undefined && avatar_url !== null && typeof avatar_url !== 'string') {
    return res.status(400).json({ error: 'Invalid avatar_url' });
  }

  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }

  const trimmedAvatar = typeof avatar_url === 'string' ? avatar_url.trim() : '';
  if (!messageLooksLikeProfileUpdate(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid profile update message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const fromMessage = parseAvatarUrlFromProfileMessage(message);
  if (fromMessage === null) {
    return res.status(400).json({ error: 'Could not parse Avatar URL from message' });
  }
  if (fromMessage !== trimmedAvatar) {
    return res.status(400).json({ error: 'Message does not match avatar_url' });
  }

  const { data: row } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('wallet', walletOk)
    .maybeSingle();
  if (!row) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  if (!isValidAvatarUrl(fromMessage)) {
    return res.status(400).json({ error: 'Avatar URL must be empty or HTTPS' });
  }

  const { error: upErr } = await supabase
    .from('profiles')
    .update({ avatar_url: fromMessage || null })
    .eq('wallet', walletOk);

  if (upErr) {
    console.error(upErr);
    return res.status(500).json({ error: upErr.message });
  }

  return res.json({ ok: true, avatar_url: fromMessage || null });
});

app.post('/api/profile/avatar', async (req, res) => {
  const { wallet, message, signature, imageBase64, mimeType } = req.body ?? {};

  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string' ||
    typeof imageBase64 !== 'string' ||
    typeof mimeType !== 'string'
  ) {
    return res.status(400).json({
      error: 'Missing wallet, message, signature, imageBase64, or mimeType',
    });
  }

  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }

  if (!messageLooksLikeAvatarUpload(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid avatar upload message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { data: row } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('wallet', walletOk)
    .maybeSingle();
  if (!row) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const ext = EXT_BY_MIME[mimeType];
  if (!ext) {
    return res.status(400).json({ error: 'Unsupported image type' });
  }

  let buf;
  try {
    buf = Buffer.from(imageBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid image data' });
  }
  if (buf.length > 2 * 1024 * 1024) {
    return res.status(400).json({ error: 'Image must be 2MB or smaller' });
  }
  if (buf.length === 0) {
    return res.status(400).json({ error: 'Empty image' });
  }

  const path = `${walletOk}/avatar.${ext}`;
  const { error: stErr } = await supabase.storage.from('avatars').upload(path, buf, {
    contentType: mimeType,
    upsert: true,
    cacheControl: '3600',
  });

  if (stErr) {
    console.error(stErr);
    return res.status(500).json({
      error:
        stErr.message ||
        'Storage upload failed. Create the avatars bucket (see for_developers/sql/003_storage_avatars.sql).',
    });
  }

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) {
    return res.status(500).json({ error: 'Could not build public URL for avatar' });
  }

  const { error: upErr } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('wallet', walletOk);

  if (upErr) {
    console.error(upErr);
    return res.status(500).json({ error: upErr.message });
  }

  return res.json({ ok: true, avatar_url: publicUrl });
});

const POST_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_BATCH_POST_IDS = 50;

/** Quick check that this process has forum vote routes (curl /api/forum in dev). */
app.get('/api/forum', (_req, res) => {
  res.json({ ok: true, voteRoutes: true });
});

function compiledInstructionDataToBuffer(ix) {
  const d = ix?.data;
  if (d == null) return null;
  if (Buffer.isBuffer(d)) return d;
  if (d instanceof Uint8Array) return Buffer.from(d);
  if (Array.isArray(d)) return Buffer.from(d);
  if (typeof d === 'string') {
    try {
      return Buffer.from(bs58.decode(d));
    } catch {
      try {
        return Buffer.from(d, 'base64');
      } catch {
        return null;
      }
    }
  }
  return null;
}

function extractMemoUtf8StringsFromTransaction(txResponse) {
  const msg = txResponse?.transaction?.message;
  if (!msg) return [];
  const out = [];
  if (msg.version === 'legacy') {
    const keys = msg.accountKeys;
    for (const ix of msg.instructions) {
      const pid = keys[ix.programIdIndex];
      if (pid && pid.equals(MEMO_PROGRAM_ID)) {
        const buf = compiledInstructionDataToBuffer(ix);
        if (buf && buf.length) out.push(buf.toString('utf8'));
      }
    }
  } else {
    const keys = msg.getAccountKeys();
    for (const ix of msg.compiledInstructions) {
      const pid = keys.get(ix.programIdIndex);
      if (pid && pid.equals(MEMO_PROGRAM_ID)) {
        const buf = compiledInstructionDataToBuffer(ix);
        if (buf && buf.length) out.push(buf.toString('utf8'));
      }
    }
  }
  return out;
}

function parseLigderCompactMemo(memo) {
  const raw = String(memo ?? '');
  const parts = raw.split('|');
  if (parts[0] !== 'v1') {
    return { ok: false, error: 'Not a Ligder v1 pipe memo', raw };
  }
  const kind = parts[1];
  if (kind === 'tc') {
    if (parts.length < 10) {
      return { ok: false, error: 'Unexpected field count for thread memo', raw };
    }
    return {
      ok: true,
      kind: 'thread_create',
      bodyPostId: parts[5],
      boardId: parts[2],
      threadNumber: parts[3],
      threadId: parts[4],
      bodySha256Hex: parts[8],
      rows: [
        { idx: 1, label: 'Format version', value: parts[0] },
        { idx: 2, label: 'Kind', value: 'thread_create (tc)' },
        { idx: 3, label: 'Board id', value: parts[2] },
        { idx: 4, label: 'Thread number', value: parts[3] },
        { idx: 5, label: 'Thread UUID (thread_id)', value: parts[4] },
        { idx: 6, label: 'Opening post UUID (post_id)', value: parts[5] },
        { idx: 7, label: 'Author wallet', value: parts[6] },
        { idx: 8, label: 'Title SHA-256 (hex)', value: parts[7] },
        { idx: 9, label: 'Body SHA-256 (hex)', value: parts[8] },
        { idx: 10, label: 'LITE holdings snapshot (UI)', value: parts[9] || '—' },
      ],
    };
  }
  if (kind === 'rp') {
    if (parts.length < 10) {
      return { ok: false, error: 'Unexpected field count for reply memo', raw };
    }
    return {
      ok: true,
      kind: 'reply_create',
      bodyPostId: parts[5],
      boardId: parts[2],
      threadNumber: parts[3],
      threadId: parts[4],
      bodySha256Hex: parts[8],
      rows: [
        { idx: 1, label: 'Format version', value: parts[0] },
        { idx: 2, label: 'Kind', value: 'reply_create (rp)' },
        { idx: 3, label: 'Board id', value: parts[2] },
        { idx: 4, label: 'Thread number', value: parts[3] },
        { idx: 5, label: 'Thread UUID (thread_id)', value: parts[4] },
        { idx: 6, label: 'This reply post UUID (post_id)', value: parts[5] },
        { idx: 7, label: 'Parent post UUID', value: parts[6] },
        { idx: 8, label: 'Author wallet', value: parts[7] },
        { idx: 9, label: 'Body SHA-256 (hex)', value: parts[8] },
        { idx: 10, label: 'LITE holdings snapshot (UI)', value: parts[9] || '—' },
      ],
    };
  }
  if (kind === 'pv') {
    if (parts.length < 9) {
      return { ok: false, error: 'Unexpected field count for vote memo', raw };
    }
    return {
      ok: true,
      kind: 'post_vote',
      bodyPostId: parts[5],
      boardId: parts[2],
      threadNumber: parts[3],
      threadId: parts[4],
      rows: [
        { idx: 1, label: 'Format version', value: parts[0] },
        { idx: 2, label: 'Kind', value: 'post_vote (pv)' },
        { idx: 3, label: 'Board id', value: parts[2] },
        { idx: 4, label: 'Thread number', value: parts[3] },
        { idx: 5, label: 'Thread UUID (thread_id)', value: parts[4] },
        { idx: 6, label: 'Voted post UUID (post_id)', value: parts[5] },
        { idx: 7, label: 'Author wallet', value: parts[6] },
        { idx: 8, label: 'Action', value: parts[7] },
        { idx: 9, label: 'LITE holdings snapshot (UI)', value: parts[8] || '—' },
      ],
    };
  }
  if (kind === 'pm') {
    if (parts.length < 6) {
      return { ok: false, error: 'Unexpected field count for PM memo', raw };
    }
    return {
      ok: true,
      kind: 'pm_send',
      rows: [
        { idx: 1, label: 'Format version', value: parts[0] },
        { idx: 2, label: 'Kind', value: 'pm_send (pm)' },
        { idx: 3, label: 'PM UUID', value: parts[2] },
        { idx: 4, label: 'From wallet', value: parts[3] },
        { idx: 5, label: 'To wallet', value: parts[4] },
        { idx: 6, label: 'Cipher SHA-256 (hex)', value: parts[5] },
      ],
    };
  }
  return { ok: false, error: `Unknown memo kind: ${kind}`, raw };
}

const PUBLIC_MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const PUBLIC_DEVNET_RPC = 'https://api.devnet.solana.com';

function uniqueRpcUrls(urls) {
  const seen = new Set();
  return urls.filter((u) => typeof u === 'string' && u.length > 0 && !seen.has(u) && seen.add(u));
}

function rpcLabelForUrl(url) {
  if (url === PUBLIC_DEVNET_RPC) return 'devnet (public)';
  if (url === PUBLIC_MAINNET_RPC) return 'mainnet (public)';
  return 'configured RPC';
}

/** Try several RPCs / commitments — "not found" is often mainnet vs devnet mismatch. */
async function getTransactionForDecode(signature, networkMode) {
  const userRpc = (SOLANA_MEMO_RPC_URL || SOLANA_RPC_URL || '').trim();
  let ordered = [];
  if (networkMode === 'devnet') {
    ordered = [PUBLIC_DEVNET_RPC];
  } else if (networkMode === 'mainnet') {
    ordered = uniqueRpcUrls([userRpc, PUBLIC_MAINNET_RPC]);
  } else {
    ordered = uniqueRpcUrls([userRpc, PUBLIC_MAINNET_RPC, PUBLIC_DEVNET_RPC]);
  }
  const commitments = ['confirmed', 'finalized'];
  for (const url of ordered) {
    const conn = new Connection(url, 'confirmed');
    for (const commitment of commitments) {
      try {
        const tx = await conn.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment,
        });
        if (tx) {
          return {
            tx,
            rpcUrl: url,
            rpcLabel: rpcLabelForUrl(url),
            commitment,
          };
        }
      } catch (_) {
        // try next
      }
    }
  }
  return { tx: null, rpcUrl: null, rpcLabel: null, commitment: null };
}

/** Decode a Solana tx by signature: extract Memo program data and parse Ligder compact format */
app.get('/api/forum/decode-memo-tx', async (req, res) => {
  const signature = String(req.query.signature ?? '').trim();
  const networkRaw = String(req.query.network ?? 'auto').trim().toLowerCase();
  const networkMode =
    networkRaw === 'devnet' ? 'devnet' : networkRaw === 'mainnet' ? 'mainnet' : 'auto';
  if (!signature) {
    return res.status(400).json({ error: 'Missing signature query param' });
  }
  try {
    const { tx, rpcUrl, rpcLabel, commitment } = await getTransactionForDecode(
      signature,
      networkMode
    );
    if (!tx) {
      return res.status(404).json({
        error:
          'Transaction not found on the RPC(s) tried. Copy the full signature from Solscan, check the tx exists, ' +
          'or set Network to Devnet if this was a devnet tx. Mainnet attestations: ensure SOLANA_RPC_URL can read mainnet.',
        networkMode,
      });
    }
    const memos = extractMemoUtf8StringsFromTransaction(tx);
    let feePayer = null;
    try {
      const msg = tx.transaction.message;
      if (msg.version === 'legacy') {
        feePayer = msg.accountKeys[0]?.toBase58() ?? null;
      } else {
        feePayer = msg.staticAccountKeys[0]?.toBase58() ?? null;
      }
    } catch (_) {
      feePayer = null;
    }
    const parsed = memos.map((m) => parseLigderCompactMemo(m));
    const onDevnet = rpcUrl === PUBLIC_DEVNET_RPC;
    return res.json({
      signature,
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
      feePayer,
      memos,
      parsed,
      rpcUsed: rpcUrl,
      rpcLabel,
      commitment,
      networkMode,
      solscanCluster: onDevnet ? 'devnet' : 'mainnet',
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : 'Failed to decode transaction',
    });
  }
});

// Archive feed (recent on-chain attestations)
app.get('/api/forum/onchain-attestations', async (req, res) => {
  const rawLimit = String(req.query.limit ?? '').trim();
  const rawOffset = String(req.query.offset ?? '').trim();
  const kind = String(req.query.kind ?? '').trim();
  const wallet = String(req.query.wallet ?? '').trim();
  const statusFilter = String(req.query.status ?? '').trim().toLowerCase();
  const orderParam = String(req.query.order ?? 'desc').trim().toLowerCase();
  const ascending = orderParam === 'asc';

  const limit = Math.min(100, Math.max(1, parseInt(rawLimit || '100', 10) || 100));
  const offset = Math.max(0, parseInt(rawOffset || '0', 10) || 0);
  const rangeEnd = offset + limit - 1;

  try {
    let q = supabase
      .from('forum_onchain_attestations')
      .select(
        'id,kind,board_id,thread_id,post_id,thread_number,author_wallet,author_username,title_sha256,body_sha256,lite_holdings_ui,status,attempts,last_error,tx_sig,fee_payer,created_at,updated_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending })
      .order('id', { ascending })
      .range(offset, rangeEnd);
    if (kind) q = q.eq('kind', kind);
    if (wallet) q = q.eq('author_wallet', wallet);
    if (statusFilter && ['confirmed', 'pending', 'failed'].includes(statusFilter)) {
      q = q.eq('status', statusFilter);
    }
    const { data, error, count } = await q;
    if (error) {
      const m = String(error.message ?? '');
      if (/does not exist|relation/i.test(m)) {
        return res
          .status(500)
          .json({ error: 'Run SQL migrations 011 + 012 on the database' });
      }
      console.error(error);
      return res.status(500).json({ error: error.message });
    }
    const total = typeof count === 'number' ? count : 0;
    return res.json({
      attestations: data ?? [],
      total,
      limit,
      offset,
      hasMore: offset + (data?.length ?? 0) < total,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Attestation feed failed' });
  }
});

function messageLooksLikePostVote(message, wallet, postId, action) {
  if (!message || typeof message !== 'string') return false;
  if (!['up', 'down', 'clear'].includes(action)) return false;
  return (
    message.includes('Ligder forum post vote') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes(`Post: ${postId}`) &&
    message.includes(`Action: ${action}`) &&
    message.includes('Nonce:')
  );
}

function normalizePostIds(raw) {
  const list = String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length > MAX_BATCH_POST_IDS) return null;
  const out = [];
  const seen = new Set();
  for (const id of list) {
    if (!POST_ID_RE.test(id)) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

app.get('/api/forum/post-votes', async (req, res) => {
  const postIds = normalizePostIds(req.query.postIds);
  if (!postIds) {
    return res.status(400).json({
      error: `Invalid or too many postIds (max ${MAX_BATCH_POST_IDS}, alphanumeric with _ -)`,
    });
  }
  if (postIds.length === 0) {
    return res.json({ votes: {} });
  }

  let walletOk = null;
  const w = String(req.query.wallet ?? '').trim();
  if (w) {
    try {
      walletOk = new PublicKey(w).toBase58();
    } catch {
      return res.status(400).json({ error: 'Invalid wallet' });
    }
  }

  const { data: rows, error } = await supabase
    .from('forum_post_votes')
    .select('post_id, vote, voter_wallet')
    .in('post_id', postIds);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  /** @type {Record<string, { up: number; down: number; myVote: number | null }>} */
  const votes = {};
  for (const id of postIds) {
    votes[id] = { up: 0, down: 0, myVote: null };
  }
  for (const row of rows ?? []) {
    const p = votes[row.post_id];
    if (!p) continue;
    if (row.vote === 1) p.up += 1;
    else if (row.vote === -1) p.down += 1;
    if (walletOk && row.voter_wallet === walletOk) {
      p.myVote = row.vote;
    }
  }

  return res.json({ votes });
});

app.post('/api/forum/post-votes', async (req, res) => {
  const { wallet, message, signature, postId, action } = req.body ?? {};

  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string' ||
    typeof postId !== 'string' ||
    typeof action !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  if (!['up', 'down', 'clear'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  if (!POST_ID_RE.test(postId)) {
    return res.status(400).json({ error: 'Invalid post id' });
  }

  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }

  if (!messageLooksLikePostVote(message, walletOk, postId, action)) {
    return res.status(400).json({ error: 'Invalid vote message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('wallet', walletOk)
    .maybeSingle();
  if (!profile) {
    return res.status(403).json({ error: 'Register a profile to vote' });
  }

  const { data: postRow, error: postErr } = await supabase
    .from('forum_thread_posts')
    .select('id, thread_id')
    .eq('id', postId)
    .maybeSingle();
  if (postErr) {
    console.error(postErr);
    return res.status(500).json({ error: postErr.message });
  }
  if (!postRow) {
    return res.status(404).json({ error: 'Post not found' });
  }

  let threadNum = null;
  let threadBoardId = null;
  const { data: thRow, error: thErr } = await supabase
    .from('forum_threads')
    .select('board_id, thread_number')
    .eq('id', postRow.thread_id)
    .maybeSingle();
  if (thErr) {
    console.error(thErr);
  } else if (thRow && Number.isFinite(Number(thRow.thread_number))) {
    threadNum = Number(thRow.thread_number);
    threadBoardId = thRow.board_id ?? null;
  } else if (thRow) {
    threadBoardId = thRow.board_id ?? null;
  }

  if (!threadBoardId) {
    return res.status(500).json({ error: 'Thread board lookup failed' });
  }

  const nowIso = new Date().toISOString();

  if (action === 'clear') {
    const { error: delErr } = await supabase
      .from('forum_post_votes')
      .delete()
      .eq('post_id', postId)
      .eq('voter_wallet', walletOk);
    if (delErr) {
      console.error(delErr);
      return res.status(500).json({ error: delErr.message });
    }
  } else {
    const voteVal = action === 'up' ? 1 : -1;
    const { error: upErr } = await supabase.from('forum_post_votes').upsert(
      {
        post_id: postId,
        voter_wallet: walletOk,
        vote: voteVal,
        updated_at: nowIso,
      },
      { onConflict: 'post_id,voter_wallet' }
    );
    if (upErr) {
      console.error(upErr);
      return res.status(500).json({ error: upErr.message });
    }
  }

  const { data: agg } = await supabase
    .from('forum_post_votes')
    .select('vote, voter_wallet')
    .eq('post_id', postId);

  let up = 0;
  let down = 0;
  let myVote = null;
  for (const row of agg ?? []) {
    if (row.vote === 1) up += 1;
    else if (row.vote === -1) down += 1;
    if (row.voter_wallet === walletOk) {
      myVote = row.vote;
    }
  }

  let onchain_tx_sig = null;
  let onchain_status = null;
  if (action === 'up' || action === 'down') {
    try {
      let lite_holdings_ui = null;
      try {
        lite_holdings_ui = await fetchLiteHoldingsUi(walletOk);
      } catch {
        lite_holdings_ui = null;
      }
      const memoText = compactVoteMemo({
        board_id: threadBoardId,
        thread_number: threadNum,
        thread_id: postRow.thread_id,
        post_id: postId,
        wallet: walletOk,
        action,
        lite_holdings_ui,
      });
      const queued = await queueOnchainAttestation({
        kind: 'post_vote',
        board_id: threadBoardId,
        thread_id: postRow.thread_id,
        post_id: postId,
        thread_number: threadNum,
        author_wallet: walletOk,
        author_username: null,
        title_sha256: null,
        // Keep 011 schema compatibility (body_sha256 NOT NULL) with a deterministic action hash.
        body_sha256: sha256Hex(`${postId}:${action}`),
        lite_holdings_ui: lite_holdings_ui ?? null,
        memo: memoText,
        fee_payer: memoFeePayer ? memoFeePayer.publicKey.toBase58() : 'unknown',
      });
      if (queued.ok && queued.tx_sig) {
        onchain_tx_sig = queued.tx_sig;
        onchain_status = 'confirmed';
      } else {
        onchain_status = 'failed';
      }
    } catch (e) {
      console.error(e);
    }
  }

  return res.json({
    ok: true,
    postId,
    up,
    down,
    myVote,
    onchain_tx_sig,
    onchain_status,
  });
});

app.get('/api/forum/boards', async (req, res) => {
  const section = String(req.query.section ?? '').trim();
  const walletQ = String(req.query.wallet ?? '').trim();
  let walletOk = null;
  if (walletQ) {
    try {
      walletOk = new PublicKey(walletQ).toBase58();
    } catch {
      return res.status(400).json({ error: 'Invalid wallet' });
    }
  }
  let q = supabase.from('forum_boards').select('*').order('sort_order', { ascending: true });
  if (section) {
    q = q.eq('section', section);
  }
  const { data, error } = await q;
  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
  let boards = data ?? [];
  const hasGovernance = boards.some((b) => isGovernanceSectionName(b.section));
  if (hasGovernance) {
    const allowGovernance = walletOk
      ? await hasGovernanceAccessForWallet(walletOk)
      : false;
    if (!allowGovernance) {
      if (isGovernanceSectionName(section)) {
        return res.status(403).json({
          error:
            'Governance section requires >= 0.25% supply holdings (2,500,000 LITE).',
        });
      }
      boards = boards.filter((b) => !isGovernanceSectionName(b.section));
    }
  }
  const ids = boards.map((b) => b.id);
  if (ids.length === 0) {
    return res.json({ boards: [] });
  }

  const { data: threadRows, error: tErr } = await supabase
    .from('forum_threads')
    .select('board_id, posts_count, updated_at, title, id')
    .in('board_id', ids);

  if (tErr) {
    console.error(tErr);
    return res.status(500).json({ error: tErr.message });
  }

  /** @type {Record<string, { topics: number; posts: number; last: { title: string; updated_at: string; thread_id: string } | null }>} */
  const agg = {};
  for (const id of ids) {
    agg[id] = { topics: 0, posts: 0, last: null };
  }
  for (const t of threadRows ?? []) {
    const a = agg[t.board_id];
    if (!a) continue;
    a.topics += 1;
    a.posts += 1 + (Number(t.posts_count) || 0);
    const u = new Date(t.updated_at).getTime();
    if (!a.last || u > new Date(a.last.updated_at).getTime()) {
      a.last = { title: t.title, updated_at: t.updated_at, thread_id: String(t.id) };
    }
  }

  const enriched = boards.map((b) => {
    const a = agg[b.id] ?? { topics: 0, posts: 0, last: null };
    const lastPost = a.last
      ? `${a.last.title} — ${new Date(a.last.updated_at).toLocaleString()}`
      : '—';
    return {
      ...b,
      topics_count: a.topics,
      posts_count: a.posts,
      last_post: lastPost,
      last_thread_id: a.last?.thread_id ?? null,
    };
  });

  res.set(
    'Cache-Control',
    'public, max-age=15, s-maxage=15, stale-while-revalidate=60'
  );
  return res.json({ boards: enriched });
});

app.get('/api/forum/boards/:slug/threads', async (req, res) => {
  const slug = String(req.params.slug ?? '').trim();
  if (!slug) {
    return res.status(400).json({ error: 'Missing board' });
  }

  const { data: board, error: bErr } = await supabase
    .from('forum_boards')
    .select('*')
    .eq('id', slug)
    .maybeSingle();

  if (bErr) {
    console.error(bErr);
    return res.status(500).json({ error: bErr.message });
  }
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  if (isGovernanceSectionName(board.section)) {
    const walletQ = String(req.query.wallet ?? '').trim();
    let walletOk = null;
    if (walletQ) {
      try {
        walletOk = new PublicKey(walletQ).toBase58();
      } catch {
        return res.status(400).json({ error: 'Invalid wallet' });
      }
    }
    const allowGovernance = walletOk
      ? await hasGovernanceAccessForWallet(walletOk)
      : false;
    if (!allowGovernance) {
      return res.status(403).json({
        error:
          'Governance board requires >= 0.25% supply holdings (2,500,000 LITE).',
      });
    }
  }

  const { data: threads, error: tErr } = await supabase
    .from('forum_threads')
    .select('*')
    .eq('board_id', slug)
    .order('updated_at', { ascending: false });

  if (tErr) {
    console.error(tErr);
    return res.status(500).json({ error: tErr.message });
  }

  const list = threads ?? [];
  const wallets = [...new Set(list.map((t) => t.author_wallet))];
  let authorMap = {};
  if (wallets.length > 0) {
    const { data: authors } = await supabase
      .from('profiles')
      .select('wallet, username')
      .in('wallet', wallets);
    authorMap = Object.fromEntries((authors ?? []).map((a) => [a.wallet, a.username]));
  }

  const threadsOut = list.map((t) => ({
    ...t,
    author_username: authorMap[t.author_wallet] ?? null,
  }));

  // Attach on-chain memo tx signatures (best-effort; only for thread creation).
  try {
    const ids = threadsOut.map((t) => t.id).filter(Boolean);
    if (ids.length > 0) {
      const { data: atts, error: aErr } = await supabase
        .from('forum_onchain_attestations')
        .select('thread_id, tx_sig, kind, status')
        .in('thread_id', ids)
        .eq('kind', 'thread_create');
      if (!aErr && atts?.length) {
        const byThread = new Map(
          atts.map((a) => [
            String(a.thread_id),
            { tx_sig: a.tx_sig ? String(a.tx_sig) : null, status: String(a.status ?? 'confirmed') },
          ])
        );
        for (const t of threadsOut) {
          const v = byThread.get(String(t.id));
          t.onchain_tx_sig = v?.tx_sig ?? null;
          t.onchain_status = v?.status ?? null;
        }
      } else if (aErr) {
        const m = String(aErr.message ?? '');
        if (!/does not exist|relation/i.test(m)) {
          console.error(aErr);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  return res.json({ board, threads: threadsOut });
});

app.post('/api/forum/threads', async (req, res) => {
  const { wallet, message, signature } = req.body ?? {};
  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }

  if (!messageLooksLikeForumNewThread(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid new-thread message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const parsed = parseForumNewThreadMessage(message);
  if (!parsed) {
    return res
      .status(400)
      .json({ error: 'Could not parse board or title from message' });
  }

  const { board_id, title, body } = parsed;
  if (title.length < 1 || title.length > 200) {
    return res.status(400).json({ error: 'Title must be 1–200 characters' });
  }
  if (/[\r\n]/.test(title)) {
    return res.status(400).json({ error: 'Title cannot contain line breaks' });
  }
  const bodyTrim = body.trim();
  if (bodyTrim.length < 1) {
    return res.status(400).json({ error: 'Opening post body is required' });
  }
  if (bodyTrim.length > FORUM_OP_BODY_MAX) {
    return res
      .status(400)
      .json({ error: `Body must be at most ${FORUM_OP_BODY_MAX} characters` });
  }

  const { data: board, error: bErr } = await supabase
    .from('forum_boards')
    .select('*')
    .eq('id', board_id)
    .maybeSingle();

  if (bErr) {
    console.error(bErr);
    return res.status(500).json({ error: bErr.message });
  }
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  if (isGovernanceSectionName(board.section)) {
    const allowGovernance = await hasGovernanceAccessForWallet(walletOk);
    if (!allowGovernance) {
      return res.status(403).json({
        error:
          'Governance board requires >= 0.25% supply holdings (2,500,000 LITE).',
      });
    }
  }

  let profile;
  {
    const pr = await supabase
      .from('profiles')
      .select('wallet, is_admin, is_moderator, threads_started, username')
      .eq('wallet', walletOk)
      .maybeSingle();
    if (pr.error && supabaseErrorMissingColumn(pr.error, 'is_moderator')) {
      const pr2 = await supabase
        .from('profiles')
        .select('wallet, is_admin, threads_started, username')
        .eq('wallet', walletOk)
        .maybeSingle();
      if (pr2.error) {
        console.error(pr2.error);
        return res.status(500).json({ error: pr2.error.message });
      }
      profile = pr2.data ? { ...pr2.data, is_moderator: false } : null;
    } else if (pr.error) {
      console.error(pr.error);
      return res.status(500).json({ error: pr.error.message });
    } else {
      profile = pr.data
        ? { ...pr.data, is_moderator: pr.data.is_moderator === true }
        : null;
    }
  }

  if (!profile) {
    return res.status(403).json({ error: 'Register before starting a thread' });
  }

  const banThread = await getActiveBan(walletOk);
  if (banThread) {
    return res.status(403).json({
      error: `You are banned until ${new Date(banThread.banned_until).toLocaleString()}.`,
    });
  }

  let minStart = board.min_rank_start_thread;
  if (minStart == null || minStart === '') {
    minStart = board.admin_only_post ? 'administrator' : 'member';
  }
  if (!rankAllows(profile, minStart)) {
    return res.status(403).json({
      error: 'Your rank is not allowed to start threads in this board',
    });
  }

  const { data: maxRows, error: maxErr } = await supabase
    .from('forum_threads')
    .select('thread_number')
    .eq('board_id', board_id)
    .order('thread_number', { ascending: false })
    .limit(1);

  const nextThreadNumber = (Number(maxRows?.[0]?.thread_number) || 0) + 1;
  let insertPayload = {
    board_id,
    title,
    author_wallet: walletOk,
    thread_number: nextThreadNumber,
  };

  if (maxErr && supabaseErrorMissingColumn(maxErr, 'thread_number')) {
    insertPayload = { board_id, title, author_wallet: walletOk };
  } else if (maxErr) {
    console.error(maxErr);
    return res.status(500).json({ error: maxErr.message });
  }

  let { data: thread, error: insErr } = await supabase
    .from('forum_threads')
    .insert(insertPayload)
    .select('*')
    .single();

  if (
    insErr &&
    supabaseErrorMissingColumn(insErr, 'thread_number') &&
    insertPayload.thread_number !== undefined
  ) {
    ({ data: thread, error: insErr } = await supabase
      .from('forum_threads')
      .insert({ board_id, title, author_wallet: walletOk })
      .select('*')
      .single());
  }

  if (insErr) {
    console.error(insErr);
    return res.status(500).json({ error: insErr.message });
  }

  const { data: opPost, error: opErr } = await supabase
    .from('forum_thread_posts')
    .insert({
      thread_id: thread.id,
      parent_id: null,
      body: bodyTrim,
      author_wallet: walletOk,
    })
    .select('id, thread_id, parent_id, body, author_wallet, created_at')
    .single();

  if (opErr) {
    console.error(opErr);
    await supabase.from('forum_threads').delete().eq('id', thread.id);
    return res.status(500).json({ error: opErr.message });
  }

  const { error: fpErr } = await supabase.from('forum_posts').upsert(
    {
      id: opPost.id,
      thread_id: String(thread.id),
      author_wallet: walletOk,
    },
    { onConflict: 'id' }
  );
  if (fpErr) {
    console.error(fpErr);
  }

  const ts = Number(profile.threads_started) || 0;
  const { error: upProfErr } = await supabase
    .from('profiles')
    .update({ threads_started: ts + 1 })
    .eq('wallet', walletOk);

  if (upProfErr) {
    console.error(upProfErr);
  }

  // On-chain memo attestation (best-effort): store hashes + ids, not full body.
  let onchain_tx_sig = null;
  let onchain_status = null;
  try {
    const title_sha256 = sha256Hex(title);
    const body_sha256 = sha256Hex(bodyTrim);
    let lite_holdings_ui = null;
    try {
      lite_holdings_ui = await fetchLiteHoldingsUi(walletOk);
    } catch {
      lite_holdings_ui = null;
    }
    const memoText = compactThreadMemo({
      board_id,
      thread_number: Number(thread.thread_number) || null,
      thread_id: thread.id,
      post_id: opPost.id,
      wallet: walletOk,
      title_sha256,
      body_sha256,
      lite_holdings_ui,
    });
    const queued = await queueOnchainAttestation({
      kind: 'thread_create',
      board_id,
      thread_id: thread.id,
      post_id: opPost.id,
      thread_number: Number(thread.thread_number) || null,
      author_wallet: walletOk,
      author_username: profile.username ?? null,
      title_sha256,
      body_sha256,
      lite_holdings_ui: lite_holdings_ui ?? null,
      memo: memoText,
      fee_payer: memoFeePayer ? memoFeePayer.publicKey.toBase58() : 'unknown',
    });
    if (queued.ok && queued.tx_sig) {
      onchain_tx_sig = queued.tx_sig;
      onchain_status = 'confirmed';
    } else {
      onchain_status = 'failed';
    }
  } catch (e) {
    console.error(e);
  }

  return res.status(201).json({
    thread: {
      ...thread,
      author_username: profile.username ?? null,
      op_post_id: opPost.id,
      onchain_tx_sig,
      onchain_status,
    },
  });
});

app.get('/api/forum/boards/:slug/threads/:threadNum', async (req, res) => {
  const slug = String(req.params.slug ?? '').trim();
  const raw = String(req.params.threadNum ?? '').trim();
  if (!slug || !raw) {
    return res.status(400).json({ error: 'Invalid board or thread' });
  }

  const { data: board, error: bErr } = await supabase
    .from('forum_boards')
    .select('*')
    .eq('id', slug)
    .maybeSingle();

  if (bErr) {
    console.error(bErr);
    return res.status(500).json({ error: bErr.message });
  }
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  if (isGovernanceSectionName(board.section)) {
    const walletQ = String(req.query.wallet ?? '').trim();
    let walletOk = null;
    if (walletQ) {
      try {
        walletOk = new PublicKey(walletQ).toBase58();
      } catch {
        return res.status(400).json({ error: 'Invalid wallet' });
      }
    }
    const allowGovernance = walletOk
      ? await hasGovernanceAccessForWallet(walletOk)
      : false;
    if (!allowGovernance) {
      return res.status(403).json({
        error:
          'Governance board requires >= 0.25% supply holdings (2,500,000 LITE).',
      });
    }
  }

  let thread;
  let tErr;
  if (UUID_RE.test(raw)) {
    const resT = await supabase
      .from('forum_threads')
      .select('*')
      .eq('board_id', slug)
      .eq('id', raw)
      .maybeSingle();
    thread = resT.data;
    tErr = resT.error;
  } else {
    const threadNum = parseInt(raw, 10);
    if (!Number.isFinite(threadNum) || threadNum < 1) {
      return res.status(400).json({ error: 'Invalid thread number' });
    }
    const resIdx = await fetchForumThreadByBoardAndIndex(slug, threadNum);
    thread = resIdx.data;
    tErr = resIdx.error;
  }

  if (tErr) {
    console.error(tErr);
    return res.status(500).json({ error: tErr.message });
  }
  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  const { data: postRows, error: pErr } = await supabase
    .from('forum_thread_posts')
    .select('id, thread_id, parent_id, body, author_wallet, created_at')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true });

  if (pErr) {
    console.error(pErr);
    return res.status(500).json({ error: pErr.message });
  }

  const posts = postRows ?? [];
  const wallets = [...new Set(posts.map((p) => p.author_wallet))];
  let profMap = {};
  if (wallets.length > 0) {
    const { data: profs, error: profErr } = await supabase
      .from('profiles')
      .select('wallet, username, avatar_url, is_admin, is_moderator, lite_holdings_ui, github_handle, x_handle')
      .in('wallet', wallets);
    if (profErr && supabaseErrorMissingColumn(profErr, 'is_moderator')) {
      const { data: profs2 } = await supabase
        .from('profiles')
        .select('wallet, username, avatar_url, is_admin, lite_holdings_ui, github_handle, x_handle')
        .in('wallet', wallets);
      profMap = Object.fromEntries(
        (profs2 ?? []).map((p) => [p.wallet, { ...p, is_moderator: false }])
      );
    } else if (profErr) {
      console.error(profErr);
    } else {
      profMap = Object.fromEntries(
        (profs ?? []).map((p) => [
          p.wallet,
          { ...p, is_moderator: p.is_moderator === true },
        ])
      );
    }
  }

  const postsOut = posts.map((p) => {
    const pr = profMap[p.author_wallet];
    return {
      ...p,
      author_username: pr?.username ?? null,
      author_is_admin: pr?.is_admin === true,
      author_is_moderator: pr?.is_moderator === true && pr?.is_admin !== true,
      author_avatar_url: pr?.avatar_url ?? null,
      author_lite_holdings_ui: pr?.lite_holdings_ui ?? null,
      author_github_handle: pr?.github_handle ?? null,
      author_x_handle: pr?.x_handle ?? null,
    };
  });

  const threadAuthor = profMap[thread.author_wallet];
  const threadOut = {
    ...thread,
    author_username: threadAuthor?.username ?? null,
  };

  // Attach on-chain memo tx signatures (best-effort).
  try {
    const { data: atts, error: aErr } = await supabase
      .from('forum_onchain_attestations')
      .select('kind, thread_id, post_id, tx_sig, status')
      .eq('thread_id', thread.id);
    if (!aErr && atts?.length) {
      const byPost = new Map(
        atts
          .filter((a) => a.post_id)
          .map((a) => [
            String(a.post_id),
            { tx_sig: a.tx_sig ? String(a.tx_sig) : null, status: String(a.status ?? 'confirmed') },
          ])
      );
      const threadCreate = atts.find((a) => String(a.kind) === 'thread_create');
      threadOut.onchain_tx_sig = threadCreate?.tx_sig ? String(threadCreate.tx_sig) : null;
      threadOut.onchain_status = threadCreate ? String(threadCreate.status ?? 'confirmed') : null;
      for (const p of postsOut) {
        const v = byPost.get(String(p.id));
        p.onchain_tx_sig = v?.tx_sig ?? null;
        p.onchain_status = v?.status ?? null;
      }
    } else if (aErr) {
      const m = String(aErr.message ?? '');
      if (!/does not exist|relation/i.test(m)) {
        console.error(aErr);
      }
    }
  } catch (e) {
    console.error(e);
  }

  return res.json({ board, thread: threadOut, posts: postsOut });
});

app.post('/api/forum/thread-replies', async (req, res) => {
  const { wallet, message, signature } = req.body ?? {};
  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }

  if (!messageLooksLikeForumThreadReply(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid thread reply message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const parsed = parseForumThreadReplyMessage(message);
  if (!parsed) {
    return res
      .status(400)
      .json({ error: 'Could not parse reply (board, thread, parent, or body)' });
  }

  const { board_id, thread_number, parent_post, body } = parsed;
  const bodyTrim = body.trim();
  if (bodyTrim.length < 1) {
    return res.status(400).json({ error: 'Reply body is required' });
  }
  if (bodyTrim.length > FORUM_REPLY_BODY_MAX) {
    return res.status(400).json({
      error: `Reply must be at most ${FORUM_REPLY_BODY_MAX} characters`,
    });
  }

  const { data: board, error: bErr } = await supabase
    .from('forum_boards')
    .select('*')
    .eq('id', board_id)
    .maybeSingle();

  if (bErr) {
    console.error(bErr);
    return res.status(500).json({ error: bErr.message });
  }
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  if (isGovernanceSectionName(board.section)) {
    const allowGovernance = await hasGovernanceAccessForWallet(walletOk);
    if (!allowGovernance) {
      return res.status(403).json({
        error:
          'Governance board requires >= 0.25% supply holdings (2,500,000 LITE).',
      });
    }
  }

  const resThread = await fetchForumThreadByBoardAndIndex(board_id, thread_number);
  const thread = resThread.data;
  const tErr = resThread.error;

  if (tErr) {
    console.error(tErr);
    return res.status(500).json({ error: tErr.message });
  }
  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  const { data: allPosts, error: apErr } = await supabase
    .from('forum_thread_posts')
    .select('id, parent_id, created_at')
    .eq('thread_id', thread.id);

  if (apErr) {
    console.error(apErr);
    return res.status(500).json({ error: apErr.message });
  }

  const list = allPosts ?? [];
  const op = list
    .filter((p) => p.parent_id === null)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
  if (!op) {
    return res.status(500).json({ error: 'Thread has no opening post' });
  }

  let parentId = null;
  if (parent_post === 'root') {
    parentId = op.id;
  } else {
    if (!UUID_RE.test(parent_post)) {
      return res.status(400).json({ error: 'Invalid parent post id' });
    }
    const parentRow = list.find((p) => p.id === parent_post);
    if (!parentRow) {
      return res.status(400).json({ error: 'Parent post not in this thread' });
    }
    parentId = parent_post;
  }

  let profile;
  {
    const pr = await supabase
      .from('profiles')
      .select(
        'wallet, username, posts_count, is_admin, is_moderator, avatar_url, lite_holdings_ui, github_handle, x_handle'
      )
      .eq('wallet', walletOk)
      .maybeSingle();
    if (pr.error && supabaseErrorMissingColumn(pr.error, 'is_moderator')) {
      const pr2 = await supabase
        .from('profiles')
        .select(
          'wallet, username, posts_count, is_admin, avatar_url, lite_holdings_ui, github_handle, x_handle'
        )
        .eq('wallet', walletOk)
        .maybeSingle();
      if (pr2.error) {
        console.error(pr2.error);
        return res.status(500).json({ error: pr2.error.message });
      }
      profile = pr2.data ? { ...pr2.data, is_moderator: false } : null;
    } else if (pr.error) {
      console.error(pr.error);
      return res.status(500).json({ error: pr.error.message });
    } else {
      profile = pr.data
        ? { ...pr.data, is_moderator: pr.data.is_moderator === true }
        : null;
    }
  }

  if (!profile) {
    return res.status(403).json({ error: 'Register before replying' });
  }

  const banReply = await getActiveBan(walletOk);
  if (banReply) {
    return res.status(403).json({
      error: `You are banned until ${new Date(banReply.banned_until).toLocaleString()}.`,
    });
  }

  let minReply = board.min_rank_reply;
  if (minReply == null || minReply === '') {
    minReply = 'member';
  }
  if (!rankAllows(profile, minReply)) {
    return res.status(403).json({
      error: 'Your rank is not allowed to reply in this board',
    });
  }

  const { data: newPost, error: insErr } = await supabase
    .from('forum_thread_posts')
    .insert({
      thread_id: thread.id,
      parent_id: parentId,
      body: bodyTrim,
      author_wallet: walletOk,
    })
    .select('id, thread_id, parent_id, body, author_wallet, created_at')
    .single();

  if (insErr) {
    console.error(insErr);
    return res.status(500).json({ error: insErr.message });
  }

  const { error: fpErr } = await supabase.from('forum_posts').upsert(
    {
      id: newPost.id,
      thread_id: String(thread.id),
      author_wallet: walletOk,
    },
    { onConflict: 'id' }
  );
  if (fpErr) {
    console.error(fpErr);
  }

  const prevCount = Number(thread.posts_count);
  const { error: thUpErr } = await supabase
    .from('forum_threads')
    .update({
      posts_count: (Number.isFinite(prevCount) ? prevCount : 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', thread.id);

  if (thUpErr) {
    console.error(thUpErr);
  }

  const pc = Number(profile.posts_count) || 0;
  const { error: profUpErr } = await supabase
    .from('profiles')
    .update({ posts_count: pc + 1 })
    .eq('wallet', walletOk);

  if (profUpErr) {
    console.error(profUpErr);
  }

  // On-chain memo attestation (best-effort) for reply.
  let onchain_tx_sig = null;
  let onchain_status = null;
  try {
    const body_sha256 = sha256Hex(bodyTrim);
    let lite_holdings_ui = null;
    try {
      lite_holdings_ui = await fetchLiteHoldingsUi(walletOk);
    } catch {
      lite_holdings_ui = null;
    }
    const memoText = compactReplyMemo({
      board_id,
      thread_number: Number(thread.thread_number) || null,
      thread_id: thread.id,
      post_id: newPost.id,
      parent_post_id: parentId,
      wallet: walletOk,
      body_sha256,
      lite_holdings_ui,
    });
    const queued = await queueOnchainAttestation({
      kind: 'reply_create',
      board_id,
      thread_id: thread.id,
      post_id: newPost.id,
      thread_number: Number(thread.thread_number) || null,
      author_wallet: walletOk,
      author_username: profile.username ?? null,
      title_sha256: null,
      body_sha256,
      lite_holdings_ui: lite_holdings_ui ?? null,
      memo: memoText,
      fee_payer: memoFeePayer ? memoFeePayer.publicKey.toBase58() : 'unknown',
    });
    if (queued.ok && queued.tx_sig) {
      onchain_tx_sig = queued.tx_sig;
      onchain_status = 'confirmed';
    } else {
      onchain_status = 'failed';
    }
  } catch (e) {
    console.error(e);
  }

  return res.status(201).json({
    post: {
      ...newPost,
      author_username: profile.username ?? null,
      author_is_admin: profile.is_admin === true,
      author_is_moderator: profile.is_moderator === true && profile.is_admin !== true,
      author_avatar_url: profile.avatar_url ?? null,
      author_lite_holdings_ui: profile.lite_holdings_ui ?? null,
      author_github_handle: profile.github_handle ?? null,
      author_x_handle: profile.x_handle ?? null,
      onchain_tx_sig,
      onchain_status,
    },
  });
});

/** Public read of post body by id (for memo decoder / deep links). SHA-256 in memos is not reversible. */
app.get('/api/forum/thread-posts/:postId', async (req, res) => {
  const postId = String(req.params.postId ?? '').trim();
  if (!UUID_RE.test(postId)) {
    return res.status(400).json({ error: 'Invalid post id' });
  }

  const { data: post, error: pErr } = await supabase
    .from('forum_thread_posts')
    .select('id, body, thread_id, parent_id, created_at')
    .eq('id', postId)
    .maybeSingle();
  if (pErr) {
    console.error(pErr);
    return res.status(500).json({ error: pErr.message });
  }
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const { data: th, error: tErr } = await supabase
    .from('forum_threads')
    .select('board_id, thread_number')
    .eq('id', post.thread_id)
    .maybeSingle();
  if (tErr) {
    console.error(tErr);
    return res.status(500).json({ error: tErr.message });
  }
  if (!th) {
    return res.status(500).json({ error: 'Thread not found for post' });
  }

  const { data: boardRow } = await supabase
    .from('forum_boards')
    .select('section')
    .eq('id', th.board_id)
    .maybeSingle();

  return res.json({
    id: post.id,
    body: post.body,
    thread_id: post.thread_id,
    parent_id: post.parent_id,
    created_at: post.created_at,
    board_id: th.board_id,
    thread_number: th.thread_number,
    forum_section: boardRow?.section ?? null,
  });
});

app.patch('/api/forum/thread-posts/:postId', async (req, res) => {
  const postIdParam = String(req.params.postId ?? '').trim();
  const { wallet, message, signature } = req.body ?? {};

  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }

  if (!UUID_RE.test(postIdParam)) {
    return res.status(400).json({ error: 'Invalid post id' });
  }

  if (!messageLooksLikeForumEditPost(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid edit post message' });
  }

  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const parsed = parseForumEditPostMessage(message);
  if (!parsed || !UUID_RE.test(parsed.post_id)) {
    return res.status(400).json({ error: 'Could not parse edit post' });
  }

  if (parsed.post_id !== postIdParam) {
    return res.status(400).json({ error: 'Post id mismatch' });
  }

  const bodyTrim = String(parsed.body ?? '').trim();
  if (bodyTrim.length < 1) {
    return res.status(400).json({ error: 'Post body is required' });
  }
  if (bodyTrim.length > FORUM_EDIT_BODY_MAX) {
    return res.status(400).json({
      error: `Post must be at most ${FORUM_EDIT_BODY_MAX} characters`,
    });
  }

  const ban = await getActiveBan(walletOk);
  if (ban) {
    return res.status(403).json({
      error: `You are banned until ${new Date(ban.banned_until).toLocaleString()}.`,
    });
  }

  const { data: postRow, error: pErr } = await supabase
    .from('forum_thread_posts')
    .select('id, thread_id, parent_id, body, author_wallet')
    .eq('id', postIdParam)
    .maybeSingle();
  if (pErr) {
    console.error(pErr);
    return res.status(500).json({ error: pErr.message });
  }
  if (!postRow) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const isAuthor = postRow.author_wallet === walletOk;
  // Editing is author-only (admins can only edit their own posts).
  if (!isAuthor) {
    return res.status(403).json({ error: 'Not allowed to edit this post' });
  }

  const { data: updated, error: uErr } = await supabase
    .from('forum_thread_posts')
    .update({ body: bodyTrim })
    .eq('id', postIdParam)
    .select('id, thread_id, parent_id, body, author_wallet, created_at')
    .maybeSingle();

  if (uErr) {
    console.error(uErr);
    return res.status(500).json({ error: uErr.message });
  }

  if (!updated) {
    return res.status(404).json({ error: 'Post not found after update' });
  }

  return res.json({ ok: true, post: updated });
});

const RANK_NAME_SET = new Set(['member', 'moderator', 'administrator', 'none']);

function messageLooksLikeAdminBoardUpdate(message, wallet) {
  return (
    typeof message === 'string' &&
    message.includes('Ligder admin board update') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Board:') &&
    message.includes('min_rank_start_thread:') &&
    message.includes('min_rank_reply:') &&
    message.includes('Nonce:')
  );
}

function parseAdminBoardUpdate(message) {
  const boardLine = message.match(/^Board:\s*(.+)$/m);
  const mStart = message.match(/^min_rank_start_thread:\s*(\w+)$/m);
  const mReply = message.match(/^min_rank_reply:\s*(\w+)$/m);
  if (!boardLine || !mStart || !mReply) return null;
  const id = boardLine[1].trim();
  const a = mStart[1].toLowerCase();
  const b = mReply[1].toLowerCase();
  if (!RANK_NAME_SET.has(a) || !RANK_NAME_SET.has(b)) return null;
  return { board_id: id, min_rank_start_thread: a, min_rank_reply: b };
}

function messageLooksLikeAdminUserSearch(message, wallet) {
  return (
    typeof message === 'string' &&
    message.includes('Ligder admin user search') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Query:') &&
    message.includes('Nonce:')
  );
}

function parseAdminUserSearch(message) {
  const qLine = message.match(/^Query:\s*(.*)$/m);
  const q = (qLine?.[1] ?? '').trim().toLowerCase();
  if (q.length < 1 || q.length > 40) return null;
  return { query: q };
}

function messageLooksLikeAdminUserPatch(message, wallet) {
  return (
    typeof message === 'string' &&
    message.includes('Ligder admin user patch') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Target wallet:') &&
    message.includes('Nonce:')
  );
}

function parseAdminUserPatch(message) {
  const tw = message.match(/^Target wallet:\s*(.+)$/m);
  const un = message.match(/^username:\s*(.*)$/m);
  const mod = message.match(/^is_moderator:\s*(true|false)$/m);
  const adm = message.match(/^is_admin:\s*(true|false)$/m);
  if (!tw) return null;
  const usernameRaw = un ? un[1].trim() : '';
  const username =
    usernameRaw && usernameRaw !== '-' && usernameRaw !== '_'
      ? usernameRaw.toLowerCase()
      : null;
  return {
    target_wallet: tw[1].trim(),
    username,
    is_moderator: mod ? mod[1] === 'true' : null,
    is_admin: adm ? adm[1] === 'true' : null,
  };
}

function messageLooksLikeAdminBan(message, wallet) {
  return (
    typeof message === 'string' &&
    message.includes('Ligder admin ban user') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Target wallet:') &&
    message.includes('Days:') &&
    message.includes('Nonce:')
  );
}

function parseAdminBan(message) {
  const tw = message.match(/^Target wallet:\s*(.+)$/m);
  const d = message.match(/^Days:\s*(\d+)\s*$/m);
  if (!tw || !d) return null;
  const days = parseInt(d[1], 10);
  if (!Number.isFinite(days) || days < 1 || days > 365) return null;
  return { target_wallet: tw[1].trim(), days };
}

function messageLooksLikeAdminDeletePost(message, wallet) {
  return (
    typeof message === 'string' &&
    message.includes('Ligder admin delete post') &&
    message.includes(`Wallet: ${wallet}`) &&
    message.includes('Post id:') &&
    message.includes('Nonce:')
  );
}

function parseAdminDeletePost(message) {
  const id = message.match(/^Post id:\s*(.+)$/m);
  if (!id) return null;
  return { post_id: id[1].trim() };
}

app.get('/api/admin/session-nonce', (req, res) => {
  pruneAdminSessionNonces();
  const nonce = crypto.randomUUID();
  adminSessionNonces.set(nonce, Date.now());
  return res.json({ nonce });
});

app.post('/api/admin/session', async (req, res) => {
  const { wallet, message, signature } = req.body ?? {};
  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }
  if (!messageLooksLikeAdminSession(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid admin session message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const nonce = parseAdminSessionNonce(message);
  if (!nonce || !adminSessionNonces.has(nonce)) {
    return res
      .status(400)
      .json({ error: 'Invalid or expired nonce. Request a new one.' });
  }
  adminSessionNonces.delete(nonce);
  if (!(await verifyIsAdmin(walletOk))) {
    return res.status(403).json({ error: 'Administrator only' });
  }
  return res.json({ token: adminSessionCreateToken(walletOk) });
});

app.post('/api/admin/board-update', async (req, res) => {
  if (!(await requireAdminAuth(req, res))) return;
  const { board_id, min_rank_start_thread, min_rank_reply } = req.body ?? {};
  if (
    typeof board_id !== 'string' ||
    typeof min_rank_start_thread !== 'string' ||
    typeof min_rank_reply !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const a = min_rank_start_thread.toLowerCase();
  const b = min_rank_reply.toLowerCase();
  if (
    !['member', 'moderator', 'administrator'].includes(a) ||
    !['member', 'moderator', 'administrator', 'none'].includes(b)
  ) {
    return res.status(400).json({ error: 'Invalid rank values' });
  }
  const id = board_id.trim();
  if (!id) {
    return res.status(400).json({ error: 'Missing board id' });
  }
  const { error } = await supabase
    .from('forum_boards')
    .update({
      min_rank_start_thread: a,
      min_rank_reply: b,
    })
    .eq('id', id);
  if (error) {
    if (supabaseErrorMissingColumn(error, 'min_rank_start_thread')) {
      return res.status(500).json({
        error: 'Run SQL migration 009 (min_rank columns) on the database',
      });
    }
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
  return res.json({ ok: true });
});

app.post('/api/admin/users/search', async (req, res) => {
  if (!(await requireAdminAuth(req, res))) return;
  const { query: queryRaw } = req.body ?? {};
  if (typeof queryRaw !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const qTrim = queryRaw.trim().toLowerCase();
  if (qTrim.length < 1 || qTrim.length > 40) {
    return res.status(400).json({ error: 'Invalid query' });
  }
  const q = `%${qTrim}%`;
  const { data, error } = await supabase
    .from('profiles')
    .select('wallet, username, created_at, is_admin, is_moderator')
    .ilike('username', q)
    .limit(20);
  if (error) {
    if (supabaseErrorMissingColumn(error, 'is_moderator')) {
      const { data: d2, error: e2 } = await supabase
        .from('profiles')
        .select('wallet, username, created_at, is_admin')
        .ilike('username', q)
        .limit(20);
      if (e2) {
        console.error(e2);
        return res.status(500).json({ error: e2.message });
      }
      return res.json({
        users: (d2 ?? []).map((u) => ({ ...u, is_moderator: false })),
      });
    }
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
  return res.json({
    users: (data ?? []).map((u) => ({
      ...u,
      is_moderator: u.is_moderator === true,
      is_admin: u.is_admin === true,
    })),
  });
});

app.post('/api/admin/users/patch', async (req, res) => {
  if (!(await requireAdminAuth(req, res))) return;
  const { target_wallet, username, is_moderator, is_admin } = req.body ?? {};
  if (typeof target_wallet !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  let targetOk;
  try {
    targetOk = new PublicKey(target_wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid target wallet' });
  }
  const { data: targetRow } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('wallet', targetOk)
    .maybeSingle();
  if (!targetRow) {
    return res.status(404).json({ error: 'User not found' });
  }
  const patch = {};
  if (typeof username === 'string') {
    const u = username.trim().toLowerCase();
    if (!u) {
      return res.status(400).json({ error: 'Invalid username' });
    }
    if (!USERNAME_RE.test(u) || RESERVED.has(u)) {
      return res.status(400).json({ error: 'Invalid or reserved username' });
    }
    const { data: taken } = await supabase
      .from('profiles')
      .select('wallet')
      .eq('username', u)
      .maybeSingle();
    if (taken && taken.wallet !== targetOk) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    patch.username = u;
  }
  if (typeof is_moderator === 'boolean') {
    patch.is_moderator = is_moderator;
  }
  if (typeof is_admin === 'boolean') {
    patch.is_admin = is_admin;
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  const { error: upErr } = await supabase
    .from('profiles')
    .update(patch)
    .eq('wallet', targetOk);
  if (upErr) {
    if (supabaseErrorMissingColumn(upErr, 'is_moderator')) {
      return res.status(500).json({
        error: 'Run SQL migration 009 (is_moderator) on the database',
      });
    }
    console.error(upErr);
    return res.status(500).json({ error: upErr.message });
  }
  return res.json({ ok: true });
});

app.post('/api/admin/ban', async (req, res) => {
  const { wallet, message, signature } = req.body ?? {};
  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }
  if (!messageLooksLikeAdminBan(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid admin ban message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  if (!(await verifyIsAdmin(walletOk))) {
    return res.status(403).json({ error: 'Administrator only' });
  }
  const parsed = parseAdminBan(message);
  if (!parsed) {
    return res.status(400).json({ error: 'Invalid ban parameters' });
  }
  let targetOk;
  try {
    targetOk = new PublicKey(parsed.target_wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid target wallet' });
  }
  if (targetOk === walletOk) {
    return res.status(400).json({ error: 'Cannot ban yourself' });
  }
  const { data: targetProf } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('wallet', targetOk)
    .maybeSingle();
  if (!targetProf) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (targetProf.is_admin === true) {
    return res.status(403).json({ error: 'Cannot ban an administrator' });
  }
  const until = new Date(
    Date.now() + parsed.days * 24 * 60 * 60 * 1000
  ).toISOString();
  const { error: banErr } = await supabase.from('profile_bans').upsert(
    {
      wallet: targetOk,
      banned_until: until,
      banned_by_wallet: walletOk,
      reason: 'Forum ban',
    },
    { onConflict: 'wallet' }
  );
  if (banErr) {
    const m = String(banErr.message ?? '');
    if (/does not exist|relation/i.test(m)) {
      return res.status(500).json({
        error: 'Run SQL migration 009 (profile_bans) on the database',
      });
    }
    console.error(banErr);
    return res.status(500).json({ error: banErr.message });
  }
  return res.json({ ok: true, banned_until: until });
});

app.post('/api/admin/delete-post', async (req, res) => {
  const { wallet, message, signature } = req.body ?? {};
  if (
    typeof wallet !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  let walletOk;
  try {
    walletOk = new PublicKey(wallet).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid wallet' });
  }
  if (!messageLooksLikeAdminDeletePost(message, walletOk)) {
    return res.status(400).json({ error: 'Invalid admin delete message' });
  }
  if (!verifyWalletSignature(walletOk, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  if (!(await verifyIsAdmin(walletOk))) {
    return res.status(403).json({ error: 'Administrator only' });
  }
  const parsed = parseAdminDeletePost(message);
  if (!parsed || !UUID_RE.test(parsed.post_id)) {
    return res.status(400).json({ error: 'Invalid post id' });
  }
  const postId = parsed.post_id;

  const { data: postRow, error: pErr } = await supabase
    .from('forum_thread_posts')
    .select('id, thread_id, parent_id')
    .eq('id', postId)
    .maybeSingle();
  if (pErr) {
    console.error(pErr);
    return res.status(500).json({ error: pErr.message });
  }
  if (!postRow) {
    return res.status(404).json({ error: 'Post not found' });
  }

  if (postRow.parent_id === null) {
    const { data: inThread } = await supabase
      .from('forum_thread_posts')
      .select('id')
      .eq('thread_id', postRow.thread_id);
    const idList = (inThread ?? []).map((r) => r.id);
    if (idList.length > 0) {
      await supabase.from('forum_post_votes').delete().in('post_id', idList);
    }
    await supabase
      .from('forum_posts')
      .delete()
      .eq('thread_id', String(postRow.thread_id));
    const { error: delTErr } = await supabase
      .from('forum_threads')
      .delete()
      .eq('id', postRow.thread_id);
    if (delTErr) {
      console.error(delTErr);
      return res.status(500).json({ error: delTErr.message });
    }
    return res.json({ ok: true, deleted: 'thread' });
  }

  const { data: th } = await supabase
    .from('forum_threads')
    .select('posts_count')
    .eq('id', postRow.thread_id)
    .maybeSingle();
  const prev = Number(th?.posts_count) || 0;
  const next = Math.max(0, prev - 1);

  const { error: delPErr } = await supabase
    .from('forum_thread_posts')
    .delete()
    .eq('id', postId);
  if (delPErr) {
    console.error(delPErr);
    return res.status(500).json({ error: delPErr.message });
  }

  await supabase.from('forum_posts').delete().eq('id', postId);
  await supabase.from('forum_post_votes').delete().eq('post_id', postId);

  await supabase
    .from('forum_threads')
    .update({
      posts_count: next,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postRow.thread_id);

  return res.json({ ok: true, deleted: 'post' });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
});

(async () => {
  if (DEV_VITE) {
    const { createServer } = await import('vite');
    const httpServer = http.createServer(app);
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    httpServer.listen(LISTEN_PORT, LISTEN_HOST, () => {
      console.log(
        `Ligder dev (Vite + API) on http://127.0.0.1:${LISTEN_PORT} — open this URL in the browser`
      );
    });
    // Background retry loop for failed on-chain attestations (best-effort).
    setInterval(() => void retryFailedOnchainAttestationsOnce(10), 30_000);
    // Background loop: finalize dividend periods + compute per-wallet entitlements.
    setInterval(() => void finalizeDividendsPeriodsOnce(2), 30_000);
  } else {
    app.use((req, res) => {
      res.status(404).type('text').send('Ligder API — only /api/* routes');
    });
    app.listen(LISTEN_PORT, LISTEN_HOST, () => {
      console.log(`Ligder API listening on http://${LISTEN_HOST}:${LISTEN_PORT}`);
    });
    setInterval(() => void retryFailedOnchainAttestationsOnce(10), 30_000);
    setInterval(() => void finalizeDividendsPeriodsOnce(2), 30_000);
  }
})();
