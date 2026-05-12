import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getOverviewAnalytics } from '../api/analyticsApi';
import { getAdsOverview } from '../api/adsApi';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import { Eye, Users, Heart, MessageSquare, Share2, MousePointer, TrendingUp, BarChart3, Smile, DollarSign, Target, Megaphone, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { SENTIMENT_STYLES } from '../utils/sentiment';
import { useClientScope } from '../context/ClientContext';

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
  const [rangeDays, setRangeDays] = useState(30);
  const { activeClientId, activeClient } = useClientScope();

  const end = format(new Date(), 'yyyy-MM-dd');
  const start = format(subDays(startOfDay(new Date()), rangeDays), 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'overview', start, end, activeClientId],
    queryFn: () => getOverviewAnalytics(start, end, activeClientId || undefined),
  });

  const { data: paidOverview } = useQuery({
    queryKey: ['adsOverview', activeClientId, rangeDays],
    queryFn: () => getAdsOverview({ clientId: activeClientId || undefined, days: rangeDays }),
  });

  const summary = data?.summary || {};
  const posts = data?.posts || [];
  const daily = data?.daily || [];
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
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-md transition',
                rangeDays === r.days ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading analytics...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard icon={Eye} label="Impressions" value={summary.totalImpressions} color="bg-blue-500" />
            <StatCard icon={Users} label="Reach" value={summary.totalReach} color="bg-blue-500" />
            <StatCard icon={Heart} label="Likes" value={summary.totalLikes} color="bg-pink-500" />
            <StatCard icon={TrendingUp} label="Avg Engagement" value={`${summary.avgEngagementRate?.toFixed(1) || 0}%`} color="bg-emerald-500" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <StatCard icon={MessageSquare} label="Comments" value={summary.totalComments} color="bg-amber-500" />
            <StatCard icon={Share2} label="Shares" value={summary.totalShares} color="bg-purple-500" />
            <StatCard icon={MousePointer} label="Clicks" value={summary.totalClicks} color="bg-cyan-500" />
            <StatCard icon={BarChart3} label="Posts" value={summary.totalPosts} color="bg-gray-500" />
          </div>

          {/* Charts */}
          {daily.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Impressions & Reach chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Impressions & Reach</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => format(new Date(v), 'MMM d')}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={formatNum} />
                    <Tooltip
                      labelFormatter={(v) => format(new Date(v), 'MMM d, yyyy')}
                      formatter={(value) => [value.toLocaleString(), undefined]}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="impressions" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="reach" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Engagement chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Likes & Posts Published</h3>
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
              </div>
            </div>
          )}

          {/* Paid media summary */}
          {paidOverview && paidOverview.summary.spend > 0 && (() => {
            const s = paidOverview.summary;
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
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <StatCard icon={DollarSign} label="Spend" value={money(s.spend)} color="bg-emerald-500" />
                  <StatCard icon={Eye} label="Impressions" value={fmt(s.impressions)} color="bg-blue-500" />
                  <StatCard icon={MousePointer} label="Clicks" value={fmt(s.clicks)} color="bg-cyan-500" />
                  <StatCard icon={Target} label="Conversions" value={fmt(s.conversions)} color="bg-violet-500" />
                  <StatCard icon={TrendingUp} label="ROAS" value={`${(s.roas || 0).toFixed(2)}x`} color="bg-amber-500" />
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
                  <h3 className="text-sm font-medium text-gray-700">Caption Tone</h3>
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
                <h3 className="text-sm font-medium text-gray-700 mb-4">Caption Tone by Client</h3>
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
              <h3 className="text-sm font-medium text-gray-700">Post Performance</h3>
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
