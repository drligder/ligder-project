import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/apiBase';
import { forumBoardBasePath } from '../lib/forumBoardBasePath';
import { EMPTY_VALUE, MEMO_PLACEHOLDER_TC } from '../lib/memoDecoderPlaceholders';
import { parseApiJson } from '../lib/parseApiJson';
import { solscanTxUrl } from '../lib/solscan';

const BODY_PREVIEW_CHARS = 400;

type MemoRow = { idx: number; label: string; value: string };

type ParsedMemo = {
  ok: boolean;
  kind?: string;
  rows?: MemoRow[];
  error?: string;
  raw?: string;
  bodyPostId?: string;
  boardId?: string;
  threadNumber?: string;
  threadId?: string;
  bodySha256Hex?: string;
};

type DecodeResponse = {
  signature: string;
  slot: number;
  blockTime: number | null;
  feePayer: string | null;
  memos: string[];
  parsed: ParsedMemo[];
  rpcUsed?: string;
  rpcLabel?: string;
  commitment?: string;
  networkMode?: string;
  solscanCluster?: 'mainnet' | 'devnet';
  error?: string;
};

type PostPublicResponse = {
  id: string;
  body: string;
  thread_id: string;
  board_id: string;
  thread_number: number;
  parent_id: string | null;
  created_at: string;
  forum_section?: string | null;
};

type BodyLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      body: string;
      board_id: string;
      thread_number: number;
      forum_section?: string | null;
      sha256Match: boolean | null;
    };

