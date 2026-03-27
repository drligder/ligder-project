import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../contexts/ToastContext';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import { uint8ToBase64 } from '../lib/uint8Base64';

type DividendStatusResponse = {
  latestPeriod: string | null;
  claimable_pot_raw: string;
  management_reserve_raw: string;
  deposit_total_raw: string;
  snapshot_total_balance_raw: string;
  snapshot_taken_at: string | null;
  myEntitlement: null | {
    balance_snapshot_raw: string;
    entitlement_raw: string;
  };
  myClaimed: boolean;
  isEligible: boolean;
  withinWindow: boolean;
  current_balance_raw?: string;
  server_now_unix?: number;
  snapshot_taken_unix?: number;
  next_snapshot_unix?: number;
  claim_window_end_unix?: number;
  error?: string;
};

type DividendPeriodRow = {
  period_id: string | number;
  period_start_unix: string | number;
  period_end_unix: string | number;
  deposit_total_raw: string | number;
  claimable_pot_raw: string | number;
  management_reserve_raw: string | number;
  finalized_at: string;
};

type DividendAllocationRow = {
  wallet: string;
  username: string | null;
  balance_snapshot_raw: string;
  share_bps: string;
  entitlement_raw: string;
  claimed: boolean;
  claim_tx_sig: string | null;
};

const LITE_TOKEN_DECIMALS = 6n;
const TEN = 10n;
const DIVIDENDS_PERIOD_SECONDS = 6 * 60 * 60;

function formatRawLite(raw: string | bigint | null | undefined): string {
  if (raw == null) return '—';
  const v = typeof raw === 'bigint' ? raw : BigInt(String(raw));
  const denom = TEN ** LITE_TOKEN_DECIMALS;
  const whole = v / denom;
  const frac = v % denom;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(Number(LITE_TOKEN_DECIMALS), '0');
  const fracTrimmed = fracStr.replace(/0+$/g, '');
  return `${whole.toString()}.${fracTrimmed}`;
}

function formatShareBps(shareBps: string): string {
  // share_bps is basis points of a percent (1 bps = 0.01%).
  const n = Number(shareBps);
  if (!Number.isFinite(n)) return '—';
  const pct = n / 100;
  return `${pct.toFixed(2)}%`;
}

/** Spec section layout: readable, modern, still on-theme (white / gray / border). */
function SpecCard({
  label,
  title,
  kicker,
  children,
  tone = 'white',
}: {
  label: string;
  title: string;
  kicker?: string;
  children: ReactNode;
  tone?: 'white' | 'muted';
}) {
  return (
    <article
      className={`rounded-lg border border-gray-200 shadow-sm overflow-hidden border-l-[3px] border-l-gray-900 ${
        tone === 'muted' ? 'bg-gray-50/80' : 'bg-white'
      }`}
    >
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-2"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          {label}
        </p>
        <h3 className="text-base font-bold text-gray-900 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
          {title}
        </h3>
        {kicker ? (
          <p className="text-sm text-gray-600 mb-4 leading-relaxed" style={{ fontFamily: 'Times New Roman, serif' }}>
            {kicker}
          </p>
        ) : null}
        <div className="text-sm text-gray-800 leading-relaxed space-y-3" style={{ fontFamily: 'Times New Roman, serif' }}>
          {children}
        </div>
      </div>
    </article>
  );
}

function SpecNumbered({ items }: { items: { body: ReactNode }[] }) {
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3 sm:gap-4">
          <div
            className="flex flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 border border-gray-200 text-gray-800 text-xs font-semibold items-center justify-center mt-0.5"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            {i + 1}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">{item.body}</div>
        </div>
      ))}
    </div>
  );
}

function SpecBullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-3 list-none pl-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="text-gray-400 flex-shrink-0 mt-1.5">·</span>
          <span className="min-w-0 flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

