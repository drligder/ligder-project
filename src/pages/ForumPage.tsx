import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { RegistrationWelcomeModal } from '../components/RegistrationWelcomeModal';
import { ForumBoardsTable } from '../components/forum';
import { useWallet } from '../contexts/WalletContext';
import { useForumAccount } from '../hooks/useForumAccount';
import { LIGDER_PROFILE_UPDATED_EVENT, useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl, describeForumApiFailure } from '../lib/apiBase';
import { parseApiJson } from '../lib/parseApiJson';
import type { ForumBoardRow } from '../types/forumBoards';

/** DB `forum_boards.section` values */
const LIGDER_SECTION_DB = 'LIGDER OFFICIAL';
const LIGDER_SECTION_LABEL = 'Ligder Official';
const LIGDER_BOARD_BASE = '/forums/ligder-official';

const GENERAL_SECTION_DB = 'LIGDER GENERAL';
const GENERAL_SECTION_LABEL = 'Ligder General';
const GENERAL_BOARD_BASE = '/forums/ligder-general';

const TECHNICAL_SECTION_DB = 'LIGDER TECHNICAL';
const TECHNICAL_SECTION_LABEL = 'Ligder Technical';
const TECHNICAL_BOARD_BASE = '/forums/ligder-technical';
const GOVERNANCE_SECTION_DB = 'LIGDER GOVERNANCE';
const GOVERNANCE_SECTION_LABEL = 'Ligder Governance';
const GOVERNANCE_BOARD_BASE = '/forums/ligder-governance';
const GOVERNANCE_MIN_HOLDINGS = 2_500_000;

