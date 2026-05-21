import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import {
  DollarSign, Eye, MousePointer, Target, TrendingUp, RefreshCw, Activity, Building2, AlertTriangle, Trash2, Plus,
} from 'lucide-react';
import clsx from 'clsx';
import {
  listAdAccounts, listCampaigns, getAdsOverview, syncAllAds, syncAdAccount, assignAdAccountClient, disconnectAdAccount,
  listGoogleAdAccounts, listGooglePendingGrants, getGoogleAdsOverview,
  syncAllGoogleAds, syncGoogleAdAccount, discoverGoogleGrant, rediscoverAllGoogle,
  assignGoogleAdAccountClient, disconnectGoogleAdAccount, disconnectGoogleGrant,
  listTikTokAdAccounts, listTikTokPendingGrants, getTikTokAdsOverview,
  syncAllTikTokAds, syncTikTokAdAccount, discoverTikTokGrant, rediscoverAllTikTok,
  assignTikTokAdAccountClient, disconnectTikTokAdAccount, disconnectTikTokGrant,
} from '../api/adsApi';
import { startGoogleAuth, startTikTokAuth } from '../api/socialApi';
import { listClients } from '../api/clientsApi';
import { useClientScope } from '../context/ClientContext';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import KpiCard from '../components/common/KpiCard';
import ChartEmptyState from '../components/common/ChartEmptyState';

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

function toDateInput(date) {
  return format(date, 'yyyy-MM-dd');
}

const STATUS_COLORS = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PAUSED: 'bg-amber-100 text-amber-700',
  DELETED: 'bg-slate-100 text-slate-500',
  ARCHIVED: 'bg-slate-100 text-slate-500',
  CAMPAIGN_PAUSED: 'bg-amber-100 text-amber-700',
  ADSET_PAUSED: 'bg-amber-100 text-amber-700',
  IN_PROCESS: 'bg-blue-100 text-blue-700',
  WITH_ISSUES: 'bg-rose-100 text-rose-700',
};

