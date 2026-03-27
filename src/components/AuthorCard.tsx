import { useState } from 'react';
import { Link } from 'react-router-dom';

const LITE_TOKEN_ADDRESS = 'TBA';

function IconGitHub({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const AuthorCard = () => {
  const [copied, setCopied] = useState(false);
  const canCopy = LITE_TOKEN_ADDRESS !== 'TBA';

  const handleCopy = async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(LITE_TOKEN_ADDRESS);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // If clipboard is blocked, we just don't show "Copied".
    }
  };

  return (
    <div className="author-card">
      <div className="social-links">
        <Link to="/forums" className="social-link" title="Ligder forums">
          Forums
        </Link>
        <span className="social-separator">|</span>
        <Link to="/forums/archive" className="social-link" title="On-chain archive and memo verification">
          Archive &amp; Verify
        </Link>
        <span className="social-separator">|</span>
        <Link to="/dividends" className="social-link" title="Dividend claims">
          Dividend Claims
        </Link>
        <span className="social-separator">|</span>
        <Link to="/for-developers" className="social-link" title="Technical docs and repo links">
          For Developers
        </Link>
      </div>

      <div className="author-layout">
        <div className="author-photo-column">
          <div className="author-photo">
            <img
              src="/images/NEWPROFILE.png"
              alt="Ligder"
              className="author-portrait"
            />
          </div>
          <div className="author-photo-socials" aria-label="Social">
            <a
              href="https://github.com/drligder/ligder-project"
              className="author-social-icon"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub"
            >
              <IconGitHub className="w-7 h-7" />
            </a>
            <span className="author-social-vsep" aria-hidden="true" />
            <a
              href="https://x.com/Doctor_Ligder"
              className="author-social-icon"
              target="_blank"
              rel="noopener noreferrer"
              title="X"
            >
              <IconX className="w-6 h-7" />
            </a>
          </div>
        </div>

        <div className="author-info">
          <h3 className="author-name">Ligder</h3>

          <div className="token-address-block">
            <div className="token-address-label" style={{ fontFamily: 'Arial, sans-serif' }}>
              Token address
            </div>
            <div className="token-address-row">
              <div className="token-address-value">
                <span style={{ fontFamily: 'Times New Roman, serif' }}>$LITE:</span>{' '}
                <span>{LITE_TOKEN_ADDRESS}</span>
              </div>
              <button
                className="token-copy-button"
                onClick={handleCopy}
                disabled={!canCopy}
                aria-disabled={!canCopy}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="author-bio">
            <p className="bio-paragraph">
              Wallet-native forum on Solana: connect with Phantom, register a username, and join the{' '}
              <Link to="/forums" className="text-blue-700 hover:text-blue-900 underline">
                forums
              </Link>
              . We never touch your keys. Your LITE balance is read on-chain and shown on your profile
              and on every post you make. Where we relay attestations, thread and reply actions are
              integrated on-chain so they can be checked against the forum and verified end to end.
            </p>

            <p className="bio-paragraph final-bio">
              Fee distribution back to holders: Every transaction on the liquidity pool generates
              fees. We're sending them straight back to LITE holders—1:1, no cut. As long as
              you're holding, you're eligible to claim. It's that simple.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthorCard;
