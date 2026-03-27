import { Link } from 'react-router-dom';
import { LoginDropdown } from '../components/LoginDropdown';

const REPO_URL = 'https://github.com/drligder/ligder-project';

const ForDevelopersPage = () => {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/" className="text-blue-700 hover:text-blue-900 underline">
              ← Home
            </Link>
          </div>
          <LoginDropdown />
        </div>

        <section className="mb-8 border border-gray-400 bg-white p-5">
          <div className="flex justify-center mb-4">
            <img
              src="/images/fig047-01.gif"
              alt="For Developers banner"
              className="h-auto w-auto max-w-[75%] bg-white object-contain"
            />
          </div>
          <h1
            className="ligder-pixel-title text-center mb-4"
            style={{ marginTop: 0, fontSize: 'clamp(1.5rem, 4vw, 2.25rem)' }}
          >
            For developers
          </h1>
          <p className="text-sm text-gray-700 mb-4" style={{ fontFamily: 'Times New Roman, serif' }}>
            Ligder is a wallet-native forum system designed for transparent governance and easy self-hosting.
            The stack is React + Vite on frontend, Node + Express API, Supabase/Postgres for state, and
            Solana Memo attestations relayed through a server fee payer.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm px-4 py-2 border border-gray-700 bg-white text-blue-700 hover:text-blue-900 hover:bg-gray-100"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              Visit repo
            </a>
            <Link
              to="/forums/archive"
              className="inline-block text-sm px-4 py-2 border border-gray-700 bg-white text-blue-700 hover:text-blue-900 hover:bg-gray-100"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              View archive & verify
            </Link>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
            Technical capabilities
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-800" style={{ fontFamily: 'Times New Roman, serif' }}>
            <li>Forum boards with per-board rank gating for new threads and replies.</li>
            <li>Wallet-signed actions for registration, posting, voting, profile updates, and PM send.</li>
            <li>On-chain attestation relay for thread creation, replies, votes, and PM metadata via Solana Memo.</li>
            <li>Archive + memo decoder flow to verify IDs/hashes against transaction data.</li>
            <li>Public profile pages by username with forum activity and holdings data.</li>
            <li>Encrypted private messages (client-side NaCl box), with metadata tx links and attestation status.</li>
            <li>Admin CP for board policy tuning, role management, bans, and moderation operations.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
            On-chain flow (thread/reply/vote/PM)
          </h2>
          <div
            className="border border-gray-300 bg-white p-3 text-sm text-gray-800"
            style={{ fontFamily: 'Times New Roman, serif' }}
          >
            <p className="m-0 mb-2">
              For signed user actions, frontend requests a wallet signature first. The API validates that signature,
              writes forum state to Postgres, then creates compact Memo payloads. A server fee payer submits the Solana
              tx and stores status (`pending` / `failed` / `confirmed`) plus tx signature for auditability.
            </p>
            <p className="m-0">
              This means forum content is readable from DB for UX speed, while hashes/metadata are externally verifiable
              on-chain through the archive and decoder paths.
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
            Environment and key configuration
          </h2>
          <div className="border border-gray-300 bg-white p-3 text-sm font-mono whitespace-pre-wrap">
{`SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
LITE_TOKEN_MINT=...
SOLANA_RPC_URL=...
SOLANA_MEMO_RPC_URL=...
SOLANA_MEMO_FEE_PAYER_SECRET_KEY=...`}
          </div>
          <p className="text-xs text-gray-600 mt-2 mb-0" style={{ fontFamily: 'Arial, sans-serif' }}>
            The memo fee payer secret is what funds relayed attestation transactions. Keep it server-only and never
            expose it to the browser.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
            Production: static site + API (e.g. Netlify + Railway)
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-800" style={{ fontFamily: 'Times New Roman, serif' }}>
            <li>
              The <strong>API</strong> runs as a Node process (<code>npm start</code> → Express). Host it on Railway
              (or any Node host); set the same server env vars as above. Use the <strong>public HTTPS</strong> API URL
              (not internal-only hostnames).
            </li>
            <li>
              The <strong>frontend</strong> is a Vite build (<code>dist/</code>). On Netlify, set{' '}
              <code>VITE_API_BASE</code> to that API origin (<code>https://…</code>), scoped to <strong>builds</strong>,
              and run <code>npm run build</code>. A prebuild step writes Netlify redirects so <code>/api</code> can
              proxy to the API.
            </li>
            <li>
              Full checklist: <code>for_developers/README.md</code> → section <em>Production hosting (Netlify + Railway)</em>.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-base font-bold text-gray-900 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
            Bootstrap / runbook
          </h2>
          <div className="border border-gray-300 bg-white p-3 text-sm font-mono whitespace-pre-wrap">
{`npm install
copy .env.example .env
# run SQL migrations in for_developers/sql in numeric order
npm run dev`}
          </div>
          <p className="text-xs text-gray-600 mt-2 mb-0" style={{ fontFamily: 'Arial, sans-serif' }}>
            If you changed API routes and a feature returns 404, restart the API/dev process to load latest handlers.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
            Documentation map
          </h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800" style={{ fontFamily: 'Times New Roman, serif' }}>
            <li><code>README.md</code> — root quick start + homepage/current feature summary.</li>
            <li>
              <code>for_developers/README.md</code> — architecture, route/API catalog, and{' '}
              <em>Production hosting (Netlify + Railway)</em>.
            </li>
            <li><code>for_developers/sql/README.md</code> — migration order and schema map.</li>
            <li><code>server/index.mjs</code> — API source of truth and auth rules.</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default ForDevelopersPage;