function StatCard({ icon: Icon, label, value, sublabel, color = 'bg-blue-500' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
          {sublabel && <p className="text-[11px] text-gray-400 mt-0.5">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

function formatCurrency(n, currency) {
  if (n == null || isNaN(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency || ''}${Number(n).toFixed(2)}`;
  }
}

function formatNumber(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Number(n).toLocaleString();
}

// Compact per-account stats line. Returns null when there's no data so the
// row stays clean rather than showing "0 spend • 0 imp" everywhere.
function AccountStats({ stats, currency }) {
  if (!stats) return null;
  const hasData = stats.spend > 0 || stats.impressions > 0 || stats.clicks > 0;
  if (!hasData) {
    return <span className="text-[11px] text-slate-400 italic">No data in range</span>;
  }
  const ctr = stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="text-slate-700 font-medium">{formatCurrency(stats.spend, currency)}</span>
      <span className="text-slate-400">•</span>
      <span className="text-slate-600">{formatNumber(stats.impressions)} imp</span>
      <span className="text-slate-400">•</span>
      <span className="text-slate-600">{formatNumber(stats.clicks)} clk</span>
      {ctr > 0 && (
        <>
          <span className="text-slate-400">•</span>
          <span className="text-slate-500">{ctr.toFixed(2)}% CTR</span>
        </>
      )}
    </div>
  );
}

export default function AdsPage() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const { activeClientId, activeClient } = useClientScope();
  const [endDate, setEndDate] = useState(() => toDateInput(new Date()));
  const [startDate, setStartDate] = useState(() => toDateInput(subDays(startOfDay(new Date()), 30)));
  const canSync = hasRole('admin', 'manager');
  const canRemove = hasRole('admin');

  // Used to label the spend chart and the campaign table header
  const rangeLabel = useMemo(() => {
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
    const days = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24))) + 1;
    return `${days} day${days === 1 ? '' : 's'}`;
  }, [startDate, endDate]);

  const applyPreset = (days) => {
    const end = new Date();
    const start = subDays(startOfDay(end), days - 1);
    setStartDate(toDateInput(start));
    setEndDate(toDateInput(end));
  };

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['adAccounts', activeClientId],
    queryFn: () => listAdAccounts(activeClientId || undefined),
  });

  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: listClients });

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['adsOverview', activeClientId, startDate, endDate],
    queryFn: () => getAdsOverview({
      clientId: activeClientId || undefined,
      start: startDate,
      end: endDate,
    }),
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['adCampaigns', activeClientId],
    queryFn: () => listCampaigns({ clientId: activeClientId || undefined }),
  });

  const syncAllMut = useMutation({
    mutationFn: syncAllAds,
    onSuccess: (r) => {
      toast.success(`Synced ${r.ok} of ${r.total} account(s)`);
      queryClient.invalidateQueries({ queryKey: ['adAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['adsOverview'] });
      queryClient.invalidateQueries({ queryKey: ['adCampaigns'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Sync failed'),
  });

  const syncOneMut = useMutation({
    mutationFn: syncAdAccount,
    onSuccess: () => {
      toast.success('Synced');
      queryClient.invalidateQueries({ queryKey: ['adAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['adsOverview'] });
      queryClient.invalidateQueries({ queryKey: ['adCampaigns'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Sync failed'),
  });

  const assignClientMut = useMutation({
    mutationFn: ({ id, clientId }) => assignAdAccountClient(id, clientId),
    onSuccess: () => {
      toast.success('Client updated');
      queryClient.invalidateQueries({ queryKey: ['adAccounts'] });
    },
    onError: () => toast.error('Failed to update client'),
  });

  const disconnectMut = useMutation({
    mutationFn: disconnectAdAccount,
    onSuccess: () => {
      toast.success('Ad account removed');
      queryClient.invalidateQueries({ queryKey: ['adAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['adsOverview'] });
      queryClient.invalidateQueries({ queryKey: ['adCampaigns'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to remove'),
  });

  const summary = overview?.summary;
  const daily = overview?.daily || [];
  const topCampaigns = overview?.topCampaigns || [];
  const metaByAccount = useMemo(() => {
    const m = new Map();
    for (const r of (overview?.byAccount || [])) m.set(r.adAccountId, r);
    return m;
  }, [overview]);

  const primaryCurrency = accounts.find(a => a.currency)?.currency || 'USD';

  // ── Google Ads ──
  const { data: googleAccounts = [], isLoading: googleLoading } = useQuery({
    queryKey: ['googleAdAccounts', activeClientId],
    queryFn: () => listGoogleAdAccounts(activeClientId || undefined),
  });
  const { data: pendingGrants = [] } = useQuery({
    queryKey: ['googlePendingGrants'],
    queryFn: listGooglePendingGrants,
  });
  const { data: googleOverview } = useQuery({
    queryKey: ['googleAdsOverview', activeClientId, startDate, endDate],
    queryFn: () => getGoogleAdsOverview({
      clientId: activeClientId || undefined,
      start: startDate,
      end: endDate,
    }),
  });

  const googleSummary = googleOverview?.summary;
  const googleCurrency = googleAccounts.find(a => a.currency)?.currency || 'USD';
  const googleByAccount = useMemo(() => {
    const m = new Map();
    for (const r of (googleOverview?.byAccount || [])) m.set(r.adAccountId, r);
    return m;
  }, [googleOverview]);

  const invalidateGoogle = () => {
    queryClient.invalidateQueries({ queryKey: ['googleAdAccounts'] });
    queryClient.invalidateQueries({ queryKey: ['googlePendingGrants'] });
    queryClient.invalidateQueries({ queryKey: ['googleAdsOverview'] });
  };

  const connectGoogleMut = useMutation({
    mutationFn: () => startGoogleAuth(),
    onSuccess: (d) => { window.location.href = d.authUrl; },
    onError: () => toast.error('Failed to start Google OAuth. Check GOOGLE_CLIENT_ID/SECRET on the server.'),
  });
  const syncAllGoogleMut = useMutation({
    mutationFn: syncAllGoogleAds,
    onSuccess: (r) => { toast.success(`Synced ${r.ok} of ${r.total} Google account(s)`); invalidateGoogle(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Google sync failed'),
  });
  const syncGoogleOneMut = useMutation({
    mutationFn: syncGoogleAdAccount,
    onSuccess: () => { toast.success('Synced'); invalidateGoogle(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Sync failed'),
  });
  const discoverMut = useMutation({
    mutationFn: discoverGoogleGrant,
    onSuccess: (r) => { toast.success(`Discovered ${r.discovered} account(s)`); invalidateGoogle(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Discovery failed'),
  });
  const assignGoogleClientMut = useMutation({
    mutationFn: ({ id, clientId }) => assignGoogleAdAccountClient(id, clientId),
    onSuccess: () => { toast.success('Client updated'); invalidateGoogle(); },
    onError: () => toast.error('Failed to update client'),
  });
  const disconnectGoogleAccMut = useMutation({
    mutationFn: disconnectGoogleAdAccount,
    onSuccess: () => { toast.success('Ad account removed'); invalidateGoogle(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to remove'),
  });
  const disconnectGrantMut = useMutation({
    mutationFn: disconnectGoogleGrant,
    onSuccess: () => { toast.success('Google account disconnected'); invalidateGoogle(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to disconnect'),
  });
  const rediscoverGoogleMut = useMutation({
    mutationFn: rediscoverAllGoogle,
    onSuccess: (r) => {
      const summary = `${r.discovered} account(s) found across ${r.succeeded} grant(s)` + (r.failed ? `, ${r.failed} failed` : '');
      toast.success(`Re-discovery complete: ${summary}`);
      invalidateGoogle();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Re-discovery failed'),
  });

  // ── TikTok Ads ──
  const { data: tiktokAccounts = [], isLoading: tiktokLoading } = useQuery({
    queryKey: ['tiktokAdAccounts', activeClientId],
    queryFn: () => listTikTokAdAccounts(activeClientId || undefined),
  });
  const { data: tiktokPendingGrants = [] } = useQuery({
    queryKey: ['tiktokPendingGrants'],
    queryFn: listTikTokPendingGrants,
  });
  const { data: tiktokOverview } = useQuery({
    queryKey: ['tiktokAdsOverview', activeClientId, startDate, endDate],
    queryFn: () => getTikTokAdsOverview({
      clientId: activeClientId || undefined,
      start: startDate,
      end: endDate,
    }),
  });

  const tiktokSummary = tiktokOverview?.summary;
  const tiktokCurrency = tiktokAccounts.find(a => a.currency)?.currency || 'USD';
  const tiktokByAccount = useMemo(() => {
    const m = new Map();
    for (const r of (tiktokOverview?.byAccount || [])) m.set(r.adAccountId, r);
    return m;
  }, [tiktokOverview]);

  const invalidateTikTok = () => {
    queryClient.invalidateQueries({ queryKey: ['tiktokAdAccounts'] });
    queryClient.invalidateQueries({ queryKey: ['tiktokPendingGrants'] });
    queryClient.invalidateQueries({ queryKey: ['tiktokAdsOverview'] });
  };

  const connectTikTokMut = useMutation({
    mutationFn: () => startTikTokAuth(),
    onSuccess: (d) => { window.location.href = d.authUrl; },
    onError: () => toast.error('Failed to start TikTok OAuth. Check TIKTOK_APP_ID/SECRET on the server.'),
  });
  const syncAllTikTokMut = useMutation({
    mutationFn: syncAllTikTokAds,
    onSuccess: (r) => { toast.success(`Synced ${r.ok} of ${r.total} TikTok account(s)`); invalidateTikTok(); },
    onError: (err) => toast.error(err.response?.data?.error || 'TikTok sync failed'),
  });
  const syncTikTokOneMut = useMutation({
    mutationFn: syncTikTokAdAccount,
    onSuccess: () => { toast.success('Synced'); invalidateTikTok(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Sync failed'),
  });
  const discoverTikTokMut = useMutation({
    mutationFn: discoverTikTokGrant,
    onSuccess: (r) => { toast.success(`Discovered ${r.discovered} advertiser(s)`); invalidateTikTok(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Discovery failed'),
  });
  const assignTikTokClientMut = useMutation({
    mutationFn: ({ id, clientId }) => assignTikTokAdAccountClient(id, clientId),
    onSuccess: () => { toast.success('Client updated'); invalidateTikTok(); },
    onError: () => toast.error('Failed to update client'),
  });
  const disconnectTikTokAccMut = useMutation({
    mutationFn: disconnectTikTokAdAccount,
    onSuccess: () => { toast.success('Ad account removed'); invalidateTikTok(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to remove'),
  });
  const disconnectTikTokGrantMut = useMutation({
    mutationFn: disconnectTikTokGrant,
    onSuccess: () => { toast.success('TikTok account disconnected'); invalidateTikTok(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to disconnect'),
  });
  const rediscoverTikTokMut = useMutation({
    mutationFn: rediscoverAllTikTok,
    onSuccess: (r) => {
      const summary = `${r.discovered} advertiser(s) found across ${r.succeeded} grant(s)` + (r.failed ? `, ${r.failed} failed` : '');
      toast.success(`Re-discovery complete: ${summary}`);
      invalidateTikTok();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Re-discovery failed'),
  });

  // Handle the redirect back from Google OAuth
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const connected = searchParams.get('googleConnected');
    const tiktokConnected = searchParams.get('tiktokConnected');
    const adAccountCount = searchParams.get('adAccounts');
    const error = searchParams.get('error');
    if (connected) {
      toast.success(
        adAccountCount && Number(adAccountCount) > 0
          ? `Connected Google: ${adAccountCount} ad account(s) discovered`
          : 'Connected Google. Account discovery skipped — add the developer token to enable sync.'
      );
      invalidateGoogle();
      setSearchParams({});
    } else if (tiktokConnected) {
      toast.success(
        adAccountCount && Number(adAccountCount) > 0
          ? `Connected TikTok: ${adAccountCount} advertiser(s) discovered`
          : 'Connected TikTok. No advertisers discovered — check that the OAuth user has access to an ad account.'
      );
      invalidateTikTok();
      setSearchParams({});
    } else if (error) {
      const messages = {
        oauth_denied: 'OAuth authorisation denied',
        invalid_state: 'Invalid session. Please try again.',
        google_no_refresh_token: 'Google didn’t return a refresh token. Revoke the prior grant at myaccount.google.com/permissions and try again.',
        google_connection_failed: 'Google connection failed. Check the server logs.',
        tiktok_connection_failed: 'TikTok connection failed. Check the server logs.',
      };
      toast.error(messages[error] || `Connection failed: ${error}`);
      setSearchParams({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeClient
              ? `Paid performance for ${activeClient.name}`
              : 'Paid performance across connected Meta and Google ad accounts'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => applyPreset(r.days)}
                className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-500 hover:bg-white hover:shadow-sm hover:text-gray-900 transition"
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-lg">
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={e => setStartDate(e.target.value)}
              className="text-xs text-slate-700 bg-transparent outline-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={toDateInput(new Date())}
              onChange={e => setEndDate(e.target.value)}
              className="text-xs text-slate-700 bg-transparent outline-none"
            />
          </div>
          {canSync && (
            <button
              onClick={() => syncAllMut.mutate()}
              disabled={syncAllMut.isPending || accounts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              title="Pull the latest campaigns and insights from Meta"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', syncAllMut.isPending && 'animate-spin')} />
              {syncAllMut.isPending ? 'Syncing...' : 'Sync now'}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="w-1 h-5 bg-blue-600 rounded-full" />
        <h2 className="text-base font-semibold text-gray-800">Meta Ads</h2>
      </div>

      {accountsLoading ? (
        <div className="text-center py-12 text-gray-400">Loading ad accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center mb-12">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No Meta ad accounts connected</p>
          <p className="text-gray-400 text-sm mt-1">
            Reconnect Facebook on the Accounts page after enabling the <code className="px-1 bg-slate-100 rounded">ads_read</code> permission.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {overviewLoading ? (
            <div className="text-center py-12 text-gray-400">Loading metrics...</div>
          ) : summary && (() => {
            const p = overview?.priorSummary || {};
            const dailySpark = (key) => (daily || []).map(d => ({ date: d.date, value: Number(d[key]) || 0 }));
            return (
              <>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 mb-8">
                  <KpiCard label="Spend" value={formatCurrency(summary.spend, primaryCurrency)} current={summary.spend} prior={p.spend} priorValue={formatCurrency(p.spend, primaryCurrency)} sparkData={dailySpark('spend')} sparkColor="#10b981" />
                  <KpiCard label="Impressions" value={formatNumber(summary.impressions)} current={summary.impressions} prior={p.impressions} priorValue={formatNumber(p.impressions)} sparkData={dailySpark('impressions')} sparkColor="#3b82f6" />
                  <KpiCard label="Clicks" value={formatNumber(summary.clicks)} current={summary.clicks} prior={p.clicks} priorValue={formatNumber(p.clicks)} sparkData={dailySpark('clicks')} sparkColor="#06b6d4" caption={`CTR ${summary.ctr.toFixed(2)}%`} />
                  <KpiCard label="Conversions" value={formatNumber(summary.conversions)} current={summary.conversions} prior={p.conversions} priorValue={formatNumber(p.conversions)} sparkColor="#8b5cf6" caption={`Value ${formatCurrency(summary.conversionValue, primaryCurrency)}`} />
                  <KpiCard label="ROAS" value={`${summary.roas.toFixed(2)}x`} current={summary.roas} prior={p.roas} priorValue={`${(p.roas || 0).toFixed(2)}x`} sparkColor="#f59e0b" />
                  <KpiCard label="CPC" value={formatCurrency(summary.cpc, primaryCurrency)} current={summary.cpc} prior={p.cpc} priorValue={formatCurrency(p.cpc, primaryCurrency)} sparkColor="#ec4899" invertDelta />
                  <KpiCard label="CPM" value={formatCurrency(summary.cpm, primaryCurrency)} current={summary.cpm} prior={p.cpm} priorValue={formatCurrency(p.cpm, primaryCurrency)} sparkColor="#f43f5e" invertDelta />
                  <KpiCard label="Reach" value={formatNumber(summary.reach)} current={summary.reach} prior={p.reach} priorValue={formatNumber(p.reach)} sparkColor="#6366f1" />
                </div>

                {/* Spend chart */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-medium text-gray-700 mb-4">Daily Spend</h3>
                    {daily.length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={daily}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(v) => format(new Date(v), 'MMM d')}
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                          />
                          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                          <Tooltip
                            labelFormatter={(v) => format(new Date(v), 'MMM d, yyyy')}
                            formatter={(v) => [formatCurrency(v, primaryCurrency), 'Spend']}
                          />
                          <Bar dataKey="spend" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <ChartEmptyState
                        height={240}
                        title="No Meta spend in this period"
                        hint="Spend appears after the daily Meta sync runs (7 AM UTC), or click Sync now at the top of the section."
                      />
                    )}
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-medium text-gray-700 mb-4">Clicks & Impressions</h3>
                    {daily.length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={daily}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(v) => format(new Date(v), 'MMM d')}
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                          />
                          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={formatNumber} />
                          <Tooltip
                            labelFormatter={(v) => format(new Date(v), 'MMM d, yyyy')}
                            formatter={(v, name) => [Number(v).toLocaleString(), name]}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="impressions" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                          <Line type="monotone" dataKey="clicks" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <ChartEmptyState
                        height={240}
                        title="No engagement data"
                        hint="Clicks and impressions populate once campaigns serve and the daily sync pulls insights."
                      />
                    )}
                  </div>
                </div>
              </>
            );
          })()}

          {/* Top campaigns */}
          {topCampaigns.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">Top Campaigns ({rangeLabel})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Campaign</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-3">Status</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">Spend</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">Impr.</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">Clicks</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">CTR</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">CPC</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-5 py-3">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCampaigns.map(c => (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[260px]">{c.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {c.accountName}{c.objective ? ` • ${c.objective.replace(/_/g, ' ').toLowerCase()}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium', STATUS_COLORS[c.effectiveStatus] || 'bg-slate-100 text-slate-600')}>
                            {(c.effectiveStatus || '—').toLowerCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-700 text-right">{formatCurrency(c.spend, c.currency || primaryCurrency)}</td>
                        <td className="px-3 py-3 text-sm text-gray-700 text-right">{formatNumber(c.impressions)}</td>
                        <td className="px-3 py-3 text-sm text-gray-700 text-right">{formatNumber(c.clicks)}</td>
                        <td className="px-3 py-3 text-sm text-gray-700 text-right">{c.ctr.toFixed(2)}%</td>
                        <td className="px-3 py-3 text-sm text-gray-700 text-right">{formatCurrency(c.cpc, c.currency || primaryCurrency)}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={clsx(
                            'px-2 py-0.5 rounded-full text-[11px] font-medium',
                            c.roas >= 2 ? 'bg-emerald-100 text-emerald-700' :
                            c.roas >= 1 ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          )}>
                            {c.roas.toFixed(2)}x
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ad accounts */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">Connected Ad Accounts ({accounts.length})</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {accounts.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {a.platformAccountId}{a.businessName ? ` • ${a.businessName}` : ''}{a.currency ? ` • ${a.currency}` : ''}
                      {!a.clientId && (
                        <span className="ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium">
                          Unassigned
                        </span>
                      )}
                      {a.accountStatus !== 1 && a.accountStatus != null && (
                        <span className="ml-2 inline-flex items-center gap-1 text-rose-600">
                          <AlertTriangle className="w-3 h-3" /> status {a.accountStatus}
                        </span>
                      )}
                    </p>
                    <div className="mt-1">
                      <AccountStats stats={metaByAccount.get(a.id)} currency={a.currency || primaryCurrency} />
                    </div>
                  </div>
                  {canSync && (
                    <select
                      value={a.clientId || ''}
                      onChange={(e) => assignClientMut.mutate({ id: a.id, clientId: e.target.value || null })}
                      className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white"
                    >
                      <option value="">No client</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  {a.lastSyncedAt && (
                    <span className="text-[11px] text-gray-400 hidden sm:inline">
                      Synced {format(new Date(a.lastSyncedAt), 'MMM d HH:mm')}
                    </span>
                  )}
                  {canSync && (
                    <button
                      onClick={() => syncOneMut.mutate(a.id)}
                      disabled={syncOneMut.isPending}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                      title="Sync this account"
                    >
                      <RefreshCw className={clsx('w-3.5 h-3.5', syncOneMut.isPending && syncOneMut.variables === a.id && 'animate-spin')} />
                    </button>
                  )}
                  {canRemove && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove "${a.name}" (${a.platformAccountId})? Historical insights stay; you can re-add it by reconnecting Facebook.`)) {
                          disconnectMut.mutate(a.id);
                        }
                      }}
                      disabled={disconnectMut.isPending}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Remove ad account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ─── Google Ads ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-12 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 bg-red-500 rounded-full" />
          <h2 className="text-base font-semibold text-gray-800">Google Ads</h2>
        </div>
        <div className="flex items-center gap-2">
          {canSync && googleAccounts.length > 0 && (
            <button
              onClick={() => syncAllGoogleMut.mutate()}
              disabled={syncAllGoogleMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', syncAllGoogleMut.isPending && 'animate-spin')} />
              {syncAllGoogleMut.isPending ? 'Syncing...' : 'Sync now'}
            </button>
          )}
          {canSync && (googleAccounts.length > 0 || pendingGrants.length > 0) && (
            <button
              onClick={() => rediscoverGoogleMut.mutate()}
              disabled={rediscoverGoogleMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              title="Re-run discovery on every connected Google grant — fixes accounts with stale login_customer_id"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', rediscoverGoogleMut.isPending && 'animate-spin')} />
              {rediscoverGoogleMut.isPending ? 'Re-discovering...' : 'Re-discover'}
            </button>
          )}
          {canRemove && (
            <button
              onClick={() => connectGoogleMut.mutate()}
              disabled={connectGoogleMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Connect Google
            </button>
          )}
        </div>
      </div>

      {pendingGrants.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 space-y-2">
          {pendingGrants.map(g => (
            <div key={g.id} className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-900">{g.googleEmail}</p>
                <p className="text-xs text-amber-700">
                  {g.discoverError
                    ? g.discoverError
                    : 'Authorised. Account discovery is pending — usually means the Google Ads developer token isn’t configured yet.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canSync && (
                  <button
                    onClick={() => discoverMut.mutate(g.id)}
                    disabled={discoverMut.isPending}
                    className="px-3 py-1 text-xs font-medium text-amber-900 bg-white border border-amber-300 rounded-md hover:bg-amber-100"
                  >
                    Retry discovery
                  </button>
                )}
                {canRemove && (
                  <button
                    onClick={() => {
                      if (confirm(`Disconnect Google for ${g.googleEmail}?`)) disconnectGrantMut.mutate(g.id);
                    }}
                    className="p-1.5 text-amber-700 hover:text-rose-600 hover:bg-rose-50 rounded"
                    title="Disconnect"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {googleLoading ? (
        <div className="text-center py-12 text-gray-400">Loading Google ad accounts...</div>
      ) : googleAccounts.length === 0 && pendingGrants.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No Google Ads accounts connected</p>
          <p className="text-gray-400 text-sm mt-1">
            Click <span className="font-medium">Connect Google</span> to authorize via OAuth.
            Sync requires <code className="px-1 bg-slate-100 rounded">GOOGLE_ADS_DEVELOPER_TOKEN</code> on the server.
          </p>
        </div>
      ) : googleAccounts.length > 0 && (
        <>
          {googleSummary && googleSummary.spend > 0 && (() => {
            const gp = googleOverview?.priorSummary || {};
            return (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-4">
                <KpiCard label="Spend" value={formatCurrency(googleSummary.spend, googleCurrency)} current={googleSummary.spend} prior={gp.spend} priorValue={formatCurrency(gp.spend, googleCurrency)} sparkColor="#10b981" />
                <KpiCard label="Impressions" value={formatNumber(googleSummary.impressions)} current={googleSummary.impressions} prior={gp.impressions} priorValue={formatNumber(gp.impressions)} sparkColor="#3b82f6" />
                <KpiCard label="Clicks" value={formatNumber(googleSummary.clicks)} current={googleSummary.clicks} prior={gp.clicks} priorValue={formatNumber(gp.clicks)} sparkColor="#06b6d4" caption={`CTR ${googleSummary.ctr.toFixed(2)}%`} />
                <KpiCard label="Conversions" value={formatNumber(googleSummary.conversions)} current={googleSummary.conversions} prior={gp.conversions} priorValue={formatNumber(gp.conversions)} sparkColor="#8b5cf6" caption={`ROAS ${googleSummary.roas.toFixed(2)}x`} />
              </div>
            );
          })()}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">Connected Ad Accounts ({googleAccounts.length})</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {googleAccounts.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {a.customerId}{a.googleEmail ? ` • ${a.googleEmail}` : ''}{a.currency ? ` • ${a.currency}` : ''}
                      {!a.clientId && !a.manager && (
                        <span className="ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium">
                          Unassigned
                        </span>
                      )}
                      {a.manager && <span className="ml-2 px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">MCC</span>}
                      {a.testAccount && <span className="ml-2 px-1.5 py-0.5 bg-blue-50 rounded text-blue-600">TEST</span>}
                      {a.syncError && (
                        <span className="ml-2 inline-flex items-center gap-1 text-rose-600" title={a.syncError}>
                          <AlertTriangle className="w-3 h-3" /> sync error
                        </span>
                      )}
                    </p>
                    {!a.manager && (
                      <div className="mt-1">
                        <AccountStats stats={googleByAccount.get(a.id)} currency={a.currency || googleCurrency} />
                      </div>
                    )}
                  </div>
                  {canSync && (
                    <select
                      value={a.clientId || ''}
                      onChange={(e) => assignGoogleClientMut.mutate({ id: a.id, clientId: e.target.value || null })}
                      className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white"
                    >
                      <option value="">No client</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  {a.lastSyncedAt && (
                    <span className="text-[11px] text-gray-400 hidden sm:inline">
                      Synced {format(new Date(a.lastSyncedAt), 'MMM d HH:mm')}
                    </span>
                  )}
                  {canSync && !a.manager && (
                    <button
                      onClick={() => syncGoogleOneMut.mutate(a.id)}
                      disabled={syncGoogleOneMut.isPending}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                      title="Sync this account"
                    >
                      <RefreshCw className={clsx('w-3.5 h-3.5', syncGoogleOneMut.isPending && syncGoogleOneMut.variables === a.id && 'animate-spin')} />
                    </button>
                  )}
                  {canRemove && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove "${a.name}" (${a.customerId})? Historical insights stay.`)) {
                          disconnectGoogleAccMut.mutate(a.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Remove ad account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ─── TikTok Ads ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-12 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 bg-slate-900 rounded-full" />
          <h2 className="text-base font-semibold text-gray-800">TikTok Ads</h2>
        </div>
        <div className="flex items-center gap-2">
          {canSync && tiktokAccounts.length > 0 && (
            <button
              onClick={() => syncAllTikTokMut.mutate()}
              disabled={syncAllTikTokMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', syncAllTikTokMut.isPending && 'animate-spin')} />
              {syncAllTikTokMut.isPending ? 'Syncing...' : 'Sync now'}
            </button>
          )}
          {canSync && (tiktokAccounts.length > 0 || tiktokPendingGrants.length > 0) && (
            <button
              onClick={() => rediscoverTikTokMut.mutate()}
              disabled={rediscoverTikTokMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              title="Re-run discovery on every connected TikTok grant"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', rediscoverTikTokMut.isPending && 'animate-spin')} />
              {rediscoverTikTokMut.isPending ? 'Re-discovering...' : 'Re-discover'}
            </button>
          )}
          {canRemove && (
            <button
              onClick={() => connectTikTokMut.mutate()}
              disabled={connectTikTokMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Connect TikTok
            </button>
          )}
        </div>
      </div>

      {tiktokPendingGrants.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 space-y-2">
          {tiktokPendingGrants.map(g => (
            <div key={g.id} className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-900">{g.displayName || `TikTok user ${g.tiktokUserId}`}</p>
                <p className="text-xs text-amber-700">
                  {g.discoverError || 'Authorised. No advertisers discovered yet — try Retry discovery.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canSync && (
                  <button
                    onClick={() => discoverTikTokMut.mutate(g.id)}
                    disabled={discoverTikTokMut.isPending}
                    className="px-3 py-1 text-xs font-medium text-amber-900 bg-white border border-amber-300 rounded-md hover:bg-amber-100"
                  >
                    Retry discovery
                  </button>
                )}
                {canRemove && (
                  <button
                    onClick={() => {
                      if (confirm(`Disconnect TikTok ${g.displayName || g.tiktokUserId}?`)) disconnectTikTokGrantMut.mutate(g.id);
                    }}
                    className="p-1.5 text-amber-700 hover:text-rose-600 hover:bg-rose-50 rounded"
                    title="Disconnect"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tiktokLoading ? (
        <div className="text-center py-12 text-gray-400">Loading TikTok ad accounts...</div>
      ) : tiktokAccounts.length === 0 && tiktokPendingGrants.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No TikTok Ads accounts connected</p>
          <p className="text-gray-400 text-sm mt-1">
            Click <span className="font-medium">Connect TikTok</span> to authorize via OAuth.
            Sandbox returns mock data; production needs app review.
          </p>
        </div>
      ) : tiktokAccounts.length > 0 && (
        <>
          {tiktokSummary && tiktokSummary.spend > 0 && (() => {
            const tp = tiktokOverview?.priorSummary || {};
            return (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-4">
                <KpiCard label="Spend" value={formatCurrency(tiktokSummary.spend, tiktokCurrency)} current={tiktokSummary.spend} prior={tp.spend} priorValue={formatCurrency(tp.spend, tiktokCurrency)} sparkColor="#10b981" />
                <KpiCard label="Impressions" value={formatNumber(tiktokSummary.impressions)} current={tiktokSummary.impressions} prior={tp.impressions} priorValue={formatNumber(tp.impressions)} sparkColor="#3b82f6" />
                <KpiCard label="Clicks" value={formatNumber(tiktokSummary.clicks)} current={tiktokSummary.clicks} prior={tp.clicks} priorValue={formatNumber(tp.clicks)} sparkColor="#06b6d4" caption={`CTR ${tiktokSummary.ctr.toFixed(2)}%`} />
                <KpiCard label="Conversions" value={formatNumber(tiktokSummary.conversions)} current={tiktokSummary.conversions} prior={tp.conversions} priorValue={formatNumber(tp.conversions)} sparkColor="#8b5cf6" caption={`ROAS ${tiktokSummary.roas.toFixed(2)}x`} />
              </div>
            );
          })()}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">Connected Ad Accounts ({tiktokAccounts.length})</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {tiktokAccounts.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {a.advertiserId}{a.currency ? ` • ${a.currency}` : ''}
                      {!a.clientId && (
                        <span className="ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium">
                          Unassigned
                        </span>
                      )}
                      {a.isSandbox && <span className="ml-2 px-1.5 py-0.5 bg-blue-50 rounded text-blue-600">SANDBOX</span>}
                      {a.syncError && (
                        <span className="ml-2 inline-flex items-center gap-1 text-rose-600" title={a.syncError}>
                          <AlertTriangle className="w-3 h-3" /> sync error
                        </span>
                      )}
                    </p>
                    <div className="mt-1">
                      <AccountStats stats={tiktokByAccount.get(a.id)} currency={a.currency || tiktokCurrency} />
                    </div>
                  </div>
                  {canSync && (
                    <select
                      value={a.clientId || ''}
                      onChange={(e) => assignTikTokClientMut.mutate({ id: a.id, clientId: e.target.value || null })}
                      className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white"
                    >
                      <option value="">No client</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  {a.lastSyncedAt && (
                    <span className="text-[11px] text-gray-400 hidden sm:inline">
                      Synced {format(new Date(a.lastSyncedAt), 'MMM d HH:mm')}
                    </span>
                  )}
                  {canSync && (
                    <button
                      onClick={() => syncTikTokOneMut.mutate(a.id)}
                      disabled={syncTikTokOneMut.isPending}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                      title="Sync this advertiser"
                    >
                      <RefreshCw className={clsx('w-3.5 h-3.5', syncTikTokOneMut.isPending && syncTikTokOneMut.variables === a.id && 'animate-spin')} />
                    </button>
                  )}
                  {canRemove && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove "${a.name}" (${a.advertiserId})? Historical insights stay.`)) {
                          disconnectTikTokAccMut.mutate(a.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Remove ad account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
