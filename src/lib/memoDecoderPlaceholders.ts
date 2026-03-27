/** Labels mirror `parseLigderCompactMemo` in `server/index.mjs` (v1 pipe memos). */
export type PlaceholderMemoKind = 'thread_create' | 'reply_create';

export type MemoFieldRow = { idx: number; label: string };

export const MEMO_PLACEHOLDER_TC: MemoFieldRow[] = [
  { idx: 1, label: 'Format version' },
  { idx: 2, label: 'Kind' },
  { idx: 3, label: 'Board id' },
  { idx: 4, label: 'Thread number' },
  { idx: 5, label: 'Thread UUID (thread_id)' },
  { idx: 6, label: 'Opening post UUID (post_id)' },
  { idx: 7, label: 'Author wallet' },
  { idx: 8, label: 'Title SHA-256 (hex)' },
  { idx: 9, label: 'Body SHA-256 (hex)' },
  { idx: 10, label: 'LITE holdings snapshot (UI)' },
];

export const MEMO_PLACEHOLDER_RP: MemoFieldRow[] = [
  { idx: 1, label: 'Format version' },
  { idx: 2, label: 'Kind' },
  { idx: 3, label: 'Board id' },
  { idx: 4, label: 'Thread number' },
  { idx: 5, label: 'Thread UUID (thread_id)' },
  { idx: 6, label: 'This reply post UUID (post_id)' },
  { idx: 7, label: 'Parent post UUID' },
  { idx: 8, label: 'Author wallet' },
  { idx: 9, label: 'Body SHA-256 (hex)' },
  { idx: 10, label: 'LITE holdings snapshot (UI)' },
];

export const EMPTY_VALUE = '—';