const DividendsPage = () => {
  const { publicKey, signMessage } = useWallet();
  const { showToast } = useToast();
  const { isRegistered, profileLoading } = useLigderProfile();

  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus] = useState<DividendStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [tickMsAnchor, setTickMsAnchor] = useState<number | null>(null);
  const [serverNowUnix, setServerNowUnix] = useState<number | null>(null);

  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [periods, setPeriods] = useState<DividendPeriodRow[]>([]);
  const [periodsError, setPeriodsError] = useState<string | null>(null);

  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);

  const [allocLoading, setAllocLoading] = useState(false);
  const [allocError, setAllocError] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<DividendAllocationRow[]>([]);
  const [allocTotal, setAllocTotal] = useState<number | null>(null);
  const [allocOffset, setAllocOffset] = useState(0);
  const [allocLimit] = useState(25);
  const [orderBy, setOrderBy] = useState<
    'entitlement_raw' | 'balance_snapshot_raw' | 'share_bps' | 'wallet'
  >('entitlement_raw');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const loadPeriods = useCallback(async () => {
    setPeriodsLoading(true);
    setPeriodsError(null);
    try {
      const r = await fetch(apiUrl('/api/dividends/periods?limit=20&offset=0'));
      const j = await parseApiJson<{ periods?: DividendPeriodRow[]; error?: string }>(r);
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setPeriods(j.periods ?? []);
    } catch (e) {
      setPeriodsError(e instanceof Error ? e.message : 'Failed to load');
      setPeriods([]);
    } finally {
      setPeriodsLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    if (!publicKey) {
      setStatus(null);
      setStatusLoading(false);
      setStatusError(null);
      return;
    }
    setStatusLoading(true);
    setStatusError(null);
    try {
      const r = await fetch(apiUrl(`/api/dividends/status?wallet=${encodeURIComponent(publicKey)}`));
      const j = await parseApiJson<DividendStatusResponse>(r);
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setStatus(j);
      if (typeof j?.server_now_unix === 'number') {
        setServerNowUnix(j.server_now_unix);
        setTickMsAnchor(Date.now());
      }
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Failed to load');
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  /** Server clock for project time + 6h bar (works without a connected wallet). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl('/api/dividends/clock'));
        const j = await parseApiJson<{ server_now_unix?: number }>(r);
        if (cancelled || !r.ok || typeof j.server_now_unix !== 'number') return;
        setServerNowUnix(j.server_now_unix);
        setTickMsAnchor(Date.now());
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!tickMsAnchor || serverNowUnix == null) return;
    const id = window.setInterval(() => {
      const deltaSec = Math.floor((Date.now() - tickMsAnchor) / 1000);
      setServerNowUnix(serverNowUnix + deltaSec);
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickMsAnchor]);

  const formatDuration = (secTotal: number) => {
    const s = Math.max(0, Math.floor(secTotal));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  };

  useEffect(() => {
    if (activePeriodId) return;
    if (status?.latestPeriod) {
      setActivePeriodId(String(status.latestPeriod));
      return;
    }
    if (periods.length) {
      const pid = String(periods[0].period_id);
      setActivePeriodId(pid);
    }
  }, [activePeriodId, status?.latestPeriod, periods]);

  const loadAllocations = useCallback(async () => {
    if (!activePeriodId) return;
    setAllocLoading(true);
    setAllocError(null);
    try {
      const r = await fetch(
        apiUrl(
          `/api/dividends/periods/${encodeURIComponent(activePeriodId)}/allocations?limit=${allocLimit}&offset=${allocOffset}&orderBy=${encodeURIComponent(
            orderBy
          )}&dir=${encodeURIComponent(dir)}`
        )
      );
      const j = await parseApiJson<{
        rows?: DividendAllocationRow[];
        total?: number | null;
        limit?: number;
        offset?: number;
        error?: string;
      }>(r);
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setAllocations(j.rows ?? []);
      setAllocTotal(typeof j.total === 'number' ? j.total : null);
    } catch (e) {
      setAllocError(e instanceof Error ? e.message : 'Failed to load');
      setAllocations([]);
      setAllocTotal(null);
    } finally {
      setAllocLoading(false);
    }
  }, [activePeriodId, allocLimit, allocOffset, orderBy, dir]);

  useEffect(() => {
    void loadAllocations();
  }, [loadAllocations]);

  const onClickSort = (nextOrderBy: typeof orderBy) => {
    if (nextOrderBy === orderBy) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(nextOrderBy);
      setDir('desc');
    }
    setAllocOffset(0);
  };

  const periodEndDate = useMemo(() => {
    const found = periods.find((p) => String(p.period_id) === String(activePeriodId));
    if (!found) return null;
    const endUnix = Number(found.period_end_unix);
    if (!Number.isFinite(endUnix)) return null;
    return new Date(endUnix * 1000);
  }, [periods, activePeriodId]);

  const handleClaim = async () => {
    if (!publicKey || !signMessage || !status?.latestPeriod) return;
    if (!status.isEligible) {
      showToast('Not eligible to claim right now.', 'error');
      return;
    }
    if (!status.myEntitlement?.entitlement_raw) return;

    const nonce = crypto.randomUUID();
    const periodId = String(status.latestPeriod);
    const message = [
      'Ligder dividend claim',
      `Wallet: ${publicKey}`,
      `Period: ${periodId}`,
      `Nonce: ${nonce}`,
      '',
    ].join('\n');

    try {
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const r = await fetch(apiUrl('/api/dividends/claims/claim'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sigBytes),
          periodId,
        }),
      });
      const j = await parseApiJson<{ error?: string; ok?: boolean; claim_tx_sig?: string }>(r);
      if (!r.ok) throw new Error(j.error || `Claim failed (${r.status})`);
      showToast('Claim submitted.', 'success');
      await loadStatus();
      await loadPeriods();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Claim failed', 'error');
    }
  };

  const canPrev = allocOffset > 0;
  const canNext =
    allocTotal == null ? allocations.length === allocLimit : allocOffset + allocLimit < allocTotal;
  const lastOffset = allocTotal == null ? null : Math.max(0, allocTotal - allocLimit);

  const countdown = useMemo(() => {
    if (!status || !serverNowUnix || typeof status.next_snapshot_unix !== 'number') return null;
    const now = serverNowUnix;
    const next = status.next_snapshot_unix;
    const totalWindow = DIVIDENDS_PERIOD_SECONDS;
    const timeLeftSec = Math.max(0, next - now);
    // progress is elapsed within the 6h window: [snapshot_taken_unix, next_snapshot_unix]
    const start = typeof status.snapshot_taken_unix === 'number' ? status.snapshot_taken_unix : next - totalWindow;
    const elapsed = Math.min(totalWindow, Math.max(0, now - start));
    const pct = totalWindow > 0 ? (elapsed / totalWindow) * 100 : 0;
    return { timeLeftSec, pct };
  }, [serverNowUnix, status]);

  /** Wall-clock label for the API (UTC) — same basis as 6h period buckets. */
  const serverTimeUtcLabel = useMemo(() => {
    if (serverNowUnix == null) return null;
    try {
      return (
        new Date(serverNowUnix * 1000).toLocaleString(undefined, {
          weekday: 'short',
          timeZone: 'UTC',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }) + ' UTC'
      );
    } catch {
      return null;
    }
  }, [serverNowUnix]);

  /** Progress through the current global 6h epoch (Unix-aligned), until next boundary. */
  const globalSixHour = useMemo(() => {
    if (serverNowUnix == null) return null;
    const w = DIVIDENDS_PERIOD_SECONDS;
    const windowStart = Math.floor(serverNowUnix / w) * w;
    const nextBoundary = windowStart + w;
    const elapsed = serverNowUnix - windowStart;
    const pct = w > 0 ? (elapsed / w) * 100 : 0;
    const untilNext = Math.max(0, nextBoundary - serverNowUnix);
    return { windowStart, nextBoundary, pct, untilNext };
  }, [serverNowUnix]);

  /** Your share of snapshot weight (among registered wallets with balance &gt; 0 at snapshot). */
  const yourSnapshotSharePct = useMemo(() => {
    if (!status?.myEntitlement?.balance_snapshot_raw || !status.snapshot_total_balance_raw) return null;
    try {
      const b = BigInt(status.myEntitlement.balance_snapshot_raw);
      const S = BigInt(status.snapshot_total_balance_raw);
      if (S <= 0n) return null;
      const pct = (Number(b) / Number(S)) * 100;
      if (!Number.isFinite(pct)) return null;
      return pct;
    } catch {
      return null;
    }
  }, [status?.myEntitlement?.balance_snapshot_raw, status?.snapshot_total_balance_raw]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/" className="text-blue-700 hover:text-blue-900 underline">
              ← Home
            </Link>
            <Link to="/forums" className="text-blue-700 hover:text-blue-900 underline">
              ← Forums
            </Link>
          </div>
          <LoginDropdown />
        </div>

        <section className="mb-8 border border-gray-400 bg-white p-5">
          <div className="flex justify-center mb-4">
            <img
              src="/images/fig042-01.gif"
              alt=""
              className="h-auto w-auto max-w-[75%] bg-white object-contain"
            />
          </div>
          <h1
            className="ligder-pixel-title text-center mb-3"
            style={{ marginTop: 0, fontSize: 'clamp(1.5rem, 4vw, 2.25rem)' }}
          >
            Dividend claims
          </h1>

          <p className="text-sm text-gray-700 mb-0 leading-relaxed" style={{ fontFamily: 'Times New Roman, serif' }}>
            Pump / pool fees are moved from the dev wallet into the project treasury. Each period, the
            server records how much LITE arrived, splits it (75% claimable / 25% management reserve),
            snapshots every registered wallet&apos;s on-chain balance, and assigns a fixed entitlement
            per wallet. You claim by signing a message only; the relay wallet pays the Solana fee (and
            ATA rent if needed) and the treasury wallet authorizes the SPL LITE transfer to your wallet
            if you still meet the holding tolerance. The treasury needs <strong>LITE</strong> for
            payouts, not SOL for claim transactions—the relay wallet should stay funded with SOL.
          </p>
        </section>

        <section className="mb-8 border border-gray-400 bg-white overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <span className="text-xs text-gray-600" style={{ fontFamily: 'Arial, sans-serif' }}>
                Project time (server)
              </span>
              <span className="text-xs font-mono text-gray-900 tabular-nums">
                {serverTimeUtcLabel ?? '…'}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mb-2 leading-snug" style={{ fontFamily: 'Arial, sans-serif' }}>
              Six-hour windows use the API clock (UTC). Green shows how far we are through the current
              window; grey is what remains until the next boundary (new period bucket / finalize tick).
            </p>
            <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
              {globalSixHour ? (
                <div
                  className="h-full rounded-full bg-emerald-600 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${Math.min(100, Math.max(0, globalSixHour.pct))}%` }}
                />
              ) : (
                <div className="h-full w-0" />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[10px] text-gray-600">
              <span className="font-mono tabular-nums" style={{ fontFamily: 'Arial, sans-serif' }}>
                {globalSixHour
                  ? `Next boundary ${new Date(globalSixHour.nextBoundary * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC`
                  : '—'}
              </span>
              <span className="font-mono text-gray-800 tabular-nums">
                {globalSixHour ? `${formatDuration(globalSixHour.untilNext)} left` : '—'}
              </span>
            </div>
          </div>

          <div className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs text-gray-600 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Current fee pool (latest finalized snapshot)
                </div>
                <div className="text-sm font-mono">
                  {status?.claimable_pot_raw ? `${formatRawLite(status.claimable_pot_raw)} LITE` : '0 LITE'}
                </div>
                <div className="mt-2 text-xs text-gray-700">
                  <div>
                    Deposits: <span className="font-mono">{status?.deposit_total_raw ? `${formatRawLite(status.deposit_total_raw)}` : '—'} LITE</span>
                  </div>
                  <div>
                    Claimable (75%):{' '}
                    <span className="font-mono">
                      {status?.claimable_pot_raw ? `${formatRawLite(status.claimable_pot_raw)}` : '—'} LITE
                    </span>
                  </div>
                  <div>
                    Management reserve (25%):{' '}
                    <span className="font-mono">
                      {status?.management_reserve_raw ? `${formatRawLite(status.management_reserve_raw)}` : '—'} LITE
                    </span>
                  </div>
                </div>
                {typeof status?.snapshot_taken_at === 'string' ? (
                  <div className="mt-2 text-xs text-gray-600">
                    Snapshot taken: <span className="font-mono">{new Date(status.snapshot_taken_at).toLocaleString()}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <button
                  type="button"
                  className="min-w-[7.5rem] px-6 py-3 text-base font-semibold rounded-md border border-gray-900 bg-gray-900 text-white shadow-sm hover:bg-gray-800 hover:border-gray-800 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:bg-gray-900"
                  disabled={!publicKey || statusLoading || !status?.myEntitlement || !status.isEligible}
                  onClick={() => void handleClaim()}
                  style={{ fontFamily: 'Arial, sans-serif' }}
                >
                  Claim
                </button>
              </div>
            </div>

            {countdown ? (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs text-gray-700 mb-2">
                  <span style={{ fontFamily: 'Arial, sans-serif' }}>
                    Claim window (latest snapshot) — closes in
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatDuration(countdown.timeLeftSec)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-gray-900 h-2.5 rounded-full transition-[width] duration-1000 ease-linear"
                    style={{ width: `${Math.min(100, Math.max(0, countdown.pct))}%` }}
                  />
                </div>
              </div>
            ) : null}

            {statusError ? (
              <p className="text-sm text-red-800 mt-3">{statusError}</p>
            ) : null}
            {publicKey && profileLoading ? <p className="text-sm text-gray-600 mt-3">Loading…</p> : null}

            {!publicKey ? (
              <p className="text-sm text-gray-600 mt-3">Connect your wallet to view claimable amounts.</p>
            ) : null}
            {publicKey && !profileLoading && isRegistered === false ? (
              <p className="text-sm text-gray-600 mt-3">Register to claim dividends.</p>
            ) : null}
          </div>
        </section>

        {publicKey && status?.myEntitlement ? (
          <section className="mb-8 border border-gray-800 bg-gray-50 p-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3" style={{ fontFamily: 'Arial, sans-serif' }}>
              Your allocation (latest finalized period)
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-800">
              <div>
                <dt className="text-gray-600 font-sans">Your snapshot balance (at finalize)</dt>
                <dd className="font-mono mt-0.5">
                  {formatRawLite(status.myEntitlement.balance_snapshot_raw)} LITE
                </dd>
              </div>
              <div>
                <dt className="text-gray-600 font-sans">Your entitlement (this period)</dt>
                <dd className="font-mono mt-0.5">
                  {formatRawLite(status.myEntitlement.entitlement_raw)} LITE
                </dd>
              </div>
              {status.snapshot_total_balance_raw ? (
                <div>
                  <dt className="text-gray-600 font-sans">Total LITE weight in snapshot (sum of holders)</dt>
                  <dd className="font-mono mt-0.5">{formatRawLite(status.snapshot_total_balance_raw)} LITE</dd>
                </div>
              ) : null}
              {yourSnapshotSharePct != null ? (
                <div>
                  <dt className="text-gray-600 font-sans">Your share of snapshot weight</dt>
                  <dd className="font-mono mt-0.5">{yourSnapshotSharePct.toFixed(4)}%</dd>
                </div>
              ) : null}
            </dl>
            <p className="text-xs text-gray-600 mt-3 leading-relaxed" style={{ fontFamily: 'Times New Roman, serif' }}>
              Entitlement is not “% of total LITE supply”; it is your fraction of the sum of LITE held
              at snapshot by registered wallets with a positive balance. If you hold more LITE at
              snapshot, your weight and entitlement go up relative to everyone else in that sum.
            </p>
          </section>
        ) : null}

        <section className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2
              className="text-base font-bold text-gray-900"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              Snapshot archive
            </h2>
            {periodEndDate ? (
              <div className="text-xs text-gray-600 font-mono" style={{ fontFamily: 'Arial, sans-serif' }}>
                Active snapshot ends: {periodEndDate.toLocaleString()}
              </div>
            ) : null}
          </div>

          {periodsLoading ? <p className="text-sm text-gray-600">Loading snapshots…</p> : null}
          {periodsError ? <p className="text-sm text-red-800">{periodsError}</p> : null}

          {periods.length ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {periods.slice(0, 8).map((p) => {
                const pid = String(p.period_id);
                const isActive = pid === String(activePeriodId);
                const endUnix = Number(p.period_end_unix);
                const d = Number.isFinite(endUnix) ? new Date(endUnix * 1000) : null;
                return (
                  <button
                    key={pid}
                    type="button"
                    className={`text-xs px-3 py-1.5 border ${
                      isActive ? 'border-gray-800 bg-gray-900 text-white' : 'border-gray-400 bg-white text-gray-900 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setActivePeriodId(pid);
                      setAllocOffset(0);
                    }}
                    style={{ fontFamily: 'Arial, sans-serif' }}
                  >
                    {d ? d.toLocaleString() : pid}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="forum-table-wrap">
            <table className="forum-table w-full border-collapse text-sm">
              <thead>
                <tr className="forum-table-head">
                  <th className="text-left p-2 border border-gray-400">
                    <button type="button" onClick={() => onClickSort('wallet')} className="hover:underline">
                      Wallet
                    </button>
                  </th>
                  <th className="text-left p-2 border border-gray-400">
                    <button
                      type="button"
                      onClick={() => onClickSort('balance_snapshot_raw')}
                      className="hover:underline"
                    >
                      Snapshot holdings
                    </button>
                  </th>
                  <th className="text-left p-2 border border-gray-400">
                    <button
                      type="button"
                      onClick={() => onClickSort('share_bps')}
                      className="hover:underline"
                    >
                      Share
                    </button>
                  </th>
                  <th className="text-left p-2 border border-gray-400">
                    <button
                      type="button"
                      onClick={() => onClickSort('entitlement_raw')}
                      className="hover:underline"
                    >
                      Claimable
                    </button>
                  </th>
                  <th className="text-left p-2 border border-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {allocLoading ? <tr><td colSpan={5} className="p-4 text-sm text-gray-600">Loading…</td></tr> : null}
                {allocError ? <tr><td colSpan={5} className="p-4 text-sm text-red-800">{allocError}</td></tr> : null}
                {!allocLoading && !allocError && allocations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 border border-gray-400 text-gray-600 text-center" style={{ fontFamily: 'Times New Roman, serif' }}>
                      No allocations for this period.
                    </td>
                  </tr>
                ) : null}

                {!allocLoading && !allocError &&
                  allocations.map((a) => (
                    <tr key={`${activePeriodId}:${a.wallet}`} className="forum-table-row bg-white">
                      <td className="p-2 border border-gray-400" style={{ fontFamily: 'Arial, sans-serif' }}>
                        {a.username ? (
                          <Link to={`/forums/u/${encodeURIComponent(a.username)}`} className="text-blue-800 underline hover:text-blue-950">
                            {a.username}
                          </Link>
                        ) : (
                          <span className="font-mono">{a.wallet.slice(0, 6)}…{a.wallet.slice(-4)}</span>
                        )}
                      </td>
                      <td className="p-2 border border-gray-400 font-mono">{formatRawLite(a.balance_snapshot_raw)} LITE</td>
                      <td className="p-2 border border-gray-400">{formatShareBps(a.share_bps)}</td>
                      <td className="p-2 border border-gray-400 font-mono">{formatRawLite(a.entitlement_raw)} LITE</td>
                      <td className="p-2 border border-gray-400">
                        {a.claimed ? (
                          <span className="text-green-800 font-semibold">claimed</span>
                        ) : (
                          <span className="text-gray-700">open</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => setAllocOffset(Math.max(0, allocOffset - allocLimit))}
              className="text-xs px-3 py-1.5 border border-gray-700 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              Previous
            </button>
            <span className="text-xs text-gray-600 font-mono" style={{ fontFamily: 'Arial, sans-serif' }}>
              Offset {allocOffset}
              {allocTotal != null ? ` / ${Math.max(0, allocTotal - 1)}` : ''}
            </span>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setAllocOffset(allocOffset + allocLimit)}
              className="text-xs px-3 py-1.5 border border-gray-700 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              Next
            </button>
            <button
              type="button"
              disabled={lastOffset == null || allocOffset >= lastOffset}
              onClick={() => lastOffset != null && setAllocOffset(lastOffset)}
              className="text-xs px-3 py-1.5 border border-gray-700 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              Last
            </button>
          </div>
        </section>

        <section className="mb-10 border-t border-gray-300 pt-10">
          <div className="mx-auto max-w-3xl">
            <h2
              className="text-xl font-bold text-gray-900 mb-2 text-center sm:text-left"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              Technical specification
            </h2>
            <p
              className="text-sm text-gray-600 mb-8 text-center sm:text-left leading-relaxed max-w-2xl"
              style={{ fontFamily: 'Times New Roman, serif' }}
            >
              Same rules the server uses—just laid out so you can skim the story first, then dig into
              the details. Nothing here is legal or investment advice; it&apos;s how the app behaves.
            </p>

            <div className="space-y-5 sm:space-y-6">
              <SpecCard
                label="Overview"
                title="From fees to your wallet"
                kicker="Fees land in the dev wallet, you forward LITE to treasury, we record deposits, split the pot, snapshot balances, then you claim with a signature."
              >
                <SpecNumbered
                  items={[
                    {
                      body: (
                        <>
                          Pool / trading fees show up as LITE (and other assets) where you claim them.
                          You move LITE from the dev wallet into the project treasury on Solana.
                        </>
                      ),
                    },
                    {
                      body: (
                        <>
                          Staff paste the <strong>transfer tx signature</strong> into the admin tool.
                          The API parses the chain transaction: one sender down, treasury up, same mint (
                          <span className="font-mono text-[13px]">LITE_TOKEN_MINT</span>
                          ). Each signature is stored once.
                        </>
                      ),
                    },
                    {
                      body: (
                        <>
                          The deposit is booked into the <strong>current 6-hour bucket</strong> (see
                          Timing below) using server time when it was submitted.
                        </>
                      ),
                    },
                    {
                      body: (
                        <>
                          When that bucket closes, the job <strong>finalizes</strong>: sum deposits,
                          apply 75% / 25%, read every registered wallet&apos;s LITE via RPC, write
                          entitlements.
                        </>
                      ),
                    },
                    {
                      body: (
                        <>
                          You hit <strong>Claim</strong>, sign a short message in Phantom, and the
                          treasury sends your LITE—if you still pass the holding check.
                        </>
                      ),
                    },
                  ]}
                />
              </SpecCard>

              <SpecCard
                label="Timing"
                title="Six-hour windows"
                kicker="Everyone shares the same clock slices so accounting stays simple and auditable."
              >
                <SpecBullets
                  items={[
                    <>
                      The day is cut into <strong>6-hour</strong> segments from Unix epoch:{' '}
                      <span className="font-mono text-[13px]">period_start = floor(now / 21600) * 21600</span>{' '}
                      seconds, and <span className="font-mono text-[13px]">period_end = period_start + 21600</span>.
                    </>,
                    <>
                      Before <span className="font-mono text-[13px]">period_end</span> the bucket is{' '}
                      <strong>open</strong>. After that, the background job finalizes it and writes who gets what.
                    </>,
                    <>
                      For the <strong>latest finalized</strong> snapshot you can claim during the next
                      window—roughly until the next boundary (the countdown bar above is your visual cue).
                    </>,
                  ]}
                />
              </SpecCard>

              <SpecCard
                label="Trust"
                title="Deposit checks (admin)"
                kicker="We never trust a pasted string until the chain agrees."
              >
                <p>
                  If the tx mixes unrelated LITE movements or we can&apos;t identify exactly one sender,
                  the deposit is dropped. Optionally, set{' '}
                  <span className="font-mono text-[13px]">SPL_DIVIDEND_SENDER</span> (public base58) so
                  only that wallet may be the LITE sender; the receiver is always inferred as the
                  treasury from <span className="font-mono text-[13px]">TREASURY_WALLET_SECRET_KEY</span>.
                  Legacy name <span className="font-mono text-[13px]">DIVIDENDS_DEV_WALLET</span> still
                  works.
                </p>
              </SpecCard>

              <SpecCard
                label="Snapshot"
                title="Who counts in the split"
                kicker="Registration matters: the snapshot only looks at Ligder profiles, not every token holder on Earth."
              >
                <SpecBullets
                  items={[
                    <>
                      We walk <span className="font-mono text-[13px]">profiles</span> and sum LITE for
                      each wallet (all token accounts for that mint).
                    </>,
                    <>
                      Wallets with <strong>zero</strong> balance at finalize don&apos;t get a row—they&apos;re
                      left out of the denominator too.
                    </>,
                    <>
                      Let <span className="font-mono text-[13px]">S = sum of b_i</span> over everyone with
                      balance &gt; 0. That is <strong>not</strong> total LITE supply; it&apos;s only
                      registered holders in this snapshot. No profile, no slice.
                    </>,
                  ]}
                />
              </SpecCard>

              <SpecCard label="Math" title="How the pot is split" tone="muted" kicker="All on-chain math uses integer base units (6 decimals for LITE).">
                <p className="text-gray-700">
                  One full LITE = <span className="font-mono text-[13px]">1_000_000</span> raw units.
                  The UI shows human amounts; the server uses raw integers end-to-end.
                </p>
                <div className="rounded-md bg-white border border-gray-200 p-4 shadow-inner">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
                    Core formulas
                  </p>
                  <pre className="text-xs font-mono text-gray-900 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {`D = sum of deposits (raw) for the period
P = floor(75 * D / 100)          // claimable pot
M = D - P                         // management reserve

For each wallet i with b_i > 0:
  base_i = floor(P * b_i / S)
  // remainder units assigned deterministically so sum_i entitlement_i = P

share_bps_i = floor(10000 * b_i / S)   // for display`}
                  </pre>
                </div>
                <p className="text-gray-700 pt-1">
                  <span className="font-semibold text-gray-900">In plain terms:</span> your piece grows
                  with <span className="font-mono text-[13px]">b_i / S</span>—your share of LITE among
                  registered holders at snapshot, not your share of the whole 1B supply unless the whole
                  world is in Ligder.
                </p>
              </SpecCard>

              <SpecCard
                label="Example"
                title="Tiny numbers, same rules"
                kicker="Illustrative only—your real entitlement shows in the table when you connect."
              >
                <p>
                  Say <span className="font-mono text-[13px]">D = 1_000_000_000</span> raw (= 1 LITE
                  deposited). Then <span className="font-mono text-[13px]">P = 750_000_000</span> raw is
                  claimable. Three wallets snapshot at{' '}
                  <span className="font-mono text-[13px]">60M / 30M / 10M</span> raw →{' '}
                  <span className="font-mono text-[13px]">S = 100_000_000</span>. Wallet A holds 60% of
                  the weight, so its entitlement starts at{' '}
                  <span className="font-mono text-[13px]">floor(750M × 60M / 100M)</span> raw plus any
                  remainder from rounding.
                </p>
              </SpecCard>

              <SpecCard
                label="For you"
                title="Claiming in practice"
                kicker="Four short steps—most of the work is one Phantom signature."
              >
                <SpecNumbered
                  items={[
                    {
                      body: (
                        <>
                          <strong>Register</strong> with the wallet you&apos;ll use to claim (must match
                          Phantom).
                        </>
                      ),
                    },
                    {
                      body: (
                        <>
                          <strong>Connect</strong> here and wait until you see an entitlement and the
                          window is open.
                        </>
                      ),
                    },
                    {
                      body: (
                        <>
                          <strong>Claim</strong> → sign the message (wallet, period, nonce). No LITE
                          leaves your wallet for this step.
                        </>
                      ),
                    },
                    {
                      body: (
                        <>
                          The server verifies, applies the 90% rule, then broadcasts an on-chain tx: the
                          relay wallet pays the Solana fee (and rent if your ATA is created), and the
                          treasury authorizes the LITE transfer to your associated token account.
                        </>
                      ),
                    },
                  ]}
                />
              </SpecCard>

              <SpecCard label="Rules" title="Eligibility cheat sheet" kicker="Quick checklist before you expect a payout.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-md border border-gray-200 bg-white/80 p-3">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                      Profile
                    </p>
                    <p className="text-sm text-gray-800">Registered wallet; same address as Phantom.</p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-white/80 p-3">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                      Snapshot
                    </p>
                    <p className="text-sm text-gray-800">Had LITE &gt; 0 when the period finalized.</p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-white/80 p-3">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                      Tolerance
                    </p>
                    <p className="text-sm text-gray-800">
                      At claim: <span className="font-mono text-[13px]">b_now × 100 ≥ b_snap × 90</span>{' '}
                      (raw units, server-side).
                    </p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-white/80 p-3">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                      Once
                    </p>
                    <p className="text-sm text-gray-800">One successful claim per period per wallet.</p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-white/80 p-3 sm:col-span-2">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                      Treasury
                    </p>
                    <p className="text-sm text-gray-800">
                      The treasury key authorizes moving LITE; the same relay wallet as forum memos pays
                      network fees. Neither secret is in the browser.
                    </p>
                  </div>
                </div>
              </SpecCard>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default DividendsPage;

