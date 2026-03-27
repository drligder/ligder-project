import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useToast } from '../contexts/ToastContext';
import { useWallet } from '../contexts/WalletContext';
import { useAdminSession } from '../hooks/useAdminSession';
import { useForumAccount } from '../hooks/useForumAccount';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl, describeForumApiFailure } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import type { ForumBoardMinRank, ForumBoardRow } from '../types/forumBoards';

const SECTION_ORDER = [
  'LIGDER OFFICIAL',
  'LIGDER GOVERNANCE',
  'LIGDER GENERAL',
  'LIGDER TECHNICAL',
] as const;

const START_RANK_OPTIONS: ForumBoardMinRank[] = [
  'member',
  'moderator',
  'administrator',
];

const REPLY_RANK_OPTIONS: ForumBoardMinRank[] = [
  'member',
  'moderator',
  'administrator',
  'none',
];

type SearchUser = {
  wallet: string;
  username: string;
  is_admin: boolean;
  is_moderator: boolean;
};

function groupBoardsBySection(boards: ForumBoardRow[]): { section: string; boards: ForumBoardRow[] }[] {
  const by = new Map<string, ForumBoardRow[]>();
  for (const b of boards) {
    const list = by.get(b.section) ?? [];
    list.push(b);
    by.set(b.section, list);
  }
  for (const list of by.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }
  const extra = [...by.keys()].filter((s) => !SECTION_ORDER.includes(s as (typeof SECTION_ORDER)[number]));
  extra.sort();
  const order = [...SECTION_ORDER, ...extra].filter((s) => (by.get(s)?.length ?? 0) > 0);
  return order.map((section) => ({
    section,
    boards: by.get(section) ?? [],
  }));
}

