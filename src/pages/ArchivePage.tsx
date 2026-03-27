import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MemoTxDecoder } from '../components/MemoTxDecoder';
import { LoginDropdown } from '../components/LoginDropdown';
import { apiUrl } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import { forumBoardBasePath } from '../lib/forumBoardBasePath';
import { solscanTxUrl } from '../lib/solscan';

const PAGE_SIZE = 100;

type OnchainAttestationRow = {
  id: string;
  kind: 'thread_create' | 'reply_create' | 'post_vote' | string;
  board_id: string;
  thread_id: string;
  post_id: string | null;
  thread_number: number | null;
  author_wallet: string;
  author_username: string | null;
  lite_holdings_ui: string | null;
  status: 'pending' | 'failed' | 'confirmed' | string;
  attempts: number;
  last_error: string | null;
  tx_sig: string | null;
  created_at: string;
};

type ArchiveApiResponse = {
  attestations?: OnchainAttestationRow[];
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  error?: string;
};

function shortSig(sig: string): string {
  const s = sig.trim();
  if (s.length <= 20) return s;
  return `${s.slice(0, 10)}…${s.slice(-8)}`;
}

type StatusFilter = 'all' | 'confirmed' | 'pending' | 'failed';

const STATUS_CYCLE: StatusFilter[] = ['all', 'confirmed', 'pending', 'failed'];

