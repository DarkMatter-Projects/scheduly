import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import clsx from 'clsx';
import { fetchSharedDashboard } from '../api/dashboardsApi';
import { format } from 'date-fns';

// Public, no-auth viewer for share-link recipients. Same widget layout as
// the builder, but read-only and with a "shared by" footer.
export default function SharedDashboardPage() {
  const { token } = useParams();
  const { data: dashboard, isLoading, isError, error } = useQuery({
    queryKey: ['shared-dashboard', token],
    queryFn: () => fetchSharedDashboard(token),
    retry: false,
  });

  if (isLoading) {
    return <CenteredMessage>Loading dashboard…</CenteredMessage>;
  }
  if (isError) {
    return (
      <CenteredMessage>
        <p className="font-semibold text-slate-900 mb-1">This link isn't available</p>
        <p className="text-sm text-slate-500">
          {error?.response?.status === 404
            ? 'It may have been revoked or expired. Ask the owner for a fresh link.'
            : 'Could not load the dashboard. Try refreshing.'}
        </p>
      </CenteredMessage>
    );
  }
  if (!dashboard) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{dashboard.name}</h1>
              {dashboard.description && (
                <p className="text-xs text-slate-500">{dashboard.description}</p>
              )}
            </div>
          </div>
          <div className="text-xs text-slate-400 text-right">
            <p>Shared by {dashboard.creatorName || 'a Scheduly user'}</p>
            {dashboard.clientName && <p>Client: {dashboard.clientName}</p>}
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {dashboard.widgets.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl py-20 text-center">
            <LayoutGrid className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600">This dashboard is empty</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
            {dashboard.widgets.map(w => (
              <div
                key={w.id}
                className={clsx('bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2', `lg:col-span-${Math.max(1, Math.min(12, w.width || 4))}`)}
                style={{ minHeight: `${Math.max(120, (w.height || 2) * 80)}px` }}
              >
                <div>
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                    {w.category}
                  </p>
                  <h4 className="text-sm font-semibold text-slate-900">
                    {w.title || w.widgetType.replace(/_/g, ' ')}
                  </h4>
                </div>
                <div className="flex-1 flex items-center justify-center text-center text-xs text-slate-400">
                  Live widget rendering ships in the next pass.
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-slate-400 py-6">
        Generated {format(new Date(), 'MMM d, yyyy')} · powered by{' '}
        <a className="text-blue-600 hover:underline" href="/">Scheduly</a>
      </footer>
    </div>
  );
}

function CenteredMessage({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-sm w-full text-center">
        {children}
      </div>
    </div>
  );
}
