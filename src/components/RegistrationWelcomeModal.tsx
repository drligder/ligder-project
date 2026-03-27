import { useEffect } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  open: boolean;
  username: string;
  onClose: () => void;
};

export function RegistrationWelcomeModal({ open, username, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="registration-welcome-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog backdrop"
        onClick={onClose}
      />
      <div
        className="relative z-10 max-w-md w-full border-2 border-gray-400 bg-white shadow-lg p-6 text-left"
        style={{ fontFamily: "'Times New Roman', serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="registration-welcome-title"
          className="text-lg font-bold text-gray-950 m-0 mb-3 border-b border-gray-300 pb-2"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          Welcome, {username}
        </h2>
        <p className="text-sm text-gray-800 m-0 mb-3 leading-relaxed">
          Your registration is complete. You&apos;re still connected with the same wallet you used to sign
          up — no separate sign-in step.
        </p>
        <p className="text-sm text-gray-800 m-0 mb-4 leading-relaxed">
          You can now jump into the{' '}
          <Link to="/forums" className="text-blue-800 underline hover:text-blue-950">
            forums
          </Link>{' '}
          and start exploring.
        </p>
        <div className="flex justify-end" style={{ fontFamily: 'Arial, sans-serif' }}>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 border border-gray-800 bg-gray-900 text-white hover:bg-gray-800"
          >
            Continue to forums
          </button>
        </div>
      </div>
    </div>
  );
}
