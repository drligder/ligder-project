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
    <div className="fixed inset-0 bg-gray-100 flex items-center justify-center z-50 px-8">
      <div className="text-center max-w-4xl w-full">
        <div
          className="relative w-full h-64 bg-cover bg-center bg-black flex items-center justify-center mb-8 border-2 border-gray-400 shadow-lg"
          style={{
            backgroundImage: 'url(/images/BackgroundLoading.png)',
            filter: 'grayscale(100%) brightness(90%) contrast(120%)',
          }}
        >
          <div className="absolute inset-0 bg-gray-900 bg-opacity-50"></div>

          <div className="relative z-10 text-center">
            <div className="mb-4">
              <img
                src="/images/NEWPROFILE.png"
                alt=""
                className="w-24 h-24 mx-auto border-2 border-white object-cover"
                style={{ filter: 'grayscale(100%) brightness(110%) contrast(90%)' }}
              />
            </div>

            <h1 className="text-4xl font-bold text-gray-100 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
              Ligder
            </h1>
          </div>
        </div>

        <div
          className="mb-8 p-6 bg-white border-2 border-gray-400 shadow-lg max-w-2xl mx-auto"
          style={{ fontFamily: 'Times New Roman, serif' }}
        >
          <p className="text-base text-gray-800 mb-6">
            A live Solana forum: connect with Phantom, register a username, and post on the
            forums. Thread and reply bodies live in the database; where attestations are enabled,
            commitments are relayed on-chain so you can match posts to Memos. Profiles show your
            LITE balance beside your name—weight that scales with skin in the game.
          </p>
          <p className="text-base text-gray-800">
            Voting, moderation tiers, Archive &amp; Verify, and the full stack in the repo—open,
            readable, forkable.
          </p>
        </div>

        <div className="mb-6">
          <div className="mb-4 text-center">
            <span className="text-gray-700" style={{ fontFamily: 'Arial, sans-serif' }}>
              Loading
            </span>
          </div>

          <div className="w-80 mx-auto">
            <div className="bg-gray-300 border border-gray-400 h-6 relative overflow-hidden">
              <div
                className="bg-black h-full transition-all duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-mono text-white">{Math.round(progress)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