async function sha256HexUtf8(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type MemoTxDecoderProps = {
  /** When true, use archive page table styling and spacing. */
  variant?: 'default' | 'archive';
};

export function MemoTxDecoder({ variant = 'default' }: MemoTxDecoderProps) {
  const isArchive = variant === 'archive';
  const [sig, setSig] = useState('');
  const [network, setNetwork] = useState<'auto' | 'mainnet' | 'devnet'>('auto');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DecodeResponse | null>(null);
  const [bodyByMemoIdx, setBodyByMemoIdx] = useState<Record<number, BodyLoadState>>({});

  const hasDecoded = data !== null;

  const placeholderRows = MEMO_PLACEHOLDER_TC;

  useEffect(() => {
    setBodyByMemoIdx({});
    if (!data?.parsed?.length) return;
    const ac = new AbortController();
    data.parsed.forEach((p, i) => {
      if (!p.ok || !p.bodyPostId) return;
      setBodyByMemoIdx((prev) => ({ ...prev, [i]: { status: 'loading' } }));
      void (async () => {
        try {
          const r = await fetch(
            apiUrl(`/api/forum/thread-posts/${encodeURIComponent(p.bodyPostId)}`),
            { signal: ac.signal }
          );
          const j = await parseApiJson<PostPublicResponse & { error?: string }>(r);
          if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
          let sha256Match: boolean | null = null;
          const expected = p.bodySha256Hex?.trim().toLowerCase();
          if (expected && /^[0-9a-f]{64}$/.test(expected)) {
            const h = await sha256HexUtf8(j.body);
            sha256Match = h === expected;
          }
          setBodyByMemoIdx((prev) => ({
            ...prev,
            [i]: {
              status: 'ok',
              body: j.body,
              board_id: j.board_id,
              thread_number: j.thread_number,
              forum_section: j.forum_section ?? null,
              sha256Match,
            },
          }));
        } catch (e) {
          if (ac.signal.aborted) return;
          const msg = e instanceof Error ? e.message : 'Failed to load post';
          setBodyByMemoIdx((prev) => ({ ...prev, [i]: { status: 'error', message: msg } }));
        }
      })();
    });
    return () => ac.abort();
  }, [data]);

  const decode = async () => {
    const s = sig.trim();
    if (!s) {
      setErr('Paste a transaction signature.');
      return;
    }
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const r = await fetch(
        apiUrl(
          `/api/forum/decode-memo-tx?signature=${encodeURIComponent(s)}&network=${encodeURIComponent(network)}`
        )
      );
      const j = await parseApiJson<DecodeResponse>(r);
      if (!r.ok) {
        throw new Error(j.error || `Decode failed (${r.status})`);
      }
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Decode failed');
    } finally {
      setLoading(false);
    }
  };

  const sectionClass = isArchive
    ? 'mb-8 pb-8 border-b border-gray-400'
    : 'mt-8 p-4 border border-gray-400 bg-gray-50/80 max-w-4xl mx-auto';

  const tableClass = isArchive
    ? 'forum-table w-full border-collapse text-xs'
    : 'w-full border-collapse text-xs';

  const cellBorder = isArchive ? 'border border-gray-400' : 'border border-gray-300';
  const headBg = isArchive ? 'forum-table-head' : 'bg-gray-100';

  return (
    <section className={sectionClass} style={{ fontFamily: 'Arial, sans-serif' }}>
      <h2
        className={
          isArchive
            ? 'ligder-pixel-title m-0 mb-4 text-center text-gray-900'
            : 'm-0 mb-2 text-lg font-bold text-gray-900'
        }
        style={isArchive ? { fontSize: 'clamp(1.5rem, 4vw, 2.25rem)' } : undefined}
      >
        Verify attestation (Memo transaction)
      </h2>
      <p className="text-sm text-gray-700 m-0 mb-2" style={{ fontFamily: 'Times New Roman, serif' }}>
        Paste a Solana <strong>transaction signature</strong> from Solscan. We show each pipe-separated field.
        Message text is not on-chain — only hashes and IDs; post body is loaded from the forum by post UUID when
        applicable.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-4 items-stretch sm:items-center">
        <label className="text-sm text-gray-800 shrink-0 flex items-center gap-2">
          Network
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as 'auto' | 'mainnet' | 'devnet')}
            className="text-sm px-2 py-2 border border-gray-400 bg-white"
            disabled={loading}
          >
            <option value="auto">Auto (try mainnet + devnet)</option>
            <option value="mainnet">Mainnet only</option>
            <option value="devnet">Devnet only</option>
          </select>
        </label>
        <input
          type="text"
          value={sig}
          onChange={(e) => setSig(e.target.value)}
          placeholder="Transaction signature (base58)"
          className="flex-1 text-sm px-3 py-2 border border-gray-400 bg-white font-mono"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => void decode()}
          disabled={loading}
          className="text-sm px-4 py-2 border border-gray-800 bg-white hover:bg-gray-100 disabled:opacity-50 shrink-0"
        >
          {loading ? 'Loading…' : 'Decode'}
        </button>
      </div>

      {err ? (
        <p className="text-sm text-red-800 m-0 mb-3" style={{ fontFamily: 'Times New Roman, serif' }}>
          {err}
        </p>
      ) : null}

      <div
        className={`text-sm space-y-4 ${isArchive ? 'forum-table-wrap' : ''}`}
        style={{ minHeight: isArchive ? '28rem' : '24rem' }}
      >
        <div>
          <p className="text-xs font-semibold text-gray-700 m-0 mb-1">Transaction</p>
          <p className="text-gray-800 m-0 flex flex-wrap gap-x-2 gap-y-1 items-baseline">
            {hasDecoded && data ? (
              <a
                href={solscanTxUrl(
                  data.signature,
                  data.solscanCluster === 'devnet' ? 'devnet' : 'mainnet'
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 no-underline hover:text-blue-900 font-mono"
              >
                Open on Solscan
              </a>
            ) : (
              <span className="text-gray-400 font-mono">{EMPTY_VALUE}</span>
            )}
            <span className="text-gray-600">
              {hasDecoded && data?.rpcLabel ? <>· via {data.rpcLabel}</> : <>· {EMPTY_VALUE}</>}
            </span>
            <span className="text-gray-600">
              {hasDecoded && data?.slot != null ? <>· slot {data.slot}</> : <>· slot {EMPTY_VALUE}</>}
            </span>
            <span className="text-gray-600">
              {hasDecoded && data?.blockTime != null ? (
                <>· {new Date(data.blockTime * 1000).toLocaleString()}</>
              ) : (
                <>· time {EMPTY_VALUE}</>
              )}
            </span>
            <span className="text-gray-600">
              {hasDecoded && data?.feePayer ? (
                <>· fee payer {data.feePayer.slice(0, 8)}…</>
              ) : (
                <>· fee payer {EMPTY_VALUE}</>
              )}
            </span>
          </p>
        </div>

        <div className="border border-gray-300 bg-white p-3">
          <p className="text-xs font-semibold text-gray-700 m-0 mb-2">Memo #1</p>
          <p className="text-xs text-gray-500 m-0 mb-3 font-mono break-all min-h-[2.5rem]">
            {hasDecoded && data ? data.memos[0] ?? '—' : <span className="text-gray-400">{EMPTY_VALUE}</span>}
          </p>

          {hasDecoded && data && data.memos.length === 0 ? (
            <p className="text-gray-700 m-0 mb-2" style={{ fontFamily: 'Times New Roman, serif' }}>
              No Memo program instruction found in this transaction.
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr className={headBg}>
                  <th className={`text-left p-1.5 ${cellBorder} w-10`}>#</th>
                  <th className={`text-left p-1.5 ${cellBorder}`}>Field</th>
                  <th className={`text-left p-1.5 ${cellBorder}`}>Value</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const p0 = data?.parsed?.[0];
                  const resolved =
                    hasDecoded && p0?.ok && p0.rows && p0.rows.length > 0 ? p0.rows : null;
                  const rowsToShow = resolved ?? placeholderRows;
                  const isPlaceholder = !resolved;
                  return rowsToShow.map((row) => (
                    <tr key={row.idx}>
                      <td
                        className={`p-1.5 ${cellBorder} font-mono ${isPlaceholder ? 'text-gray-400' : 'text-gray-600'}`}
                      >
                        {row.idx}
                      </td>
                      <td className={`p-1.5 ${cellBorder} ${isPlaceholder ? 'text-gray-500' : 'text-gray-800'}`}>
                        {row.label}
                      </td>
                      <td
                        className={`p-1.5 ${cellBorder} font-mono break-all ${isPlaceholder ? 'text-gray-400' : 'text-gray-900'}`}
                        title={!isPlaceholder ? (row as MemoRow).value : undefined}
                      >
                        {isPlaceholder ? EMPTY_VALUE : (row as MemoRow).value}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          {hasDecoded && data?.parsed?.[0] && !data.parsed[0].ok ? (
            <p className="text-amber-900 m-0 mt-2 text-xs" style={{ fontFamily: 'Times New Roman, serif' }}>
              {data.parsed[0].error ?? 'Could not parse'}{' '}
              {data.parsed[0].raw ? (
                <span className="font-mono text-xs break-all">({data.parsed[0].raw})</span>
              ) : null}
            </p>
          ) : null}

          <div className="mt-3 border-t border-gray-200 pt-2">
            <p className="text-xs font-semibold text-gray-800 m-0 mb-1">Post body (forum DB)</p>
            {!hasDecoded || !data?.parsed?.[0]?.ok || !data.parsed[0].bodyPostId ? (
              <div className="text-xs text-gray-500 space-y-1" style={{ fontFamily: 'Times New Roman, serif' }}>
                <p className="m-0">Hash cannot be reversed — text loads by post UUID after a successful decode.</p>
                <pre
                  className={`whitespace-pre-wrap break-words text-xs font-mono bg-gray-50 p-2 border ${cellBorder} m-0 text-gray-400 min-h-[4rem]`}
                >
                  {EMPTY_VALUE}
                </pre>
              </div>
            ) : (
              <>
                {bodyByMemoIdx[0]?.status === 'loading' ? (
                  <p className="text-xs text-gray-500 m-0">Loading…</p>
                ) : null}
                {bodyByMemoIdx[0]?.status === 'error' ? (
                  <p className="text-xs text-amber-900 m-0">{bodyByMemoIdx[0].message}</p>
                ) : null}
                {bodyByMemoIdx[0]?.status === 'ok' ? (
                  <div className="space-y-2">
                    {bodyByMemoIdx[0].sha256Match === true ? (
                      <p className="text-xs text-green-800 m-0 mb-1">On-chain body hash matches text.</p>
                    ) : null}
                    {bodyByMemoIdx[0].sha256Match === false ? (
                      <p className="text-xs text-amber-900 m-0 mb-1">
                        Hash does not match (post may have been edited after this attestation).
                      </p>
                    ) : null}
                    {bodyByMemoIdx[0].body.length <= BODY_PREVIEW_CHARS ? (
                      <pre
                        className={`whitespace-pre-wrap break-words text-xs font-mono bg-gray-50 p-2 border ${cellBorder} max-h-96 overflow-auto m-0 text-gray-900`}
                      >
                        {bodyByMemoIdx[0].body}
                      </pre>
                    ) : (
                      <pre
                        className={`whitespace-pre-wrap break-words text-xs font-mono bg-gray-50 p-2 border ${cellBorder} max-h-40 overflow-auto m-0 text-gray-900`}
                      >
                        {bodyByMemoIdx[0].body.slice(0, BODY_PREVIEW_CHARS)}…
                      </pre>
                    )}
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        onClick={() => {
                          const st = bodyByMemoIdx[0];
                          if (st?.status === 'ok') void navigator.clipboard.writeText(st.body);
                        }}
                        className="text-xs px-2 py-1 border border-gray-700 bg-white hover:bg-gray-100"
                      >
                        Copy full text
                      </button>
                      {bodyByMemoIdx[0].body.length > BODY_PREVIEW_CHARS ? (
                        <a
                          href={`/forums/post-text/${encodeURIComponent(data.parsed[0].bodyPostId!)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-700 no-underline hover:text-blue-900"
                        >
                          Open full text in browser
                        </a>
                      ) : null}
                      <a
                        href={`${forumBoardBasePath(bodyByMemoIdx[0].board_id, bodyByMemoIdx[0].forum_section ?? null)}/${encodeURIComponent(bodyByMemoIdx[0].board_id)}/${bodyByMemoIdx[0].thread_number}`}
                        className="text-xs text-blue-700 no-underline hover:text-blue-900"
                      >
                        Open thread
                      </a>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        {hasDecoded && data && data.memos.length > 1
          ? data.memos.slice(1).map((rawMemo, j) => {
              const i = j + 1;
              const p = data.parsed[i];
              return (
                <div key={i} className="border border-gray-300 bg-white p-3">
                  <p className="text-xs text-gray-500 m-0 mb-2 font-mono break-all">Raw memo #{i + 1}: {rawMemo}</p>
                  {p?.ok && p.rows ? (
                    <table className={tableClass}>
                      <thead>
                        <tr className={headBg}>
                          <th className={`text-left p-1.5 ${cellBorder} w-10`}>#</th>
                          <th className={`text-left p-1.5 ${cellBorder}`}>Field</th>
                          <th className={`text-left p-1.5 ${cellBorder}`}>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.rows.map((row) => (
                          <tr key={row.idx}>
                            <td className={`p-1.5 ${cellBorder} font-mono text-gray-600`}>{row.idx}</td>
                            <td className={`p-1.5 ${cellBorder} text-gray-800`}>{row.label}</td>
                            <td
                              className={`p-1.5 ${cellBorder} font-mono text-gray-900 break-all`}
                              title={row.value}
                            >
                              {row.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-amber-900 m-0 text-xs" style={{ fontFamily: 'Times New Roman, serif' }}>
                      {p?.error ?? 'Could not parse'}
                    </p>
                  )}
                  <div className="mt-3 border-t border-gray-200 pt-2">
                    <p className="text-xs font-semibold text-gray-800 m-0 mb-1">Post body (forum DB)</p>
                    {!p?.ok || !p.bodyPostId ? (
                      <div
                        className="text-xs text-gray-500 space-y-1"
                        style={{ fontFamily: 'Times New Roman, serif' }}
                      >
                        <pre
                          className={`whitespace-pre-wrap break-words text-xs font-mono bg-gray-50 p-2 border ${cellBorder} m-0 text-gray-400 min-h-[3rem]`}
                        >
                          {EMPTY_VALUE}
                        </pre>
                      </div>
                    ) : (
                      <>
                        {bodyByMemoIdx[i]?.status === 'loading' ? (
                          <p className="text-xs text-gray-500 m-0">Loading…</p>
                        ) : null}
                        {bodyByMemoIdx[i]?.status === 'error' ? (
                          <p className="text-xs text-amber-900 m-0">{bodyByMemoIdx[i].message}</p>
                        ) : null}
                        {bodyByMemoIdx[i]?.status === 'ok' ? (
                          <div className="space-y-2">
                            {bodyByMemoIdx[i].sha256Match === true ? (
                              <p className="text-xs text-green-800 m-0 mb-1">On-chain body hash matches text.</p>
                            ) : null}
                            {bodyByMemoIdx[i].sha256Match === false ? (
                              <p className="text-xs text-amber-900 m-0 mb-1">
                                Hash does not match (post may have been edited after this attestation).
                              </p>
                            ) : null}
                            {bodyByMemoIdx[i].body.length <= BODY_PREVIEW_CHARS ? (
                              <pre
                                className={`whitespace-pre-wrap break-words text-xs font-mono bg-gray-50 p-2 border ${cellBorder} max-h-96 overflow-auto m-0 text-gray-900`}
                              >
                                {bodyByMemoIdx[i].body}
                              </pre>
                            ) : (
                              <pre
                                className={`whitespace-pre-wrap break-words text-xs font-mono bg-gray-50 p-2 border ${cellBorder} max-h-40 overflow-auto m-0 text-gray-900`}
                              >
                                {bodyByMemoIdx[i].body.slice(0, BODY_PREVIEW_CHARS)}…
                              </pre>
                            )}
                            <div className="flex flex-wrap gap-2 items-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const st = bodyByMemoIdx[i];
                                  if (st?.status === 'ok') void navigator.clipboard.writeText(st.body);
                                }}
                                className="text-xs px-2 py-1 border border-gray-700 bg-white hover:bg-gray-100"
                              >
                                Copy full text
                              </button>
                              {bodyByMemoIdx[i].body.length > BODY_PREVIEW_CHARS ? (
                                <a
                                  href={`/forums/post-text/${encodeURIComponent(p.bodyPostId)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-700 no-underline hover:text-blue-900"
                                >
                                  Open full text in browser
                                </a>
                              ) : null}
                              <a
                                href={`${forumBoardBasePath(bodyByMemoIdx[i].board_id, bodyByMemoIdx[i].forum_section ?? null)}/${encodeURIComponent(bodyByMemoIdx[i].board_id)}/${bodyByMemoIdx[i].thread_number}`}
                                className="text-xs text-blue-700 no-underline hover:text-blue-900"
                              >
                                Open thread
                              </a>
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          : null}
      </div>
    </section>
  );
}
