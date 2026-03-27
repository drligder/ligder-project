import { Link } from 'react-router-dom';
import AuthorCard from '../components/AuthorCard';
import Header from '../components/Header';
import { LoginDropdown } from '../components/LoginDropdown';
import Ligder from '../components/Ligder';
import { useWallet } from '../contexts/WalletContext';
import { useLigderProfile } from '../hooks/useLigderProfile';

const HomePage = () => {
  const { publicKey } = useWallet();
  const { isRegistered, profileLoading } = useLigderProfile();
  const showRegister = publicKey ? !profileLoading && !isRegistered : true;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6">
        <Header />

        <div
          className="mt-6 mb-6 flex flex-wrap items-center justify-end gap-2 text-sm"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
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

        <AuthorCard />

        <main className="mt-8">
          <Ligder />
        </main>

      </div>
    </div>
  );
};

export default HomePage;
