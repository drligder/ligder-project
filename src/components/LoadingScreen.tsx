import { useState, useEffect } from 'react';

const LoadingScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          setTimeout(onComplete, 500);
          return 100;
        }
        return prev + 3.33;
      });
    }, 100);

    return () => {
      clearInterval(progressInterval);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 min-h-dvh overflow-y-auto overscroll-y-contain bg-gray-100">
      <div className="flex min-h-dvh flex-col justify-center px-4 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-4xl text-center">
          <div
            className="relative mb-6 flex min-h-[10rem] w-full items-center justify-center border-2 border-gray-400 bg-black bg-cover bg-center shadow-lg sm:mb-8 sm:min-h-[16rem]"
            style={{
              backgroundImage: 'url(/images/BackgroundLoading.png)',
              filter: 'grayscale(100%) brightness(90%) contrast(120%)',
            }}
          >
            <div className="absolute inset-0 bg-gray-900/50" />

            <div className="relative z-10 px-3 text-center">
              <div className="mb-3 sm:mb-4">
                <img
                  src="/images/NEWPROFILE.png"
                  alt=""
                  className="mx-auto h-20 w-20 border-2 border-white object-cover sm:h-24 sm:w-24"
                  style={{ filter: 'grayscale(100%) brightness(110%) contrast(90%)' }}
                />
              </div>

              <h1
                className="ligder-pixel-title mb-1 text-gray-100 sm:mb-2"
                style={{
                  fontSize: 'clamp(1.75rem, 7vw, 2.75rem)',
                  lineHeight: 1.15,
                  letterSpacing: '0.04em',
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Ligder
              </h1>
            </div>
          </div>

          <div
            className="mx-auto mb-6 max-w-2xl border-2 border-gray-400 bg-white p-4 shadow-lg sm:mb-8 sm:p-6"
            style={{ fontFamily: 'Times New Roman, serif' }}
          >
            <p className="mb-4 text-sm leading-relaxed text-gray-800 sm:mb-6 sm:text-base">
              A live Solana forum: connect with Phantom, register a username, and post on the
              forums. Thread and reply bodies live in the database; where attestations are enabled,
              commitments are relayed on-chain so you can match posts to Memos. Profiles show your
              LITE balance beside your name—weight that scales with skin in the game.
            </p>
            <p className="text-sm leading-relaxed text-gray-800 sm:text-base">
              Voting, moderation tiers, Archive &amp; Verify, and the full stack in the repo—open,
              readable, forkable.
            </p>
          </div>

          <div className="mx-auto w-full max-w-md px-1">
            <p
              className="mb-2 text-center text-sm text-gray-800 sm:mb-3"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              Loading
            </p>
            <div
              className="h-3 w-full overflow-hidden border border-gray-500 bg-gray-200 sm:h-3.5"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-gray-900 transition-[width] duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p
              className="mt-2 text-center text-base font-mono tabular-nums text-gray-900 sm:text-lg"
              aria-live="polite"
            >
              {Math.round(progress)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
