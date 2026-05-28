import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Share2, Trash2, LayoutGrid, Copy, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  getDashboard, updateDashboard, deleteWidget, createShareLink, revokeShareLink, addWidget,
} from '../api/dashboardsApi';
import { listAccounts } from '../api/socialApi';
import { useAuth } from '../context/AuthContext';
import { getPlatform } from '../utils/platforms';
import AddWidgetModal from '../components/dashboard/AddWidgetModal';
import WidgetRenderer from '../components/dashboard/WidgetRenderer';
import DateRangePicker from '../components/dashboard/DateRangePicker';

export default function DashboardBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin', 'manager', 'editor');
  const canShare = hasRole('admin', 'manager');

  const [editingName, setEditingName] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => getDashboard(id),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['socialAccounts'],
    queryFn: listAccounts,
  });

  const renameMut = useMutation({
    mutationFn: (name) => updateDashboard(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setEditingName(false);
    },
    onError: () => toast.error('Failed to rename'),
  });

  const rangeMut = useMutation({
    mutationFn: (range) => updateDashboard(id, range),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      // Widgets reload so they pick up the new range.
      queryClient.invalidateQueries({ queryKey: ['widget-data'] });
    },
    onError: () => toast.error('Failed to update date range'),
  });

  const removeWidgetMut = useMutation({
    mutationFn: deleteWidget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      toast.success('Widget removed');
    },
    onError: () => toast.error('Failed to remove widget'),
  });

  const shareMut = useMutation({
    mutationFn: () => createShareLink(id),
    onSuccess: (link) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      toast.success('Share link created');
      // Copy to clipboard immediately.
      const url = `${window.location.origin}/share/dashboards/${link.token}`;
      navigator.clipboard?.writeText(url).catch(() => {});
    },
    onError: () => toast.error('Failed to create share link'),
  });

  const revokeMut = useMutation({
    mutationFn: revokeShareLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      toast.success('Share link revoked');
    },
  });

  const addWidgetMut = useMutation({
    mutationFn: (widget) => addWidget(id, widget),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      toast.success('Widget added');
      setShowAddWidget(false);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to add widget'),
  });

  if (isLoading || !dashboard) {
    return <div className="text-center py-12 text-slate-400">Loading dashboard...</div>;
  }

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/dashboards')}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {editingName ? (
            <input
              type="text"
              autoFocus
              defaultValue={dashboard.name}
              onBlur={(e) => renameMut.mutate(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
              className="text-xl font-bold text-slate-900 bg-transparent border-b border-blue-300 outline-none"
            />
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-xl font-bold text-slate-900 truncate">{dashboard.name}</h1>
              {canEdit && (
                <button
                  onClick={() => setEditingName(true)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded"
                  title="Rename"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {dashboard.templateKey && dashboard.templateKey !== 'custom' && (
                <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {dashboard.templateKey.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker
            value={{
              defaultRange: dashboard.defaultRange,
              rangeStart: dashboard.rangeStart,
              rangeEnd: dashboard.rangeEnd,
            }}
            onChange={(range) => rangeMut.mutate(range)}
            disabled={!canEdit}
          />
          {canShare && (
            <button
              onClick={() => setShowShare(s => !s)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          )}
          {canEdit && (
            <>
              <button
                onClick={() => addWidgetMut.mutate({
                  category: 'channel',
                  widgetType: 'text_block',
                  title: 'Text / images',
                  width: 12,
                  height: 2,
                  config: { html: '' },
                })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add text / images
              </button>
              <button
                onClick={() => setShowAddWidget(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Add widget
              </button>
            </>
          )}
        </div>
      </div>

      {/* Share panel */}
      {showShare && (
        <SharePanel dashboard={dashboard} onCreate={() => shareMut.mutate()} onRevoke={(tid) => revokeMut.mutate(tid)} />
      )}

      {/* Channel pill row — read-only summary for now; full picker comes with widget config */}
      <ChannelsSummary accounts={accounts} dashboard={dashboard} />

      {/* Widget grid */}
      {dashboard.widgets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-16 px-6 text-center">
          <LayoutGrid className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <h3 className="text-sm font-semibold text-slate-900 mb-1">This dashboard has no widgets yet</h3>
          <p className="text-xs text-slate-500 mb-5 max-w-md mx-auto">
            Templates seed widgets automatically. For "Build your own", click Add widget to insert your first metric card or chart.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
          {dashboard.widgets.map(w => (
            <WidgetRenderer
              key={w.id}
              widget={w}
              canEdit={canEdit}
              onRemove={() => removeWidgetMut.mutate(w.id)}
            />
          ))}
        </div>
      )}

      {showAddWidget && (
        <AddWidgetModal
          onClose={() => setShowAddWidget(false)}
          onSave={(w) => addWidgetMut.mutate(w)}
        />
      )}
    </div>
  );
}

function ChannelsSummary({ accounts, dashboard }) {
  // Union of channelIds across every widget on this dashboard. Widgets with
  // an empty channelIds array implicitly pull from "all" — only count them
  // if the user opened a built-in custom dashboard with no scoping.
  const scopedIds = new Set();
  let anyWidgetUnscoped = false;
  for (const w of dashboard.widgets || []) {
    if (Array.isArray(w.channelIds) && w.channelIds.length > 0) {
      for (const id of w.channelIds) scopedIds.add(Number(id));
    } else {
      anyWidgetUnscoped = true;
    }
  }

  const active = accounts.filter(a => a.isActive);
  const inScope = scopedIds.size > 0 && !anyWidgetUnscoped
    ? active.filter(a => scopedIds.has(a.id))
    : active;

  if (inScope.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex items-center gap-3 flex-wrap">
      <span className="text-xs font-medium text-slate-500">Channels in scope:</span>
      {inScope.map(a => {
        const p = getPlatform(a.platform);
        const Icon = p?.icon;
        return (
          <span key={a.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-50 border border-slate-200">
            {Icon && (
              <span className={clsx('w-4 h-4 rounded-full flex items-center justify-center text-white', p.bg)}>
                <Icon className="w-2 h-2" />
              </span>
            )}
            <span className="text-[11px] text-slate-700">{a.accountName}</span>
          </span>
        );
      })}
    </div>
  );
}

function SharePanel({ dashboard, onCreate, onRevoke }) {
  const links = dashboard.shareLinks || [];
  const baseUrl = window.location.origin;

  const copy = (token) => {
    const url = `${baseUrl}/share/dashboards/${token}`;
    navigator.clipboard?.writeText(url).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Copy failed')
    );
  };

  return (
    <div className="bg-blue-50/40 border border-blue-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900">Share links</h3>
        <button
          onClick={onCreate}
          className="text-xs font-medium text-blue-700 hover:text-blue-900"
        >
          + New link
        </button>
      </div>
      {links.length === 0 ? (
        <p className="text-xs text-slate-500">
          No active share links. Create one and anyone with the URL can view this dashboard (read-only) without logging in.
        </p>
      ) : (
        <div className="space-y-2">
          {links.map(l => {
            const url = `${baseUrl}/share/dashboards/${l.token}`;
            return (
              <div key={l.id} className="flex items-center gap-2 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
                <code className="flex-1 truncate text-slate-700">{url}</code>
                <span className="text-[10px] text-slate-400">
                  {l.viewCount} view{l.viewCount === 1 ? '' : 's'}
                </span>
                <button onClick={() => copy(l.token)} className="p-1 text-slate-400 hover:text-blue-600" title="Copy">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <a href={url} target="_blank" rel="noreferrer" className="p-1 text-slate-400 hover:text-blue-600" title="Open">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button onClick={() => onRevoke(l.id)} className="p-1 text-slate-400 hover:text-rose-600" title="Revoke">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

