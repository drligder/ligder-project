import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AccountSettingsPage from './pages/AccountSettingsPage';
import AdminPage from './pages/AdminPage';
import ArchivePage from './pages/ArchivePage';
import BoardThreadsPage from './pages/BoardThreadsPage';
import ForumPage from './pages/ForumPage';
import HomePage from './pages/HomePage';
import LigderGeneralPage from './pages/LigderGeneralPage';
import LigderGovernancePage from './pages/LigderGovernancePage';
import LigderOfficialPage from './pages/LigderOfficialPage';
import LigderTechnicalPage from './pages/LigderTechnicalPage';
import RegisterPage from './pages/RegisterPage';
import ForumPostBodyPage from './pages/ForumPostBodyPage';
import ThreadViewPage from './pages/ThreadViewPage';
import PublicProfilePage from './pages/PublicProfilePage';
import MessagesPage from './pages/MessagesPage';
import ForDevelopersPage from './pages/ForDevelopersPage';
import DividendsPage from './pages/DividendsPage';
import LiteboardChannelPage from './pages/LiteboardChannelPage';
import LiteboardDeployPage from './pages/LiteboardDeployPage';
import LiteboardExplorerPage from './pages/LiteboardExplorerPage';
import LiteboardHubPage from './pages/LiteboardHubPage';
import LiteboardThreadPage from './pages/LiteboardThreadPage';
import SiteFooter from './components/SiteFooter';

function ScrollToTopOnRouteChange() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <>
      <ScrollToTopOnRouteChange />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/liteboard/deploy" element={<LiteboardDeployPage />} />
        <Route path="/liteboard/explorer" element={<LiteboardExplorerPage />} />
        <Route
          path="/liteboard/:mint/:channel/:threadNumber"
          element={<LiteboardThreadPage />}
        />
        <Route path="/liteboard/:mint/:channel" element={<LiteboardChannelPage />} />
        <Route path="/liteboard/:mint" element={<LiteboardHubPage />} />
        <Route path="/forums" element={<ForumPage />} />
        <Route path="/forums/archive" element={<ArchivePage />} />
        <Route path="/forums/ligder-official" element={<LigderOfficialPage />} />
        <Route
          path="/forums/ligder-official/:boardSlug/:threadNumber"
          element={<ThreadViewPage />}
        />
        <Route path="/forums/ligder-official/:boardSlug" element={<BoardThreadsPage />} />
        <Route path="/forums/ligder-general" element={<LigderGeneralPage />} />
        <Route
          path="/forums/ligder-general/:boardSlug/:threadNumber"
          element={<ThreadViewPage />}
        />
        <Route path="/forums/ligder-general/:boardSlug" element={<BoardThreadsPage />} />
        <Route path="/forums/ligder-governance" element={<LigderGovernancePage />} />
        <Route
          path="/forums/ligder-governance/:boardSlug/:threadNumber"
          element={<ThreadViewPage />}
        />
        <Route path="/forums/ligder-governance/:boardSlug" element={<BoardThreadsPage />} />
        <Route path="/forums/ligder-technical" element={<LigderTechnicalPage />} />
        <Route
          path="/forums/ligder-technical/:boardSlug/:threadNumber"
          element={<ThreadViewPage />}
        />
        <Route path="/forums/ligder-technical/:boardSlug" element={<BoardThreadsPage />} />
        <Route path="/forums/login" element={<Navigate to="/forums" replace />} />
        <Route path="/forums/account" element={<AccountSettingsPage />} />
        <Route path="/forums/admin" element={<AdminPage />} />
        <Route path="/forums/register" element={<RegisterPage />} />
        <Route path="/forums/u/:username" element={<PublicProfilePage />} />
        <Route path="/forums/messages" element={<MessagesPage />} />
        <Route path="/dividends" element={<DividendsPage />} />
        <Route path="/forums/post-text/:postId" element={<ForumPostBodyPage />} />
        <Route path="/for-developers" element={<ForDevelopersPage />} />
      </Routes>
      <SiteFooter />
    </>
  );
}

export default App;
