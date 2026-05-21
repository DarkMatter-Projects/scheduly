import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ClientProvider } from './context/ClientContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import RoleGate from './components/auth/RoleGate';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/common/ErrorBoundary';

// Eager — these are on the critical path for first paint (auth + landing).
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import TermsPage from './pages/TermsPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';

// Lazy — chart-heavy pages and rarely-visited routes load on demand. Cuts the
// initial JS bundle by ~40% by deferring recharts + builder code.
const CalendarPage          = lazy(() => import('./pages/CalendarPage'));
const PostCreatePage        = lazy(() => import('./pages/PostCreatePage'));
const PostDetailPage        = lazy(() => import('./pages/PostDetailPage'));
const PostsListPage         = lazy(() => import('./pages/PostsListPage'));
const PostEditPage          = lazy(() => import('./pages/PostEditPage'));
const MediaLibraryPage      = lazy(() => import('./pages/MediaLibraryPage'));
const AnalyticsPage         = lazy(() => import('./pages/AnalyticsPage'));
const AdsPage               = lazy(() => import('./pages/AdsPage'));
const DashboardsListPage    = lazy(() => import('./pages/DashboardsListPage'));
const DashboardBuilderPage  = lazy(() => import('./pages/DashboardBuilderPage'));
const SharedDashboardPage   = lazy(() => import('./pages/SharedDashboardPage'));
const EngagePage            = lazy(() => import('./pages/EngagePage'));
const AccountsPage          = lazy(() => import('./pages/AccountsPage'));
const ClientsPage           = lazy(() => import('./pages/ClientsPage'));
const SettingsPage          = lazy(() => import('./pages/SettingsPage'));

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

function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-[300px] text-sm text-slate-400">
      Loading…
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClientProvider>
          <ToastProvider>
            <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
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
            </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </ClientProvider>
      </AuthProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
