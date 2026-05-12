import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ClientProvider } from './context/ClientContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import RoleGate from './components/auth/RoleGate';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClientProvider>
          <ToastProvider>
            <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/posts" element={<PostsListPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/posts/new" element={<PostCreatePage />} />
                  <Route path="/posts/:id" element={<PostDetailPage />} />
                  <Route path="/posts/:id/edit" element={<PostEditPage />} />
                  <Route path="/media" element={<MediaLibraryPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/ads" element={<AdsPage />} />
                  <Route path="/accounts" element={<AccountsPage />} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route element={<RoleGate allowed={['admin']} />}>
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                </Route>
              </Route>
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
