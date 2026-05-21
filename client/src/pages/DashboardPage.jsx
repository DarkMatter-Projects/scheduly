import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getPostStats } from '../api/statsApi';
import { listPosts } from '../api/postsApi';
import { getRecentActivity } from '../api/activityApi';
import { getThreadCounts } from '../api/engageApi';
import {
  CalendarDays, PenSquare, Image as ImageIcon, BarChart3,
  Clock, AlertCircle, CheckCircle, Activity, TrendingUp, ArrowUpRight,
  Sparkles, MessageCircle, LayoutGrid,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import Thumbnail from '../components/common/Thumbnail';
import clsx from 'clsx';

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  pending_approval: { label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  approved: { label: 'Approved', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  scheduled: { label: 'Scheduled', color: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  publishing: { label: 'Publishing', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  published: { label: 'Published', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  failed: { label: 'Failed', color: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
};

function StatCard({ icon: Icon, label, value, trend, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', colors[color])}>
          <Icon className="w-4 h-4" />
        </div>
        {trend && (
          <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
            <TrendingUp className="w-3 h-3" />
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 tracking-tight">{value ?? 0}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['postStats'],
    queryFn: getPostStats,
  });

  const { data: recentPosts } = useQuery({
    queryKey: ['posts', 'recent'],
    queryFn: () => listPosts({ page: 1, limit: 5 }),
  });

  const { data: activity = [] } = useQuery({
    queryKey: ['activity', 'recent'],
    queryFn: () => getRecentActivity({ limit: 8 }),
  });

  const { data: engageCounts } = useQuery({
    queryKey: ['engage-counts-dashboard'],
    queryFn: () => getThreadCounts(),
    refetchInterval: 60000,
  });

  const posts = recentPosts?.data || [];

  const actionLabels = {
    'post.created': 'created a post',
    'post.submitted': 'submitted for approval',
    'post.approved': 'approved a post',
    'post.rejected': 'rejected a post',
    'post.published': 'published a post',
    'post.publish_failed': 'failed to publish',
    'comment.added': 'commented',
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      {/* Hero greeting */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{greeting}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {user?.firstName}, let's create something great today.
          </h1>
          <p className="text-sm text-slate-500 mt-1">Here's a snapshot of what's happening.</p>
        </div>
        <Link
          to="/posts/new"
          className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow-sm"
        >
          <PenSquare className="w-4 h-4" />
          Create Post
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Clock} label="Scheduled posts" value={stats?.scheduled} color="violet" />
        <StatCard icon={AlertCircle} label="Awaiting approval" value={stats?.pendingApproval} color="amber" />
        <StatCard icon={CheckCircle} label="Published this week" value={stats?.publishedThisWeek} color="emerald" />
        <StatCard icon={MessageCircle} label="Unread inbox" value={engageCounts?.unread} color="blue" />
      </div>

      {/* Quick actions */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative">
          <h2 className="text-lg font-semibold mb-1">Quick actions</h2>
          <p className="text-slate-400 text-sm mb-5">Jump right into what matters.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { to: '/posts/new', icon: PenSquare, label: 'New post' },
              { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
              { to: '/engage', icon: MessageCircle, label: 'Engage' },
              { to: '/dashboards', icon: LayoutGrid, label: 'Dashboards' },
              { to: '/media', icon: ImageIcon, label: 'Media' },
              { to: '/analytics', icon: BarChart3, label: 'Analytics' },
            ].map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10"
              >
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent posts */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recent posts</h2>
              <p className="text-xs text-slate-500 mt-0.5">Your latest content</p>
            </div>
            <Link to="/posts" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {posts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <PenSquare className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No posts yet</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">Create your first post to get started.</p>
              <Link to="/posts/new" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800">
                <PenSquare className="w-3 h-3" />
                Create post
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {posts.map(post => {
                const sc = statusConfig[post.status] || statusConfig.draft;
                return (
                  <Link
                    key={post.id}
                    to={`/posts/${post.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-slate-50 group"
                  >
                    <Thumbnail
                      src={post.thumbnail}
                      alt=""
                      className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 object-cover"
                      placeholder={<PenSquare className="w-4 h-4 text-slate-300" />}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate group-hover:text-blue-600">
                        {post.title || post.content?.substring(0, 50)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {post.creatorName} &middot; {format(new Date(post.createdAt), 'MMM d')}
                      </p>
                    </div>
                    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium border flex-shrink-0', sc.color)}>
                      <span className={clsx('w-1.5 h-1.5 rounded-full', sc.dot)} />
                      {sc.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 p-5 border-b border-slate-100">
            <Activity className="w-4 h-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Team activity</h2>
          </div>

          {activity.length === 0 ? (
            <div className="p-10 text-center">
              <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">No activity yet.</p>
            </div>
          ) : (
            <div className="relative p-5">
              {/* Timeline line */}
              <div className="absolute left-[1.875rem] top-5 bottom-5 w-px bg-slate-100" />

              <div className="space-y-4 relative">
                {activity.map(item => (
                  <div key={item.id} className="flex items-start gap-3 relative">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 ring-4 ring-white z-10">
                      <span className="text-[9px] font-bold text-white">
                        {item.userName.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-700 leading-snug">
                        <span className="font-semibold text-slate-900">{item.userName}</span>{' '}
                        {actionLabels[item.action] || item.action}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
