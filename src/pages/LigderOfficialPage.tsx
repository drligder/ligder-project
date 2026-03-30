import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { ForumBoardsTable } from '../components/forum/ForumBoardsTable';
import { useWallet } from '../contexts/WalletContext';
import { useProfileAdmin } from '../hooks/useProfileAdmin';
import { useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl, describeForumApiFailure } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import type { ForumBoardRow } from '../types/forumBoards';

/** DB `forum_boards.section` value (see for_developers/sql/007_forum_boards_threads.sql) */
const SECTION_DB = 'LIGDER OFFICIAL';
const SECTION_LABEL = 'Ligder Official';
const BOARD_BASE = '/forums/ligder-official';

const LigderOfficialPage = () => {
  const { publicKey } = useWallet();
  const { isRegistered, profileLoading } = useLigderProfile();
  const { isAdmin } = useProfileAdmin();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [boards, setBoards] = useState<ForumBoardRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetch(apiUrl(`/api/forum/boards?section=${encodeURIComponent(SECTION_DB)}`))
      .then(async (r) => {
        const j = await parseApiJson<{ boards?: ForumBoardRow[]; error?: string }>(r);
        if (cancelled) return;
        if (!r.ok) {
          throw new Error(describeForumApiFailure(j.error, r.status));
        }
        setBoards(j.boards ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load');
          setBoards([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-5 sm:px-6 sm:py-6">
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <Link to="/forums" className="text-blue-700 hover:text-blue-900 underline">
            ← Back to forums
          </Link>
          <div className="flex items-center gap-2">
            <LoginDropdown />
            {showRegister ? (
              <Link
                to="/forums/register"
                className="text-sm px-3 py-1.5 border border-gray-400 bg-white text-blue-700 hover:text-blue-900 hover:bg-gray-50"
              >
                Register
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex justify-center mb-4">
          <img
            src="/images/readmore.png"
            alt=""
            className="h-auto w-auto max-w-md sm:max-w-lg object-contain opacity-95"
          />
        </div>

        <h1
          className="section-header flex flex-wrap items-center gap-2"
          style={{ marginTop: 0 }}
        >
          <span>{SECTION_LABEL}</span>
        </h1>

        {loading ? (
          <p className="text-sm text-gray-600" style={{ fontFamily: 'Arial, sans-serif' }}>
            Loading boards…
          </p>
        ) : null}
        {loadError ? (
          <p className="text-sm text-red-800 mb-4" style={{ fontFamily: 'Times New Roman, serif' }}>
            {loadError}
          </p>
        ) : null}

        {!loading && !loadError && boards.length > 0 ? (
          <ForumBoardsTable boards={boards} boardLinkBase={BOARD_BASE} />
        ) : null}

        {!loading && !loadError && boards.length === 0 ? (
          <p className="text-sm text-gray-600">No boards in this section yet.</p>
        ) : null}

        {isAdmin && isRegistered ? (
          <div className="mt-4 p-4 border border-gray-400 bg-gray-50">
            <p className="text-sm text-gray-800 m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
              <strong className="font-semibold">Administrator</strong> — open a board above, then use{' '}
              <strong>Sign &amp; create</strong> to start a thread (wallet signature).
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default LigderOfficialPage;
