import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOverviewAnalytics, refreshPostInsights, refreshAllInsights } from '../api/analyticsApi';
import { getAdsOverview } from '../api/adsApi';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import { Eye, Users, Heart, MessageSquare, Share2, MousePointer, TrendingUp, BarChart3, Smile, DollarSign, Target, Megaphone, ArrowRight, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { SENTIMENT_STYLES } from '../utils/sentiment';
import { useClientScope } from '../context/ClientContext';
import { useAuth } from '../context/AuthContext';
import KpiCard from '../components/common/KpiCard';
import ChartEmptyState from '../components/common/ChartEmptyState';

const SENTIMENT_COLORS = {
  positive: '#10b981',
  neutral: '#94a3b8',
  negative: '#ef4444',
  unknown: '#e2e8f0',
};

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatNum(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export default function AnalyticsPage() {
  const { activeClientId, activeClient } = useClientScope();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const canRefresh = hasRole('admin', 'manager');
  const [end, setEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [start, setStart] = useState(() => format(subDays(startOfDay(new Date()), 30), 'yyyy-MM-dd'));

  const refreshMutation = useMutation({
    mutationFn: refreshPostInsights,
    onSuccess: (result) => {
      if (result.failed === 0) {
        toast.success(`Refreshed ${result.success} target${result.success === 1 ? '' : 's'}`);
      } else if (result.success === 0) {
        toast.error(result.errors[0]?.message || 'Refresh failed');
      } else {
        toast(`${result.success} updated, ${result.failed} failed: ${result.errors[0]?.message || ''}`,
          { icon: 'warning' });
      }
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || err.message || 'Refresh failed');
    },
  });

  const refreshAllMutation = useMutation({
    mutationFn: () => refreshAllInsights(90),
    onSuccess: (result) => {
      toast.success(`Refreshed ${result.success}/${result.total} posts${result.failed ? ` (${result.failed} failed)` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || err.message || 'Bulk refresh failed'),
  });

  const applyPreset = (days) => {
    const e = new Date();
    setEnd(format(e, 'yyyy-MM-dd'));
    setStart(format(subDays(startOfDay(e), days - 1), 'yyyy-MM-dd'));
  };

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'overview', start, end, activeClientId],
    queryFn: () => getOverviewAnalytics(start, end, activeClientId || undefined),
  });

  const { data: paidOverview } = useQuery({
    queryKey: ['adsOverview', activeClientId, start, end],
    queryFn: () => getAdsOverview({
      clientId: activeClientId || undefined,
      start,
      end,
    }),
  });

  const summary = data?.summary || {};
  const priorSummary = data?.priorSummary || {};
  const posts = data?.posts || [];
  const daily = data?.daily || [];

  // Pre-build sparkline arrays per metric so each KPI card can render its own
  // mini-trend without recomputing on every render.
  const spark = (key) => daily.map(d => ({ date: d.date, value: Number(d[key]) || 0 }));
  const sparkImpressions = spark('impressions');
  const sparkReach = spark('reach');
  const sparkLikes = spark('likes');
  const fmtNum = (n) => Number(n || 0).toLocaleString();
  const fmtPct = (n) => `${(Number(n) || 0).toFixed(1)}%`;
  const sentimentDist = data?.sentiment?.distribution || [];
  const sentimentByClient = data?.sentiment?.byClient || [];
  const totalScoredCaptions = sentimentDist
    .filter(d => d.label !== 'unknown')
    .reduce((sum, d) => sum + d.count, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">
            {activeClient
              ? `Metrics for ${activeClient.name}`
              : 'Performance metrics for your published posts'}
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
              value={start}
              max={end}
              onChange={e => setStart(e.target.value)}
              className="text-xs text-slate-700 bg-transparent outline-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={end}
              min={start}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setEnd(e.target.value)}
              className="text-xs text-slate-700 bg-transparent outline-none"
            />
          </div>
          {canRefresh && (
            <button
              onClick={() => refreshAllMutation.mutate()}
              disabled={refreshAllMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              title="Re-pull insights for every published post in the last 90 days"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', refreshAllMutation.isPending && 'animate-spin')} />
              {refreshAllMutation.isPending ? 'Refreshing…' : 'Refresh insights'}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading analytics...</div>
      ) : (
        <>
          {/* KPI grid — wetility-style cards with delta vs prior period + sparkline */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 mb-8">
            <KpiCard
              label="Impressions"
              value={fmtNum(summary.totalImpressions)}
              current={summary.totalImpressions}
              prior={priorSummary.totalImpressions}
              priorValue={fmtNum(priorSummary.totalImpressions)}
              sparkData={sparkImpressions}
              sparkColor="#3b82f6"
            />
            <KpiCard
              label="Reach"
              value={fmtNum(summary.totalReach)}
              current={summary.totalReach}
              prior={priorSummary.totalReach}
              priorValue={fmtNum(priorSummary.totalReach)}
              sparkData={sparkReach}
              sparkColor="#6366f1"
            />
            <KpiCard
              label="Likes"
              value={fmtNum(summary.totalLikes)}
              current={summary.totalLikes}
              prior={priorSummary.totalLikes}
              priorValue={fmtNum(priorSummary.totalLikes)}
              sparkData={sparkLikes}
              sparkColor="#ec4899"
            />
            <KpiCard
              label="Avg engagement"
              value={fmtPct(summary.avgEngagementRate)}
              current={summary.avgEngagementRate}
              prior={priorSummary.avgEngagementRate}
              priorValue={fmtPct(priorSummary.avgEngagementRate)}
              sparkColor="#10b981"
            />
            <KpiCard
              label="Comments"
              value={fmtNum(summary.totalComments)}
              current={summary.totalComments}
              prior={priorSummary.totalComments}
              priorValue={fmtNum(priorSummary.totalComments)}
              sparkColor="#f59e0b"
            />
            <KpiCard
              label="Shares"
              value={fmtNum(summary.totalShares)}
              current={summary.totalShares}
              prior={priorSummary.totalShares}
              priorValue={fmtNum(priorSummary.totalShares)}
              sparkColor="#8b5cf6"
            />
            <KpiCard
              label="Clicks"
              value={fmtNum(summary.totalClicks)}
              current={summary.totalClicks}
              prior={priorSummary.totalClicks}
              priorValue={fmtNum(priorSummary.totalClicks)}
              sparkColor="#06b6d4"
            />
            <KpiCard
              label="Posts"
              value={fmtNum(summary.totalPosts)}
              current={summary.totalPosts}
              prior={priorSummary.totalPosts}
              priorValue={fmtNum(priorSummary.totalPosts)}
              sparkColor="#64748b"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-4">Impressions & Reach</h3>
              {daily.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    {/* Gradient defs matching the KPI sparkline aesthetic */}
                    <defs>
                      <linearGradient id="gradImpressions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradReach" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => format(new Date(v), 'MMM d')}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={formatNum} axisLine={false} tickLine={false} />
                    <Tooltip
                      labelFormatter={(v) => format(new Date(v), 'MMM d, yyyy')}
                      formatter={(value) => [value.toLocaleString(), undefined]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="impressions" stroke="#3b82f6" strokeWidth={1.5} fill="url(#gradImpressions)" dot={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="reach" stroke="#6366f1" strokeWidth={1.5} fill="url(#gradReach)" dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmptyState
                  height={250}
                  title="No insights yet for this period"
                  hint="Insights are pulled from Meta and Instagram once a day. Publish a Facebook or Instagram post, or open a published post and hit Refresh Insights to populate this chart immediately."
                />
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-4">Likes & Posts Published</h3>
              {daily.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
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
                      formatter={(value) => [value.toLocaleString(), undefined]}
                    />
                    <Legend />
                    <Bar dataKey="likes" fill="#ec4899" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="postsCount" fill="#8b5cf6" name="Posts" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmptyState
                  height={250}
                  title="No engagement data yet"
                  hint="Likes and post counts appear here after your first published post in this date range collects insights."
                />
              )}
            </div>
          </div>

          {/* Paid media summary */}
          {paidOverview && paidOverview.summary.spend > 0 && (() => {
            const s = paidOverview.summary;
            const p = paidOverview.priorSummary || {};
            const fmt = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : Number(n || 0).toLocaleString();
            const money = (n) => `$${Number(n || 0).toFixed(2)}`;
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-medium text-gray-700">Paid (Meta Ads)</h3>
                  </div>
                  <Link to="/ads" className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    View Ads <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <KpiCard label="Spend" value={money(s.spend)} current={s.spend} prior={p.spend} priorValue={money(p.spend)} sparkColor="#10b981" />
                  <KpiCard label="Impressions" value={fmt(s.impressions)} current={s.impressions} prior={p.impressions} priorValue={fmt(p.impressions)} sparkColor="#3b82f6" />
                  <KpiCard label="Clicks" value={fmt(s.clicks)} current={s.clicks} prior={p.clicks} priorValue={fmt(p.clicks)} sparkColor="#06b6d4" />
                  <KpiCard label="Conversions" value={fmt(s.conversions)} current={s.conversions} prior={p.conversions} priorValue={fmt(p.conversions)} sparkColor="#8b5cf6" />
                  <KpiCard label="ROAS" value={`${(s.roas || 0).toFixed(2)}x`} current={s.roas} prior={p.roas} priorValue={`${(p.roas || 0).toFixed(2)}x`} sparkColor="#f59e0b" />
                </div>
              </div>
            );
          })()}

          {/* Caption sentiment */}
          {totalScoredCaptions > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Distribution donut */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Smile className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Caption Tone</h3>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={sentimentDist}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {sentimentDist.map(d => (
                        <Cell key={d.label} fill={SENTIMENT_COLORS[d.label] || SENTIMENT_COLORS.unknown} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, name) => [v, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-slate-400 text-center mt-1">
                  {totalScoredCaptions} scored post{totalScoredCaptions === 1 ? '' : 's'}
                </p>
              </div>

              {/* By client */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-4">Caption Tone by Client</h3>
                {sentimentByClient.length === 0 ? (
                  <p className="text-sm text-slate-400 italic py-8 text-center">
                    Assign clients to your social accounts to see this breakdown.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sentimentByClient.map(c => {
                      const total = c.positive + c.neutral + c.negative;
                      const posPct = total > 0 ? (c.positive / total) * 100 : 0;
                      const neuPct = total > 0 ? (c.neutral  / total) * 100 : 0;
                      const negPct = total > 0 ? (c.negative / total) * 100 : 0;
                      const overallLabel =
                        c.avgScore >= 0.2 ? 'positive' :
                        c.avgScore <= -0.2 ? 'negative' : 'neutral';
                      const overallStyle = SENTIMENT_STYLES[overallLabel];
                      return (
                        <div key={c.clientId}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: c.clientColor || '#3b82f6' }}
                              />
                              <span className="text-sm font-medium text-slate-700 truncate">{c.clientName}</span>
                              <span className="text-[11px] text-slate-400">
                                {c.postCount} post{c.postCount === 1 ? '' : 's'}
                              </span>
                            </div>
                            <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', overallStyle.bg, overallStyle.text)}>
                              {overallStyle.label} ({c.avgScore.toFixed(2)})
                            </span>
                          </div>
                          <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                            {posPct > 0 && <div className="bg-emerald-500" style={{ width: `${posPct}%` }} title={`Positive: ${c.positive}`} />}
                            {neuPct > 0 && <div className="bg-slate-400" style={{ width: `${neuPct}%` }} title={`Neutral: ${c.neutral}`} />}
                            {negPct > 0 && <div className="bg-rose-500" style={{ width: `${negPct}%` }} title={`Negative: ${c.negative}`} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Posts table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Post Performance</h3>
            </div>

            {posts.length === 0 ? (
              <div className="p-12 text-center">
                <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No published posts in this period</p>
                <p className="text-gray-400 text-sm mt-1">Publish posts to see performance data here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Post</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">Impressions</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">Reach</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">Likes</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">Comments</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">Shares</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-5 py-3">Engagement</th>
                      {canRefresh && <th className="px-3 py-3 w-10"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map(post => (
                      <tr key={post.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                              {post.thumbnail ? (
                                <img src={post.thumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                                  {post.postType?.[0]?.toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{post.title}</p>
                              {post.publishedAt && (
                                <p className="text-xs text-gray-400">{format(new Date(post.publishedAt), 'MMM d')}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-700 text-right">{post.impressions.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-gray-700 text-right">{post.reach.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-gray-700 text-right">{post.likes.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-gray-700 text-right">{post.commentsCount.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-gray-700 text-right">{post.shares.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={clsx(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            post.engagementRate >= 5 ? 'bg-green-100 text-green-700' :
                            post.engagementRate >= 2 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                          )}>
                            {post.engagementRate.toFixed(1)}%
                          </span>
                        </td>
                        {canRefresh && (
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => refreshMutation.mutate(post.id)}
                              disabled={refreshMutation.isPending && refreshMutation.variables === post.id}
                              title="Refresh analytics for this post"
                              className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-wait transition"
                            >
                              <RefreshCw className={clsx(
                                'w-3.5 h-3.5',
                                refreshMutation.isPending && refreshMutation.variables === post.id && 'animate-spin'
                              )} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
