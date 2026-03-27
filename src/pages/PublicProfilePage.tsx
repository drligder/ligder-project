import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { apiUrl } from '../lib/apiBase';
import { formatLiteHoldings } from '../lib/formatLite';
import { parseApiJson } from '../lib/parseApiJson';
import type { ProfileRow } from '../types/profile';

const PublicProfilePage = () => {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [liveLiteUi, setLiveLiteUi] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [liteLoading, setLiteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const r = await fetch(apiUrl(`/api/profile?username=${encodeURIComponent(username)}`));
        const j = await parseApiJson<ProfileRow & { error?: string }>(r);
        if (cancelled) return;
        if (!r.ok) {
          throw new Error(j.error || 'Could not load profile');
        }
        setProfile(j);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load profile');
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (!profile?.wallet) return;
    let cancelled = false;
    setLiteLoading(true);
    setLiveLiteUi(null);
    void (async () => {
      try {
        const r = await fetch(apiUrl(`/api/lite-holdings?wallet=${encodeURIComponent(profile.wallet)}`));
        const j = await parseApiJson<{ lite_holdings_ui?: string } & { error?: string }>(r);
        if (cancelled) return;
        if (!r.ok) return;
        setLiveLiteUi(typeof j.lite_holdings_ui === 'string' ? j.lite_holdings_ui : null);
      } finally {
        if (!cancelled) setLiteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.wallet]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-xl mx-auto px-6 py-8">
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <Link to="/forums" className="text-blue-700 hover:text-blue-900 underline">
            ← Back to forums
          </Link>
          <LoginDropdown />
        </div>

        <h1 className="section-header" style={{ marginTop: 0 }}>
          Public profile
        </h1>

        {loading ? <p className="text-sm text-gray-600">Loading…</p> : null}
        {error ? <p className="text-sm text-red-800">{error}</p> : null}

        {profile ? (
          <>
            <div className="mb-6 flex gap-4 items-center">
              <div className="w-16 h-16 border border-gray-400 bg-gray-100 overflow-hidden flex items-center justify-center">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl text-gray-500 font-serif">
                    {profile.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p className="text-lg font-semibold m-0" style={{ fontFamily: 'Arial, sans-serif' }}>
                  {profile.username}
                </p>
                <p className="text-xs text-gray-600 m-0 font-mono">{profile.wallet}</p>
                <Link
                  to={`/forums/messages?to=${encodeURIComponent(profile.username)}`}
                  className="text-xs text-blue-700 hover:text-blue-900 underline"
                >
                  Send encrypted PM
                </Link>
              </div>
            </div>

            <h2
              className="text-base font-bold text-gray-900 mb-3 border-b border-gray-400 pb-1"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              Stats
            </h2>
            <ul className="space-y-3 mb-8 list-none m-0 p-0" style={{ fontFamily: 'Times New Roman, serif' }}>
              <li className="flex flex-wrap justify-between gap-2 border border-gray-200 px-3 py-2 bg-gray-50">
                <span className="text-gray-700">Posts created</span>
                <span className="font-mono text-gray-900 font-semibold">{profile.posts_count}</span>
              </li>
              <li className="flex flex-wrap justify-between gap-2 border border-gray-200 px-3 py-2 bg-gray-50">
                <span className="text-gray-700">Threads started</span>
                <span className="font-mono text-gray-900 font-semibold">{profile.threads_started}</span>
              </li>
              <li className="flex flex-wrap justify-between gap-2 border border-gray-200 px-3 py-2 bg-gray-50">
                <span className="text-gray-700">Likes received</span>
                <span className="font-mono text-gray-900 font-semibold">{profile.likes_received}</span>
              </li>
              <li className="flex flex-wrap justify-between gap-2 border border-gray-200 px-3 py-2 bg-gray-50">
                <span className="text-gray-700">Likes given</span>
                <span className="font-mono text-gray-900 font-semibold">{profile.likes_given}</span>
              </li>
              <li className="flex flex-wrap justify-between gap-2 border border-gray-200 px-3 py-2 bg-gray-50">
                <span className="text-gray-700">$LITE holdings (on-chain)</span>
                <span className="font-mono text-gray-900 font-semibold">
                  {liteLoading ? '…' : formatLiteHoldings(liveLiteUi ?? profile.lite_holdings_ui)}
                </span>
              </li>
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default PublicProfilePage;
