import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ClientProvider } from './context/ClientContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import RoleGate from './components/auth/RoleGate';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import CalendarPage from './pages/CalendarPage';
import PostCreatePage from './pages/PostCreatePage';
import PostDetailPage from './pages/PostDetailPage';
import MediaLibraryPage from './pages/MediaLibraryPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdsPage from './pages/AdsPage';
import AccountsPage from './pages/AccountsPage';
import ClientsPage from './pages/ClientsPage';
import SettingsPage from './pages/SettingsPage';
import PostsListPage from './pages/PostsListPage';
import PostEditPage from './pages/PostEditPage';
import TermsPage from './pages/TermsPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import DashboardsListPage from './pages/DashboardsListPage';
import DashboardBuilderPage from './pages/DashboardBuilderPage';
import SharedDashboardPage from './pages/SharedDashboardPage';
import EngagePage from './pages/EngagePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

// Decides what to show at `/`:
//   - Logged-out visitors (incl. TikTok reviewers) → public landing page
//   - Authenticated users → bounce straight to their dashboard
function HomeDispatcher() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClientProvider>
          <ToastProvider>
            <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomeDispatcher />} />
              <Route path="/login" element={<LoginPage />} />
              {/* Public legal pages — needed for TikTok/Meta app review */}
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
              {/* Public shared dashboard viewer (token-auth via URL) */}
              <Route path="/share/dashboards/:token" element={<SharedDashboardPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/posts" element={<PostsListPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/posts/new" element={<PostCreatePage />} />
                  <Route path="/posts/:id" element={<PostDetailPage />} />
                  <Route path="/posts/:id/edit" element={<PostEditPage />} />
                  <Route path="/media" element={<MediaLibraryPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/ads" element={<AdsPage />} />
                  <Route path="/dashboards" element={<DashboardsListPage />} />
                  <Route path="/dashboards/:id" element={<DashboardBuilderPage />} />
                  <Route path="/engage" element={<EngagePage />} />
                  <Route path="/accounts" element={<AccountsPage />} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route element={<RoleGate allowed={['admin']} />}>
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                </Route>
              </Route>
              {/* Fallback: send unknown routes to the landing page, not the dashboard */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </BrowserRouter>
          </ToastProvider>
        </ClientProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
