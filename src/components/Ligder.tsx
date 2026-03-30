import { Link } from 'react-router-dom';

const inlineLink =
  'font-semibold text-blue-700 hover:text-blue-900 underline decoration-blue-700/80';

const Ligder = () => {
  return (
    <section className="prose-academic">
      <h2 className="section-header">Ligder: A Token-Gated Governance Forum Built on Solana</h2>

      <p className="academic-text">
        Back in 2013, we had one thing: a forum and an idea. No roadmap, no promises—just people
        talking, disagreeing, building together. The best projects weren&apos;t the ones with the
        most polish; they were the ones where the community actually mattered. Today Ligder is that
        spirit on Solana: a token paired with an oldschool forum—think bitcointalk meets on-chain
        verification. Your wallet is your identity, and your LITE balance is how much weight you
        carry in the room.
      </p>

      <p className="academic-text">
        You register with a single <strong>sign message</strong>—no custody, no broad permissions.
        From that, the app only reads your <strong>LITE balance</strong> on-chain. We don&apos;t
        request anything else: not your other tokens, not your history, not your keys. That
        balance is <strong>on your profile</strong> and <strong>under every post</strong>, so
        everyone sees how aligned someone is in the only metric that matters here—skin in the game.
        The more LITE you hold, the more <em>representable</em> you are: your voice scales with your
        stake, and the largest supporters carry the most influence in how the project&apos;s path
        gets made—not in a backroom, but in threads and votes that match what the chain already
        knows about commitment. The forum isn&apos;t flat: casual discussion stays open, while
        governance votes, treasury moves, and protocol changes sit behind thresholds. The more you
        hold, the more rooms you can access—transparent and on-chain.
      </p>

      <p className="academic-text">
        Nothing here is meant to be opaque: <strong>usernames map to Solana wallets</strong> in an
        open profile store. The forum is organized into{' '}
        <Link to="/forums" className={inlineLink}>
          sections and boards
        </Link>
        —each with its own thread list, markdown posts, and per-board rules for who may start
        threads or reply. <strong>Post voting</strong> (up and down) is stored with the forum; where
        we relay them, <strong>new threads and replies are attested on-chain</strong> via Solana Memo
        so hashes line up with what you read in the UI, while{' '}
        <strong>full post bodies stay in the database</strong> for speed and search. The{' '}
        <Link to="/forums/archive" className={inlineLink}>
          Archive &amp; Verify
        </Link>{' '}
        flow is there so anyone can check what was committed. The whole stack—contracts, indexer,
        backend, frontend—is <strong>open source</strong>.
      </p>

      <p className="academic-text">
        We&apos;re shipping a Github repo with the full stack—the Anchor program, indexer, forum
        backend, and frontend—meant to be forked. Clone it, tune the config, deploy your own
        governance token with the same structure. The dividend-claim system for fees is included
        too, so anyone can verify how liquidity-pool fees become LITE-holder claims. LITE is a
        toolkit for communities that want to own governance—no VC, no team allocation, no vesting.
        Just holders and a forum.
      </p>

      <p className="academic-text !mb-0 flex flex-wrap items-start gap-2 pb-12 md:pb-16">
        <img
          src="/icons/snowball-48.png"
          alt=""
          width={28}
          height={28}
          className="mt-0.5 h-7 w-7 shrink-0 object-contain"
          decoding="async"
        />
        <span>
          Want to read more?{' '}
          <a
            href="/Papers/ligder-gazette.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 hover:text-blue-900 underline"
          >
            Read our Ligder Gazette
          </a>
        </span>
      </p>

      <h2 className="section-header mt-0">Create your project&apos;s Liteboard</h2>

      <p className="academic-text">
        A <strong>Liteboard</strong> is a small, separate forum tied to <strong>one SPL token mint</strong>,
        outside the main Ligder section boards. <strong>Deploy is limited to tokens listed on pump.fun</strong>{' '}
        (verified via their public API); other launchpads are not supported for self-serve setup yet. You
        connect a wallet, paste the mint, and sign so we know which wallet will <strong>own</strong> the board.
        The server issues a <strong>one-time code</strong> (stored only as a hash; it expires and works once).
        Register a Ligder username if needed, then sign again with that code to <strong>create</strong> the
        board.
      </p>

      <p className="academic-text">
        Each Liteboard gets two channels: <strong>Announcement</strong>, where only the registered owner
        wallet may post (so token stewards can publish updates), and <strong>General</strong>, where any{' '}
        <strong>registered Ligder user</strong> can start threads and reply—so holders and community
        members can talk without each project running its own forum stack. Boards are reachable at{' '}
        <code className="text-sm bg-gray-100 px-1 py-0.5 rounded">/liteboard/&lt;mint&gt;</code> and
        discoverable from the <strong>Liteboard Explorer</strong> by searching a mint.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 not-prose">
        <Link
          to="/liteboard/deploy"
          className="text-sm px-4 py-2 border border-gray-800 bg-white text-gray-900 hover:bg-gray-100 text-center no-underline inline-block"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          Deploy a Liteboard
        </Link>
        <Link
          to="/liteboard/explorer"
          className="text-sm px-4 py-2 border border-gray-400 bg-white text-blue-800 hover:bg-gray-50 text-center no-underline inline-block"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          Liteboard Explorer
        </Link>
      </div>
    </section>
  );
};

export default Ligder;