function parsePage(raw: string | null): number {
  const n = parseInt(String(raw ?? '1'), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

const ArchivePage = () => {
  const [activeTab, setActiveTab] = useState<'archive' | 'verify'>('archive');
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<OnchainAttestationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = useMemo(() => parsePage(searchParams.get('page')), [searchParams]);
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const statusFilter: StatusFilter = useMemo(() => {
    const s = (searchParams.get('status') ?? 'all').toLowerCase();
    if (s === 'confirmed' || s === 'pending' || s === 'failed') return s;
    return 'all';
  }, [searchParams]);

  const offset = (page - 1) * PAGE_SIZE;

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v == null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (activeTab !== 'archive') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    qs.set('limit', String(PAGE_SIZE));
    qs.set('offset', String(offset));
    qs.set('order', order);
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    void fetch(apiUrl(`/api/forum/onchain-attestations?${qs.toString()}`))
      .then(async (r) => {
        const j = await parseApiJson<ArchiveApiResponse>(r);
        if (cancelled) return;
        if (!r.ok) throw new Error(j.error || `Archive failed (${r.status})`);
        setRows(j.attestations ?? []);
        setTotal(typeof j.total === 'number' ? j.total : 0);
        setHasMore(j.hasMore === true);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Archive failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, offset, order, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setParams({ page: String(totalPages) });
    }
  }, [page, totalPages, setParams]);

  const canGoNext = total > 0 ? page < totalPages : hasMore;

  const toggleSortOrder = () => {
    const next = order === 'desc' ? 'asc' : 'desc';
    setParams({ order: next, page: '1' });
  };

  const cycleStatusFilter = () => {
    const i = STATUS_CYCLE.indexOf(statusFilter);
    const next = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
    setParams({
      status: next === 'all' ? null : next,
      page: '1',
    });
  };

  const statusFilterLabel =
    statusFilter === 'all'
      ? 'All statuses'
      : statusFilter === 'confirmed'
        ? 'Confirmed only'
        : statusFilter === 'pending'
          ? 'Pending only'
          : 'Failed only';

  const sortLabel = order === 'desc' ? 'Newest → oldest' : 'Oldest → newest';

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/" className="text-blue-700 hover:text-blue-900 underline">
              ← Back to Ligder
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <LoginDropdown />
          </div>
        </div>

        <h1
          className="ligder-pixel-title text-center mb-4"
          style={{ marginTop: 0, fontSize: 'clamp(1.5rem, 4vw, 2.25rem)' }}
        >
          Archive &amp; verify
        </h1>
        <p className="text-sm text-gray-700 mb-4" style={{ fontFamily: 'Times New Roman, serif' }}>
          Browse relayed on-chain attestations in Archive, or switch to Verify Attestation to decode a specific
          transaction signature.
        </p>

        <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('archive')}
            className={`text-sm px-3 py-1.5 border ${
              activeTab === 'archive'
                ? 'border-gray-800 bg-gray-900 text-white'
                : 'border-gray-400 bg-white text-gray-900 hover:bg-gray-50'
            }`}
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            Archive
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('verify')}
            className={`text-sm px-3 py-1.5 border ${
              activeTab === 'verify'
                ? 'border-gray-800 bg-gray-900 text-white'
                : 'border-gray-400 bg-white text-gray-900 hover:bg-gray-50'
            }`}
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            Verify attestation
          </button>
        </div>

        {activeTab === 'verify' ? <MemoTxDecoder variant="archive" /> : null}

        {activeTab === 'archive' ? (
          <h2 className="text-lg font-bold text-gray-900 mt-0 mb-2" style={{ fontFamily: 'Times New Roman, serif' }}>
            Attestation log
          </h2>
        ) : null}

        {activeTab === 'archive' ? (
          <div
            className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-800"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            <span className="text-gray-600">Tip:</span>
            <span>
              Click <strong className="font-semibold">When</strong> to change sort,{' '}
              <strong className="font-semibold">Status</strong> to filter by status.
            </span>
          </div>
        ) : null}

        {activeTab === 'archive' && loading ? <p className="text-sm text-gray-600">Loading…</p> : null}
        {activeTab === 'archive' && error ? <p className="text-sm text-red-800 mb-4">{error}</p> : null}

        {activeTab === 'archive' && !loading && !error ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="m-0 text-gray-700" style={{ fontFamily: 'Times New Roman, serif' }}>
                {total > 0 ? (
                  <>
                    Showing {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, total)} of {total}
                  </>
                ) : (
                  <>No rows on this page</>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setParams({ page: String(Math.max(1, page - 1)) })}
                  className="text-xs px-3 py-1.5 border border-gray-700 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-600 font-mono">
                  Page {page}
                  {total > 0 ? ` / ${totalPages}` : ''}
                </span>
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => setParams({ page: String(page + 1) })}
                  className="text-xs px-3 py-1.5 border border-gray-700 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="forum-table-wrap">
              <table className="forum-table w-full border-collapse text-sm">
                <thead>
                  <tr className="forum-table-head">
                    <th className="text-left p-2 border border-gray-400">
                      <button
                        type="button"
                        onClick={() => toggleSortOrder()}
                        className="text-left w-full font-semibold text-gray-900 hover:underline underline-offset-2"
                        title="Toggle: newest first or oldest first"
                      >
                        When
                        <span className="block font-normal text-[11px] text-gray-600 font-sans mt-0.5">
                          {sortLabel} · click to toggle
                        </span>
                      </button>
                    </th>
                    <th className="text-left p-2 border border-gray-400">Kind</th>
                    <th className="text-left p-2 border border-gray-400">Author</th>
                    <th className="text-left p-2 border border-gray-400">Board / Thread</th>
                    <th className="text-left p-2 border border-gray-400">TX</th>
                    <th className="text-left p-2 border border-gray-400">
                      <button
                        type="button"
                        onClick={() => cycleStatusFilter()}
                        className="text-left w-full font-semibold text-gray-900 hover:underline underline-offset-2"
                        title="Cycle: all → confirmed → pending → failed"
                      >
                        Status
                        <span className="block font-normal text-[11px] text-gray-600 font-sans mt-0.5">
                          {statusFilterLabel} · click to filter
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className="bg-white">
                      <td
                        colSpan={6}
                        className="p-4 border border-gray-400 text-gray-600 text-center"
                        style={{ fontFamily: 'Times New Roman, serif' }}
                      >
                        No attestations match these filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((a) => {
                      const author = a.author_username ?? `${a.author_wallet.slice(0, 8)}…`;
                      const kindLabel =
                        a.kind === 'thread_create'
                          ? 'Thread'
                          : a.kind === 'reply_create'
                            ? 'Reply'
                            : a.kind === 'post_vote'
                              ? 'Vote'
                            : a.kind;
                      const base = forumBoardBasePath(a.board_id);
                      const threadHref =
                        a.thread_number && a.board_id
                          ? `${base}/${encodeURIComponent(a.board_id)}/${a.thread_number}`
                          : a.board_id && a.thread_id
                            ? `${base}/${encodeURIComponent(a.board_id)}/${encodeURIComponent(a.thread_id)}`
                            : null;
                      return (
                        <tr key={a.id} className="forum-table-row bg-white">
                          <td
                            className="p-2 border border-gray-400 text-gray-700 text-xs"
                            style={{ fontFamily: 'Times New Roman, serif' }}
                          >
                            {new Date(a.created_at).toLocaleString()}
                          </td>
                          <td
                            className="p-2 border border-gray-400 text-gray-900 text-xs"
                            style={{ fontFamily: 'Arial, sans-serif' }}
                          >
                            {kindLabel}
                          </td>
                          <td
                            className="p-2 border border-gray-400 text-gray-800 text-xs"
                            style={{ fontFamily: 'Arial, sans-serif' }}
                          >
                            {author}
                          </td>
                          <td className="p-2 border border-gray-400 text-xs">
                            {threadHref ? (
                              <Link
                                to={threadHref}
                                className="text-blue-800 underline hover:text-blue-950 font-mono"
                                title="Open in forum"
                              >
                                {a.board_id} #{a.thread_number ?? '—'}
                              </Link>
                            ) : (
                              <span className="font-mono text-gray-700">
                                {a.board_id} #{a.thread_number ?? '—'}
                              </span>
                            )}
                          </td>
                          <td className="p-2 border border-gray-400 text-xs">
                            {a.tx_sig ? (
                              <a
                                href={solscanTxUrl(a.tx_sig)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-800 underline hover:text-blue-950 font-mono"
                                title={a.tx_sig}
                              >
                                {shortSig(a.tx_sig)}
                              </a>
                            ) : (
                              <span className="text-gray-500 font-mono">—</span>
                            )}
                          </td>
                          <td
                            className="p-2 border border-gray-400 text-xs"
                            style={{ fontFamily: 'Arial, sans-serif' }}
                            title={a.last_error ?? undefined}
                          >
                            {a.status === 'confirmed' ? (
                              <span className="text-green-800">confirmed</span>
                            ) : a.status === 'pending' ? (
                              <span className="text-gray-700">pending</span>
                            ) : a.status === 'failed' ? (
                              <span className="text-red-800">failed</span>
                            ) : (
                              <span className="text-gray-700">{a.status}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {rows.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setParams({ page: String(Math.max(1, page - 1)) })}
                  className="text-xs px-3 py-1.5 border border-gray-700 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-600 font-mono">
                  Page {page}
                  {total > 0 ? ` / ${totalPages}` : ''}
                </span>
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => setParams({ page: String(page + 1) })}
                  className="text-xs px-3 py-1.5 border border-gray-700 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ArchivePage;
