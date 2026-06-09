import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import { format } from 'date-fns';
import {
  fetchSharedDashboard,
  fetchSharedWidgetData,
  fetchSharedAnnotations,
} from '../api/dashboardsApi';
import WidgetRenderer, {
  AnnotationsContext,
  WidgetDataFetcherContext,
} from '../components/dashboard/WidgetRenderer';

// Public, no-auth viewer for share-link recipients. Reuses the same
// WidgetRenderer the builder uses; the only difference is the data
// fetcher comes through context and hits the token-scoped public
// endpoints instead of the authenticated ones.
export default function SharedDashboardPage() {
  const { token } = useParams();
  const { data: dashboard, isLoading, isError, error } = useQuery({
    queryKey: ['shared-dashboard', token],
    queryFn: () => fetchSharedDashboard(token),
    retry: false,
  });

  const { data: annotations = [] } = useQuery({
    queryKey: ['shared-annotations', token],
    queryFn: () => fetchSharedAnnotations(token),
    enabled: !!token && !!dashboard,
    retry: false,
  });

  // Stable context value so React Query doesn't see a new fetcher
  // identity on every render (it would re-run all the widget queries).
  const fetcherValue = useMemo(() => ({
    fetch: (widget) => fetchSharedWidgetData(token, widget.id),
    keyParts: ['share', token],
  }), [token]);

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

  // White-label branding — if the dashboard is scoped to a client
  // that has uploaded a logo / picked a color / written a tagline,
  // use those instead of the default Scheduly blue + "S" badge so
  // the share recipient sees their own brand on the page.
  const brandColor = dashboard.clientColor || '#2563eb';
  const hasLogo = !!dashboard.clientLogoUrl;
  return (
    <div className="min-h-screen bg-slate-50">
      <header
        className="bg-white border-b border-slate-200 px-6 py-4"
        style={hasLogo || dashboard.clientColor
          ? { borderTop: `4px solid ${brandColor}` }
          : undefined}
      >
        <div className="max-w-[1400px] mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {hasLogo ? (
              <img
                src={dashboard.clientLogoUrl}
                alt={dashboard.clientName || 'Client logo'}
                className="h-10 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${brandColor}, ${shadeColor(brandColor, -20)})` }}
              >
                <span className="text-white text-sm font-bold">
                  {(dashboard.clientName || 'S').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{dashboard.name}</h1>
              {dashboard.description && (
                <p className="text-xs text-slate-500">{dashboard.description}</p>
              )}
              {dashboard.clientTagline && (
                <p className="text-[11px] text-slate-400 italic mt-0.5">{dashboard.clientTagline}</p>
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
          <WidgetDataFetcherContext.Provider value={fetcherValue}>
            <AnnotationsContext.Provider value={annotations}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
                {dashboard.widgets.map(w => (
                  <WidgetRenderer
                    key={w.id}
                    widget={w}
                    canEdit={false}
                    onRemove={() => {}}
                  />
                ))}
              </div>
            </AnnotationsContext.Provider>
          </WidgetDataFetcherContext.Provider>
        )}
      </main>

      <footer className="text-center text-xs text-slate-400 py-6">
        Generated {format(new Date(), 'MMM d, yyyy')} · powered by{' '}
        <a className="text-blue-600 hover:underline" href="/">Scheduly</a>
      </footer>
    </div>
  );
}

// Shift a hex color lighter / darker by `percent` (negative = darker).
// Used so the brand-color gradient on the placeholder logo badge has
// some depth instead of a flat fill.
function shadeColor(hex, percent) {
  try {
    const c = hex.replace('#', '');
    const num = parseInt(c, 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0xff) + percent;
    let b = (num & 0xff) + percent;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  } catch {
    return hex;
  }
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
