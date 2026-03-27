import { Link } from 'react-router-dom';

const SiteFooter = () => {
  return (
    <footer className="mt-12 border-t border-gray-300 bg-white text-sm text-gray-700">
      <div
        className="max-w-5xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-3"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/" className="text-blue-700 hover:text-blue-900 underline">
            Home
          </Link>
          <span className="text-gray-400">|</span>
          <Link to="/forums" className="text-blue-700 hover:text-blue-900 underline">
            Forums
          </Link>
          <span className="text-gray-400">|</span>
          <Link to="/forums/archive" className="text-blue-700 hover:text-blue-900 underline">
            Archive
          </Link>
          <span className="text-gray-400">|</span>
          <Link to="/dividends" className="text-blue-700 hover:text-blue-900 underline">
            Dividends
          </Link>
          <span className="text-gray-400">|</span>
          <Link to="/for-developers" className="text-blue-700 hover:text-blue-900 underline">
            For Developers
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href="https://github.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 hover:text-blue-900 underline"
          >
            GitHub
          </a>
          <span className="text-gray-400">|</span>
          <a
            href="https://x.com/Birdhouse_Inf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 hover:text-blue-900 underline"
          >
            X
          </a>
          <span className="text-gray-500">
            © {new Date().getFullYear()} Ligder
          </span>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
