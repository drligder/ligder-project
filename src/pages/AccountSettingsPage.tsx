import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../contexts/ToastContext';
import { LIGDER_PROFILE_UPDATED_EVENT, useLigderProfile } from '../hooks/useLigderProfile';
import { apiUrl } from '../lib/apiBase';
import { formatLiteHoldings } from '../lib/formatLite';
import { parseApiJson } from '../lib/parseApiJson';
import { uint8ToBase64 } from '../lib/uint8Base64';
import type { ProfileRow } from '../types/profile';

function isHttpsImageUrl(s: string): boolean {
  const t = s.trim();
  return /^https:\/\//i.test(t);
}

function fileToRawBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result;
      if (typeof dataUrl !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) {
        reject(new Error('Could not read file'));
        return;
      }
      resolve({ mime: m[1], base64: m[2] });
    };
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

const AccountSettingsPage = () => {
  const location = useLocation();
  const { publicKey, signMessage } = useWallet();
  const { isRegistered, profileLoading } = useLigderProfile();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarDraft, setAvatarDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [githubDraft, setGithubDraft] = useState('');
  const [xDraft, setXDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [liveLiteUi, setLiveLiteUi] = useState<string | null>(null);
  const [liteLoading, setLiteLoading] = useState(false);
  const [liteError, setLiteError] = useState<string | null>(null);

  const showRegister = publicKey ? !profileLoading && !isRegistered : true;
  const fromPathRaw =
    typeof (location.state as { from?: unknown } | null)?.from === 'string'
      ? ((location.state as { from?: string } | null)?.from ?? '')
      : '';
  const fromPath = fromPathRaw.startsWith('/') ? fromPathRaw : '';
  const backHref = fromPath || '/forums';
  const backLabel =
    backHref === '/'
      ? 'Home'
      : backHref.startsWith('/forums')
        ? 'Forums'
        : 'Previous page';

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const loadProfile = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(apiUrl(`/api/profile?wallet=${encodeURIComponent(publicKey)}`));
      const j = await parseApiJson<ProfileRow & { error?: string }>(r);
      if (!r.ok) {
        throw new Error(j.error || 'Could not load profile');
      }
      setProfile(j);
      setAvatarDraft(typeof j.avatar_url === 'string' ? j.avatar_url : '');
      setGithubDraft(typeof j.github_handle === 'string' ? j.github_handle : '');
      setXDraft(typeof j.x_handle === 'string' ? j.x_handle : '');
      setSelectedFile(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    setLiteLoading(true);
    setLiteError(null);
    void (async () => {
      try {
        const r = await fetch(
          apiUrl(`/api/lite-holdings?wallet=${encodeURIComponent(publicKey)}`)
        );
        const j = await parseApiJson<{ lite_holdings_ui?: string; error?: string; detail?: string }>(r);
        if (cancelled) return;
        if (!r.ok) {
          const msg = [j.error, j.detail].filter(Boolean).join(' — ');
          throw new Error(msg || 'Could not load LITE balance');
        }
        setLiveLiteUi(
          typeof j.lite_holdings_ui === 'string' ? j.lite_holdings_ui : '0'
        );
      } catch (e) {
        if (!cancelled) {
          setLiteError(e instanceof Error ? e.message : 'Could not load LITE balance');
          setLiveLiteUi(null);
        }
      } finally {
        if (!cancelled) setLiteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const uploadAvatarFile = async () => {
    if (!publicKey || !selectedFile) return;
    setSaving(true);
    try {
      const { base64, mime } = await fileToRawBase64(selectedFile);
      const nonce = crypto.randomUUID();
      const message = ['Ligder avatar upload', `Wallet: ${publicKey}`, `Nonce: ${nonce}`].join('\n');
      const sig = await signMessage(new TextEncoder().encode(message));
      const res = await fetch(apiUrl('/api/profile/avatar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
          imageBase64: base64,
          mimeType: mime,
        }),
      });
      const j = await parseApiJson<{ error?: string; avatar_url?: string }>(res);
      if (!res.ok) {
        throw new Error(j.error || 'Upload failed');
      }
      showToast('Profile picture uploaded and saved to your account.', 'success');
      if (j.avatar_url) setAvatarDraft(j.avatar_url);
      setSelectedFile(null);
      await loadProfile();
      window.dispatchEvent(new Event(LIGDER_PROFILE_UPDATED_EVENT));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveSocialProfiles = async () => {
    if (!publicKey) return;
    const trimmedX = xDraft.trim();
    const trimmedGithub = githubDraft.trim();
    setSaving(true);
    try {
      const nonce = crypto.randomUUID();
      const message = [
        'Ligder profile socials update',
        `Wallet: ${publicKey}`,
        `X Handle: ${trimmedX}`,
        `GitHub Handle: ${trimmedGithub}`,
        `Nonce: ${nonce}`,
      ].join('\n');
      const sig = await signMessage(new TextEncoder().encode(message));
      const res = await fetch(apiUrl('/api/profile/socials'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey,
          message,
          signature: uint8ToBase64(sig),
        }),
      });
      const j = await parseApiJson<{ error?: string; ok?: boolean }>(res);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(
            'Admin endpoint not found (`/api/profile/socials`). Make sure the backend server is restarted after updates.'
          );
        }
        if (res.status === 405) {
          throw new Error('Socials endpoint rejected this method (expected PATCH).');
        }
        throw new Error(j.error || 'Save failed');
      }
      showToast('Profiles saved.', 'success');
      await loadProfile();
      window.dispatchEvent(new Event(LIGDER_PROFILE_UPDATED_EVENT));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const displayPreview =
    previewUrl ||
    (avatarDraft.trim() && isHttpsImageUrl(avatarDraft.trim()) ? avatarDraft.trim() : null);

  if (!publicKey) {
    return <Navigate to="/forums" replace />;
  }
  if (!isRegistered && !profileLoading) {
    return <Navigate to="/forums/register" replace />;
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-xl mx-auto px-6 py-8">
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <Link to={backHref} className="text-blue-700 hover:text-blue-900 underline">
            ← Back to {backLabel}
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

        <h1 className="section-header" style={{ marginTop: 0 }}>
          Account settings
        </h1>

        <p className="text-sm text-gray-700 mb-6" style={{ fontFamily: 'Times New Roman, serif' }}>
          Update how you appear on the forums and review activity stored for your wallet. Uploads are stored
          in Supabase Storage; the public URL is saved on your profile row. Stats update when posting
          features go live; $LITE balance is read from the chain for your connected wallet (no transaction).
        </p>

        {loading ? (
          <p className="text-sm text-gray-600" style={{ fontFamily: 'Arial, sans-serif' }}>
            Loading…
          </p>
        ) : null}
        {loadError ? (
          <p className="text-sm text-red-800 mb-4" style={{ fontFamily: 'Times New Roman, serif' }}>
            {loadError}{' '}
            <button
              type="button"
              className="text-blue-800 underline"
              onClick={() => void loadProfile()}
            >
              Retry
            </button>
          </p>
        ) : null}

        {profile ? (
          <>
            <div className="mb-8 flex flex-wrap gap-6 items-start">
              <div className="shrink-0">
                <div className="text-xs text-gray-600 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Preview
                </div>
                <div className="w-24 h-24 border border-gray-400 bg-gray-100 overflow-hidden flex items-center justify-center">
                  {displayPreview ? (
                    <img
                      src={displayPreview}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span
                      className="text-3xl text-gray-500 font-serif"
                      style={{ fontFamily: 'Times New Roman, serif' }}
                    >
                      {profile.username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-[12rem] space-y-6">
                <div>
                  <label
                    className="block text-xs text-gray-600 mb-1"
                    style={{ fontFamily: 'Arial, sans-serif' }}
                    htmlFor="avatar-file"
                  >
                    Profile picture (upload)
                  </label>
                  <input
                    id="avatar-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="text-sm w-full border border-gray-400 px-2 py-1.5 bg-white file:mr-3 file:text-sm"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setSelectedFile(f ?? null);
                    }}
                  />
                  <p className="text-xs text-gray-600 mt-1.5 m-0" style={{ fontFamily: 'Times New Roman, serif' }}>
                    JPEG, PNG, WebP, or GIF — max 2&nbsp;MB. Stored in your project&apos;s Storage bucket;
                    your profile saves the image URL.
                  </p>
                  <button
                    type="button"
                    disabled={saving || !selectedFile}
                    onClick={() => void uploadAvatarFile()}
                    className="mt-3 text-sm px-4 py-2 border border-gray-800 bg-gray-900 text-white disabled:opacity-50"
                    style={{ fontFamily: 'Arial, sans-serif' }}
                  >
                    {saving ? 'Uploading…' : 'Upload & save'}
                  </button>
                </div>

                {/* Upload-only: URL-based image setting removed by request */}
              </div>
            </div>

          <div className="border border-gray-200 bg-gray-50 p-4 mb-8">
            <h2
              className="text-base font-bold text-gray-900 mb-3"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              Set profiles
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1" style={{ fontFamily: 'Arial, sans-serif' }} htmlFor="github-handle">
                  GitHub handle
                </label>
                <input
                  id="github-handle"
                  type="text"
                  value={githubDraft}
                  onChange={(e) => setGithubDraft(e.target.value)}
                  placeholder="octocat"
                  className="w-full border border-gray-400 px-2 py-1.5 text-sm font-mono bg-white"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1" style={{ fontFamily: 'Arial, sans-serif' }} htmlFor="x-handle">
                  X handle
                </label>
                <input
                  id="x-handle"
                  type="text"
                  value={xDraft}
                  onChange={(e) => setXDraft(e.target.value)}
                  placeholder="jack"
                  className="w-full border border-gray-400 px-2 py-1.5 text-sm font-mono bg-white"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveSocialProfiles()}
                  className="text-sm px-4 py-2 border border-gray-600 bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  style={{ fontFamily: 'Arial, sans-serif' }}
                >
                  {saving ? 'Saving…' : 'Save profiles'}
                </button>
                <span className="text-xs text-gray-600" style={{ fontFamily: 'Times New Roman, serif' }}>
                  Stored as handles (without @). Your posts will show icons automatically.
                </span>
              </div>
              {(githubDraft.trim() || xDraft.trim()) ? (
                <div className="text-xs text-gray-600" style={{ fontFamily: 'Times New Roman, serif' }}>
                  Preview:{' '}
                  {githubDraft.trim() ? (
                    <a
                      href={`https://github.com/${encodeURIComponent(githubDraft.trim().replace(/^@/, ''))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-800 underline hover:text-blue-950"
                    >
                      GitHub
                    </a>
                  ) : null}
                  {githubDraft.trim() && xDraft.trim() ? ' · ' : null}
                  {xDraft.trim() ? (
                    <a
                      href={`https://x.com/${encodeURIComponent(xDraft.trim().replace(/^@/, ''))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-800 underline hover:text-blue-950"
                    >
                      X
                    </a>
                  ) : null}
                </div>
              ) : null}
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
                <span className="text-gray-700">Reputation</span>
                <span className="font-mono text-gray-900 font-semibold">
                  {formatLiteHoldings(profile.reputation ?? null)}
                </span>
              </li>
              <li className="flex flex-wrap justify-between gap-2 border border-gray-200 px-3 py-2 bg-gray-50">
                <span className="text-gray-700">Likes received</span>
                <span className="font-mono text-gray-900 font-semibold">{profile.likes_received}</span>
              </li>
              <li className="flex flex-wrap justify-between gap-2 border border-gray-200 px-3 py-2 bg-gray-50">
                <span className="text-gray-700">Likes given</span>
                <span className="font-mono text-gray-900 font-semibold">{profile.likes_given}</span>
              </li>
              <li className="border border-gray-200 px-3 py-2 bg-gray-50">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-gray-700">$LITE holdings (on-chain)</span>
                  <span className="font-mono text-gray-900 font-semibold">
                    {liteLoading
                      ? '…'
                      : liteError
                        ? '—'
                        : formatLiteHoldings(liveLiteUi)}
                  </span>
                </div>
                {liteError ? (
                  <p
                    className="text-xs text-gray-600 m-0 mt-1 font-sans"
                    style={{ fontFamily: 'Arial, sans-serif' }}
                  >
                    {liteError}
                  </p>
                ) : null}
              </li>
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default AccountSettingsPage;