const AdminPage = () => {
  const { publicKey } = useWallet();
  const { adminFetch } = useAdminSession();
  const { isRegistered, profileLoading } = useLigderProfile();
  const { isAdmin, loading: accountLoading } = useForumAccount();
  const { showToast } = useToast();

  const [boards, setBoards] = useState<ForumBoardRow[]>([]);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [savingBoardId, setSavingBoardId] = useState<string | null>(null);

  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editMod, setEditMod] = useState(false);
  const [editAdmin, setEditAdmin] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  const [depositTxSig, setDepositTxSig] = useState('');
  const [submittingDeposit, setSubmittingDeposit] = useState(false);

  const sectionGroups = useMemo(() => groupBoardsBySection(boards), [boards]);

  const loadBoards = useCallback(async () => {
    setBoardsLoading(true);
    setBoardsError(null);
    try {
      const walletQ = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : '';
      const r = await fetch(apiUrl(`/api/forum/boards${walletQ}`));
      const j = await parseApiJson<{ boards?: ForumBoardRow[]; error?: string }>(r);
      if (!r.ok) {
        throw new Error(describeForumApiFailure(j.error, r.status));
      }
      setBoards(j.boards ?? []);
    } catch (e) {
      setBoardsError(e instanceof Error ? e.message : 'Failed to load boards');
      setBoards([]);
    } finally {
      setBoardsLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  const saveBoardRanks = async (
    board: ForumBoardRow,
    start: ForumBoardMinRank,
    reply: ForumBoardMinRank
  ) => {
    if (!publicKey) return;
    setSavingBoardId(board.id);
    try {
      const r = await adminFetch(apiUrl('/api/admin/board-update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: board.id,
          min_rank_start_thread: start,
          min_rank_reply: reply,
        }),
      });
      const j = await parseApiJson<{ error?: string }>(r);
      if (!r.ok) {
        throw new Error(j.error || `Update failed (${r.status})`);
      }
      showToast('Board permissions updated.', 'success');
      await loadBoards();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally {
      setSavingBoardId(null);
    }
  };

  const runSearch = async () => {
    if (!publicKey || !searchQ.trim()) return;
    setSearching(true);
    try {
      const r = await adminFetch(apiUrl('/api/admin/users/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQ.trim(),
        }),
      });
      const j = await parseApiJson<{ users?: SearchUser[]; error?: string }>(r);
      if (!r.ok) {
        throw new Error(j.error || `Search failed (${r.status})`);
      }
      setSearchResults(j.users ?? []);
      if ((j.users ?? []).length === 0) {
        showToast('No users matched.', 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Search failed', 'error');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectUser = (u: SearchUser) => {
    setSelected(u);
    setEditUsername(u.username);
    setEditMod(u.is_moderator);
    setEditAdmin(u.is_admin);
  };

  const saveUser = async () => {
    if (!publicKey || !selected) return;
    setSavingUser(true);
    try {
      const body: Record<string, unknown> = {
        target_wallet: selected.wallet,
        is_moderator: editMod,
        is_admin: editAdmin,
      };
      const nextName = editUsername.trim().toLowerCase();
      if (nextName !== selected.username) {
        body.username = nextName;
      }
      const r = await adminFetch(apiUrl('/api/admin/users/patch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await parseApiJson<{ error?: string }>(r);
      if (!r.ok) {
        throw new Error(j.error || `Save failed (${r.status})`);
      }
      showToast('User updated.', 'success');
      setSelected(null);
      setSearchResults([]);
      setSearchQ('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSavingUser(false);
    }
  };

  if (!publicKey || (!isRegistered && !profileLoading)) {
    return (
      <div className="min-h-screen bg-white text-gray-900 p-6">
        <p className="text-sm text-gray-700" style={{ fontFamily: 'Arial, sans-serif' }}>
          Connect and register to access the admin panel.
        </p>
        <Link to="/forums" className="text-blue-700 underline text-sm mt-4 inline-block">
          ← Forums
        </Link>
      </div>
    );
  }

  if (accountLoading) {
    return (
      <div className="min-h-screen bg-white p-6 text-sm text-gray-600">Loading…</div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-white text-gray-900 p-6">
        <p className="text-sm text-red-800" style={{ fontFamily: 'Arial, sans-serif' }}>
          Administrator access only.
        </p>
        <Link to="/forums" className="text-blue-700 underline text-sm mt-4 inline-block">
          ← Forums
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <Link to="/forums" className="text-blue-700 hover:text-blue-900 underline">
            ← Forums
          </Link>
          <LoginDropdown />
        </div>

        <h1 className="section-header" style={{ marginTop: 0 }}>
          Admin control panel
        </h1>
        <p
          className="text-sm text-gray-700 mb-6"
          style={{ fontFamily: 'Times New Roman, serif' }}
        >
          Configure per-board rank requirements and manage user accounts. The first admin action on this page asks
          Phantom to sign once; the server then issues a short-lived session token so later saves and searches do not
          need a signature. Identity comes from that token, not from a wallet field in JSON.
        </p>

        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Arial, sans-serif' }}>
            Board permissions
          </h2>
          {boardsLoading ? (
            <p className="text-sm text-gray-600">Loading boards…</p>
          ) : null}
          {boardsError ? (
            <p className="text-sm text-red-800">{boardsError}</p>
          ) : null}
          <div className="space-y-8">
            {sectionGroups.map(({ section, boards: list }) => (
              <div key={section}>
                <h3
                  className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3"
                  style={{ fontFamily: 'Arial, sans-serif' }}
                >
                  {section}
                </h3>
                <div className="space-y-3">
                  {list.map((b) => (
                    <BoardRankEditor
                      key={b.id}
                      board={b}
                      saving={savingBoardId === b.id}
                      onSave={(start, reply) => void saveBoardRanks(b, start, reply)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Arial, sans-serif' }}>
            Dividends (fee deposits)
          </h2>
          <p className="text-sm text-gray-700 mb-3" style={{ fontFamily: 'Times New Roman, serif' }}>
            Submit a tx signature for the SPL transfer <strong>DEV wallet to TREASURY wallet</strong> of
            the configured LITE token. Same tx_sig cannot be recorded twice.
          </p>
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <input
              type="text"
              value={depositTxSig}
              onChange={(e) => setDepositTxSig(e.target.value)}
              placeholder="Paste tx signature…"
              className="text-sm border border-gray-400 px-2 py-1.5 min-w-[16rem] font-mono"
              style={{ fontFamily: 'Arial, sans-serif' }}
              disabled={submittingDeposit}
            />
            <button
              type="button"
              disabled={submittingDeposit || !depositTxSig.trim()}
              onClick={async () => {
                setSubmittingDeposit(true);
                try {
                  const r = await adminFetch(apiUrl('/api/dividends/deposits/submit'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tx_sig: depositTxSig.trim() }),
                  });
                  const j = await parseApiJson<{ error?: string; alreadyRecorded?: boolean; ok?: boolean }>(r);
                  if (!r.ok) throw new Error(j.error || `Submit failed (${r.status})`);
                  if (j.alreadyRecorded) {
                    showToast('That tx signature was already recorded.', 'success');
                  } else {
                    showToast('Deposit recorded. Next snapshot will include it.', 'success');
                  }
                  setDepositTxSig('');
                } catch (e) {
                  showToast(e instanceof Error ? e.message : 'Submit failed', 'error');
                } finally {
                  setSubmittingDeposit(false);
                }
              }}
              className="text-sm px-4 py-1.5 border border-gray-800 bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-50"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              {submittingDeposit ? 'Submitting…' : 'Add deposit'}
            </button>
          </div>
          <Link
            to="/dividends"
            className="text-blue-700 hover:text-blue-900 underline text-sm inline-block"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            Open dividends page
          </Link>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Arial, sans-serif' }}>
            Search users
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Username contains…"
              className="text-sm border border-gray-400 px-2 py-1.5 min-w-[12rem]"
            />
            <button
              type="button"
              disabled={searching || !searchQ.trim()}
              onClick={() => void runSearch()}
              className="text-sm px-3 py-1.5 border border-gray-800 bg-white hover:bg-gray-50 disabled:opacity-50"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {searchResults.length > 0 ? (
            <ul className="list-none p-0 m-0 space-y-1 mb-4">
              {searchResults.map((u) => (
                <li key={u.wallet}>
                  <button
                    type="button"
                    className="text-left text-sm text-blue-800 underline"
                    onClick={() => selectUser(u)}
                  >
                    {u.username}
                  </button>
                  <span className="text-xs text-gray-500 ml-2 font-mono">
                    {u.wallet.slice(0, 6)}…{u.wallet.slice(-4)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {selected ? (
            <div
              className="border border-gray-400 p-4 bg-gray-50 max-w-lg"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              <p className="text-sm font-semibold m-0 mb-2">Edit {selected.username}</p>
              <label className="block text-xs text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="w-full text-sm border border-gray-400 px-2 py-1 mb-3"
              />
              <label className="flex items-center gap-2 text-sm mb-2">
                <input
                  type="checkbox"
                  checked={editMod}
                  onChange={(e) => setEditMod(e.target.checked)}
                />
                Moderator
              </label>
              <label className="flex items-center gap-2 text-sm mb-4">
                <input
                  type="checkbox"
                  checked={editAdmin}
                  onChange={(e) => setEditAdmin(e.target.checked)}
                />
                Administrator
              </label>
              <button
                type="button"
                disabled={savingUser}
                onClick={() => void saveUser()}
                className="text-sm px-4 py-2 border border-gray-800 bg-white hover:bg-gray-100 disabled:opacity-50"
              >
                {savingUser ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

function BoardRankEditor({
  board,
  onSave,
  saving,
}: {
  board: ForumBoardRow;
  onSave: (start: ForumBoardMinRank, reply: ForumBoardMinRank) => void;
  saving: boolean;
}) {
  const effStart =
    board.min_rank_start_thread ??
    (board.admin_only_post ? 'administrator' : 'member');
  const effReply = board.min_rank_reply ?? 'member';
  const [start, setStart] = useState<ForumBoardMinRank>(effStart);
  const [reply, setReply] = useState<ForumBoardMinRank>(effReply);

  useEffect(() => {
    setStart(effStart);
    setReply(effReply);
  }, [board.id, effStart, effReply]);

  const selectClass = 'text-sm border border-gray-400 px-1 py-1 w-full min-w-0 sm:w-[7.75rem]';

  return (
    <div
      className="border border-gray-300 bg-white p-3 grid gap-3 sm:gap-x-4 sm:grid-cols-[minmax(0,1fr)_7.75rem_7.75rem_auto] sm:items-end"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      <div className="min-w-0 sm:row-auto">
        <p className="text-sm font-semibold m-0 mb-1 truncate" title={board.title}>
          {board.title}
        </p>
        <p className="text-xs text-gray-500 m-0 truncate font-mono" title={board.id}>
          {board.id}
        </p>
      </div>
      <label className="text-xs block min-w-0">
        <span className="block text-gray-600 mb-0.5">New threads</span>
        <select
          className={selectClass}
          value={start}
          disabled={saving}
          onChange={(e) => setStart(e.target.value as ForumBoardMinRank)}
        >
          {START_RANK_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs block min-w-0">
        <span className="block text-gray-600 mb-0.5">Replies</span>
        <select
          className={selectClass}
          value={reply}
          disabled={saving}
          onChange={(e) => setReply(e.target.value as ForumBoardMinRank)}
        >
          {REPLY_RANK_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r === 'none' ? 'no one' : r}
            </option>
          ))}
        </select>
      </label>
      <div className="flex sm:justify-end sm:pb-0.5">
        <button
          type="button"
          disabled={saving}
          className="text-sm px-3 py-1.5 border border-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 shrink-0 w-full sm:w-auto"
          onClick={() => onSave(start, reply)}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default AdminPage;
