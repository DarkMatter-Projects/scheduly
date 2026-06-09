import { lazy, Suspense } from 'react';

// Auto-reload helper for stale chunk hashes. After a deploy the old
// index.html in someone's browser points to chunk filenames that no
// longer exist on the CDN — when they navigate to a lazy route the
// dynamic import 404s. Catch that, force ONE hard reload (guarded by
// sessionStorage so we don't loop forever), and the freshly-fetched
// index.html points to the current chunk hashes.
function lazyWithRetry(componentImport) {
  return lazy(async () => {
    const alreadyReloaded = sessionStorage.getItem('chunk-reload-attempted') === '1';
    try {
      const c = await componentImport();
      // Reset the flag once any chunk loads successfully so a future
      // stale-chunk error can again trigger one auto-reload.
      sessionStorage.removeItem('chunk-reload-attempted');
      return c;
    } catch (err) {
      const isChunkError = err?.name === 'ChunkLoadError'
        || /Failed to fetch dynamically imported module/i.test(err?.message || '')
        || /Loading chunk \d+ failed/i.test(err?.message || '');
      if (isChunkError && !alreadyReloaded) {
        sessionStorage.setItem('chunk-reload-attempted', '1');
        window.location.reload();
        // Return a never-resolving promise so React's Suspense fallback
        // keeps showing while the reload happens.
        return new Promise(() => {});
      }
      throw err;
    }
  });
}
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
const CalendarPage          = lazyWithRetry(() => import('./pages/CalendarPage'));
const PostCreatePage        = lazyWithRetry(() => import('./pages/PostCreatePage'));
const PostDetailPage        = lazyWithRetry(() => import('./pages/PostDetailPage'));
const PostsListPage         = lazyWithRetry(() => import('./pages/PostsListPage'));
const PostEditPage          = lazyWithRetry(() => import('./pages/PostEditPage'));
const MediaLibraryPage      = lazyWithRetry(() => import('./pages/MediaLibraryPage'));
const AnalyticsPage         = lazyWithRetry(() => import('./pages/AnalyticsPage'));
const AdsPage               = lazyWithRetry(() => import('./pages/AdsPage'));
const DashboardsListPage    = lazyWithRetry(() => import('./pages/DashboardsListPage'));
const DashboardBuilderPage  = lazyWithRetry(() => import('./pages/DashboardBuilderPage'));
const SharedDashboardPage   = lazyWithRetry(() => import('./pages/SharedDashboardPage'));
const EngagePage            = lazyWithRetry(() => import('./pages/EngagePage'));
const AccountsPage          = lazyWithRetry(() => import('./pages/AccountsPage'));
const ClientsPage           = lazyWithRetry(() => import('./pages/ClientsPage'));
const SettingsPage          = lazyWithRetry(() => import('./pages/SettingsPage'));
const AuditLogPage          = lazyWithRetry(() => import('./pages/AuditLogPage'));

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
                  <Route element={<RoleGate allowed={['admin','manager']} />}>
                    <Route path="/audit-log" element={<AuditLogPage />} />
                  </Route>
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
