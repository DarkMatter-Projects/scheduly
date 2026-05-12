import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import {
  DollarSign, Eye, MousePointer, Target, TrendingUp, RefreshCw, Activity, Building2, AlertTriangle, Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { listAdAccounts, listCampaigns, getAdsOverview, syncAllAds, syncAdAccount, assignAdAccountClient, disconnectAdAccount } from '../api/adsApi';
import { listClients } from '../api/clientsApi';
import { useClientScope } from '../context/ClientContext';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

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

  const primaryCurrency = accounts.find(a => a.currency)?.currency || 'USD';

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeClient
              ? `Paid performance for ${activeClient.name}`
              : 'Meta Ads campaigns and performance across connected ad accounts'}
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

      {accountsLoading ? (
        <div className="text-center py-12 text-gray-400">Loading ad accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
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
          ) : summary && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <StatCard
                  icon={DollarSign}
                  label="Spend"
                  value={formatCurrency(summary.spend, primaryCurrency)}
                  color="bg-emerald-500"
                />
                <StatCard
                  icon={Eye}
                  label="Impressions"
                  value={formatNumber(summary.impressions)}
                  color="bg-blue-500"
                />
                <StatCard
                  icon={MousePointer}
                  label="Clicks"
                  value={formatNumber(summary.clicks)}
                  sublabel={`CTR ${summary.ctr.toFixed(2)}%`}
                  color="bg-cyan-500"
                />
                <StatCard
                  icon={Target}
                  label="Conversions"
                  value={formatNumber(summary.conversions)}
                  sublabel={`Value ${formatCurrency(summary.conversionValue, primaryCurrency)}`}
                  color="bg-violet-500"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <StatCard icon={TrendingUp} label="ROAS" value={`${summary.roas.toFixed(2)}x`} color="bg-amber-500" />
                <StatCard icon={DollarSign} label="CPC" value={formatCurrency(summary.cpc, primaryCurrency)} color="bg-pink-500" />
                <StatCard icon={DollarSign} label="CPM" value={formatCurrency(summary.cpm, primaryCurrency)} color="bg-rose-500" />
                <StatCard icon={Activity} label="Reach" value={formatNumber(summary.reach)} color="bg-indigo-500" />
              </div>

              {/* Spend chart */}
              {daily.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-medium text-gray-700 mb-4">Daily Spend</h3>
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
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-medium text-gray-700 mb-4">Clicks & Impressions</h3>
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
                  </div>
                </div>
              )}
            </>
          )}

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
                      {a.accountStatus !== 1 && a.accountStatus != null && (
                        <span className="ml-2 inline-flex items-center gap-1 text-rose-600">
                          <AlertTriangle className="w-3 h-3" /> status {a.accountStatus}
                        </span>
                      )}
                    </p>
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
    </div>
  );
}