/** e.g. March 25, 2026, 04:54:06 PM — updates every second while the page is open */
function formatProjectTime(d: Date): string {
  const month = d.toLocaleString('en-US', { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  let h = d.getHours();
  const isPm = h >= 12;
  h = h % 12;
  if (h === 0) h = 12;
  const hh = String(h).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${month} ${day}, ${year}, ${hh}:${mm}:${ss} ${isPm ? 'PM' : 'AM'}`;
}

type ForumLocationState = { registrationWelcome?: { username: string } };
const FORUM_BOARDS_CACHE_VERSION = 1;
const FORUM_BOARDS_CACHE_MAX_AGE_MS = 60_000;

const ForumPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const { username, isRegistered, profileLoading } = useLigderProfile();
  const { isAdmin, isModerator } = useForumAccount();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  const [now, setNow] = useState(() => new Date());
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const [welcomeModalUser, setWelcomeModalUser] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [ligderBoards, setLigderBoards] = useState<ForumBoardRow[]>([]);
  const [generalBoards, setGeneralBoards] = useState<ForumBoardRow[]>([]);
  const [technicalBoards, setTechnicalBoards] = useState<ForumBoardRow[]>([]);
  const [governanceBoards, setGovernanceBoards] = useState<ForumBoardRow[]>([]);
  const [canSeeGovernance, setCanSeeGovernance] = useState(false);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [boardsError, setBoardsError] = useState<string | null>(null);

  const loadForumAvatar = useCallback(() => {
    if (!publicKey || profileLoading || !isRegistered) {
      setProfileAvatarUrl(null);
      return;
    }
    void fetch(apiUrl(`/api/profile?wallet=${encodeURIComponent(publicKey)}`))
      .then(async (r) => {
        const d = await parseApiJson<{ avatar_url?: string | null }>(r);
        if (!r.ok) return;
        const u = d?.avatar_url;
        setProfileAvatarUrl(typeof u === 'string' && u.startsWith('https://') ? u : null);
      })
      .catch(() => setProfileAvatarUrl(null));
  }, [publicKey, isRegistered, profileLoading]);

  useEffect(() => {
    loadForumAvatar();
  }, [loadForumAvatar]);

  useEffect(() => {
    let cancelled = false;
    if (!publicKey) {
      setCanSeeGovernance(false);
      return () => {
        cancelled = true;
      };
    }
    void fetch(apiUrl(`/api/lite-holdings?wallet=${encodeURIComponent(publicKey)}`))
      .then(async (r) => {
        const j = await parseApiJson<{ lite_holdings_ui?: string; error?: string }>(r);
        if (cancelled || !r.ok) return;
        const n = Number(String(j.lite_holdings_ui ?? '').replace(/,/g, '').trim());
        setCanSeeGovernance(Number.isFinite(n) && n >= GOVERNANCE_MIN_HOLDINGS);
      })
      .catch(() => {
        if (!cancelled) setCanSeeGovernance(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  useEffect(() => {
    const onProfile = () => loadForumAvatar();
    window.addEventListener(LIGDER_PROFILE_UPDATED_EVENT, onProfile);
    return () => window.removeEventListener(LIGDER_PROFILE_UPDATED_EVENT, onProfile);
  }, [loadForumAvatar]);

  useEffect(() => {
    const state = location.state as ForumLocationState | null;
    const u = state?.registrationWelcome?.username;
    if (!u) return;
    setWelcomeModalUser(u);
    setWelcomeModalOpen(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location, navigate]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `forum:boards:v${FORUM_BOARDS_CACHE_VERSION}:${publicKey ?? 'guest'}`;
    setBoardsError(null);
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts?: number; boards?: ForumBoardRow[] };
        if (
          typeof parsed.ts === 'number' &&
          Date.now() - parsed.ts <= FORUM_BOARDS_CACHE_MAX_AGE_MS &&
          Array.isArray(parsed.boards)
        ) {
          const allCached = parsed.boards;
          setLigderBoards(allCached.filter((b) => b.section === LIGDER_SECTION_DB));
          setGeneralBoards(allCached.filter((b) => b.section === GENERAL_SECTION_DB));
          setTechnicalBoards(allCached.filter((b) => b.section === TECHNICAL_SECTION_DB));
          setGovernanceBoards(allCached.filter((b) => b.section === GOVERNANCE_SECTION_DB));
          setBoardsLoading(false);
        } else {
          setBoardsLoading(true);
        }
      } else {
        setBoardsLoading(true);
      }
    } catch {
      setBoardsLoading(true);
    }
    const walletQ = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : '';
    void fetch(apiUrl(`/api/forum/boards${walletQ}`))
      .then(async (r) => {
        const j = await parseApiJson<{ boards?: ForumBoardRow[]; error?: string }>(r);
        if (cancelled) return;
        if (!r.ok) {
          throw new Error(describeForumApiFailure(j.error, r.status));
        }
        const all = j.boards ?? [];
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), boards: all }));
        } catch {
          // Ignore quota/storage failures; network result still applies.
        }
        setLigderBoards(all.filter((b) => b.section === LIGDER_SECTION_DB));
        setGeneralBoards(all.filter((b) => b.section === GENERAL_SECTION_DB));
        setTechnicalBoards(all.filter((b) => b.section === TECHNICAL_SECTION_DB));
        setGovernanceBoards(all.filter((b) => b.section === GOVERNANCE_SECTION_DB));
      })
      .catch((e) => {
        if (!cancelled) {
          setBoardsError(e instanceof Error ? e.message : 'Failed to load');
          setLigderBoards([]);
          setGeneralBoards([]);
          setTechnicalBoards([]);
          setGovernanceBoards([]);
        }
      })
      .finally(() => {
        if (!cancelled) setBoardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {welcomeModalUser ? (
        <RegistrationWelcomeModal
          open={welcomeModalOpen}
          username={welcomeModalUser}
          onClose={() => setWelcomeModalOpen(false)}
        />
      ) : null}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <Link to="/" className="text-blue-700 hover:text-blue-900 underline">
            ← Back to Ligder
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
            style={{ imageRendering: 'auto' }}
          />
        </div>

        <h1
          className="ligder-pixel-title text-center mb-4"
          style={{ marginTop: 0, fontSize: 'clamp(1.5rem, 4vw, 2.25rem)' }}
        >
          Ligder forums
        </h1>

        <div
          className="mb-6 flex flex-wrap items-center justify-center gap-3"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <Link
            to="/liteboard/deploy"
            className="text-sm px-4 py-2 border border-gray-800 bg-white text-gray-900 hover:bg-gray-100 text-center no-underline inline-block"
          >
            Deploy a Liteboard
          </Link>
          <Link
            to="/liteboard/explorer"
            className="text-sm px-4 py-2 border border-gray-400 bg-white text-blue-800 hover:bg-gray-50 text-center no-underline inline-block"
          >
            Liteboard Explorer
          </Link>
        </div>
        <p
          className="mb-6 text-center text-xs text-gray-600 max-w-xl mx-auto"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          Liteboard deploy supports <strong>pump.fun</strong> tokens only for now.
        </p>

        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-gray-400 bg-gray-50 px-3 py-2.5 text-sm text-gray-800"
          style={{ fontFamily: 'Times New Roman, serif' }}
        >
          <p className="m-0 flex flex-wrap items-baseline gap-x-1 gap-y-0">
            {publicKey && username ? (
              <>
                <span className="inline-flex flex-wrap items-center gap-2">
                  {profileAvatarUrl ? (
                    <img
                      src={profileAvatarUrl}
                      alt=""
                      className="w-9 h-9 border border-gray-400 object-cover shrink-0 bg-gray-100"
                    />
                  ) : null}
                  <span>
                    <span className="font-semibold text-gray-900">Welcome, {username}.</span>{' '}
                    <span className="text-gray-700">You&apos;re signed in with your registered wallet.</span>
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold text-gray-900">Welcome, Guest.</span>{' '}
                <span>
                  {!publicKey ? (
                    <>
                      Use the <strong className="font-semibold text-gray-900">Login</strong> menu above to
                      connect with Phantom
                      {showRegister ? (
                        <>
                          , or{' '}
                          <Link to="/forums/register" className="text-blue-800 underline hover:text-blue-950">
                            register
                          </Link>{' '}
                          for a username
                        </>
                      ) : null}
                      .
                    </>
                  ) : showRegister ? (
                    <>
                      Your wallet is connected —{' '}
                      <Link to="/forums/register" className="text-blue-800 underline hover:text-blue-950">
                        register
                      </Link>{' '}
                      to claim a username.
                    </>
                  ) : (
                    <>Use the menu above to manage your wallet.</>
                  )}
                </span>
              </>
            )}
          </p>
          <div
            className="shrink-0 text-right"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            <div className="text-[0.65rem] uppercase tracking-wide text-gray-500 mb-0.5">
              Project time
            </div>
            <time
              dateTime={now.toISOString()}
              className="text-xs sm:text-sm text-gray-700 tabular-nums"
              suppressHydrationWarning
            >
              {formatProjectTime(now)}
            </time>
          </div>
        </div>

        {boardsLoading ? (
          <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'Arial, sans-serif' }}>
            Loading forums…
          </p>
        ) : null}
        {boardsError ? (
          <p className="text-sm text-red-800 mb-6" style={{ fontFamily: 'Times New Roman, serif' }}>
            {boardsError}
          </p>
        ) : null}

        {!boardsLoading && !boardsError ? (
          <>
            <h2
              className="text-base font-bold text-gray-900 mb-2 border-b border-gray-400 pb-1 flex flex-wrap items-center gap-2"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              <span>{LIGDER_SECTION_LABEL}</span>
            </h2>
            {ligderBoards.length > 0 ? (
              <ForumBoardsTable boards={ligderBoards} boardLinkBase={LIGDER_BOARD_BASE} />
            ) : (
              <p className="text-sm text-gray-600 mb-6">No boards in this section yet.</p>
            )}

            {canSeeGovernance || isAdmin || isModerator ? (
              <>
                <h2
                  className="text-base font-bold text-gray-900 mb-2 mt-8 border-b border-gray-400 pb-1 flex flex-wrap items-center gap-2"
                  style={{ fontFamily: 'Arial, sans-serif' }}
                >
                  <span>{GOVERNANCE_SECTION_LABEL}</span>
                </h2>
                {governanceBoards.length > 0 ? (
                  <ForumBoardsTable boards={governanceBoards} boardLinkBase={GOVERNANCE_BOARD_BASE} />
                ) : (
                  <p className="text-sm text-gray-600 mb-6">No boards in this section yet.</p>
                )}
              </>
            ) : null}

            <h2
              className="text-base font-bold text-gray-900 mb-2 mt-8 border-b border-gray-400 pb-1 flex flex-wrap items-center gap-2"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              <span>{GENERAL_SECTION_LABEL}</span>
            </h2>
            {generalBoards.length > 0 ? (
              <ForumBoardsTable boards={generalBoards} boardLinkBase={GENERAL_BOARD_BASE} />
            ) : (
              <p className="text-sm text-gray-600 mb-6">No boards in this section yet.</p>
            )}

            <h2
              className="text-base font-bold text-gray-900 mb-2 mt-8 border-b border-gray-400 pb-1 flex flex-wrap items-center gap-2"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              <span>{TECHNICAL_SECTION_LABEL}</span>
            </h2>
            {technicalBoards.length > 0 ? (
              <ForumBoardsTable boards={technicalBoards} boardLinkBase={TECHNICAL_BOARD_BASE} />
            ) : (
              <p className="text-sm text-gray-600 mb-6">No boards in this section yet.</p>
            )}

          </>
        ) : null}
      </div>
    </div>
  );
};

export default ForumPage;
