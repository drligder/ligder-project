import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { useForumAccount } from '../hooks/useForumAccount';
import { useLigderProfile } from '../hooks/useLigderProfile';

export function LoginDropdown() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { publicKey, connecting, error, clearError, connect, disconnect } = useWallet();
  const { username } = useLigderProfile();
  const { isAdmin: isForumAdmin } = useForumAccount();

  const triggerLabel = !publicKey
    ? 'Login ▾'
    : username
      ? `Logged in as: ${username} ▾`
      : 'Wallet connected ▾';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={username ? `Logged in as ${username}` : publicKey ? publicKey : 'Login'}
        onClick={() => {
          clearError();
          setOpen((v) => !v);
        }}
        className="text-sm px-3 py-1.5 border border-gray-400 bg-white text-gray-900 hover:bg-gray-50 max-w-[min(100vw-2rem,18rem)] truncate text-left"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        {triggerLabel}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 w-60 border border-gray-400 bg-white shadow-md z-50 p-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          {!publicKey ? (
            <button
              type="button"
              className="w-full text-left text-blue-700 hover:text-blue-900 underline disabled:text-gray-500"
              disabled={connecting}
              onClick={async () => {
                clearError();
                const ok = await connect();
                if (ok) setOpen(false);
              }}
            >
              {connecting ? 'Connecting…' : 'Connect with Phantom'}
            </button>
          ) : (
            <div className="space-y-2">
              {username ? (
                <p className="text-xs text-gray-800 m-0 leading-snug">
                  Logged in as:{' '}
                  <span className="font-semibold text-gray-900">{username}</span>
                </p>
              ) : (
                <div className="text-xs text-gray-600 break-all font-mono">
                  {publicKey.slice(0, 6)}…{publicKey.slice(-6)}
                </div>
              )}
              {username ? (
                <Link
                  to="/forums/account"
                  state={{ from: `${location.pathname}${location.search}${location.hash}` }}
                  className="block w-full text-left text-blue-700 hover:text-blue-900 underline py-0.5"
                  onClick={() => setOpen(false)}
                >
                  Account settings
                </Link>
              ) : null}
              {username ? (
                <Link
                  to="/forums/messages"
                  className="block w-full text-left text-blue-700 hover:text-blue-900 underline py-0.5"
                  onClick={() => setOpen(false)}
                >
                  Messages
                </Link>
              ) : null}
              {username && isForumAdmin ? (
                <Link
                  to="/forums/admin"
                  className="block w-full text-left text-blue-700 hover:text-blue-900 underline py-0.5"
                  onClick={() => setOpen(false)}
                >
                  Admin CP
                </Link>
              ) : null}
              <button
                type="button"
                className="w-full text-left text-blue-700 hover:text-blue-900 underline"
                onClick={async () => {
                  await disconnect();
                  setOpen(false);
                }}
              >
                Log out
              </button>
            </div>
          )}
          {error ? <p className="text-red-700 text-xs mt-2 leading-snug">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
