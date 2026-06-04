import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Sparkles, Search, Plus, Trash2, Share2, LayoutGrid } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { listDashboards, createDashboard, deleteDashboard } from '../api/dashboardsApi';
import { useAuth } from '../context/AuthContext';
import { useClientScope } from '../context/ClientContext';
import TemplatePickerModal from '../components/dashboard/TemplatePickerModal';

const SORT_OPTIONS = [
  { value: 'modified', label: 'Modified' },
  { value: 'created', label: 'Created' },
  { value: 'name', label: 'Name (A-Z)' },
];

export default function DashboardsListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const { activeClientId } = useClientScope();
  const canCreate = hasRole('admin', 'manager', 'editor');
  const canDelete = hasRole('admin', 'manager');

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('modified');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const { data: dashboards = [], isLoading } = useQuery({
    queryKey: ['dashboards', activeClientId],
    queryFn: () => listDashboards(activeClientId || undefined),
  });

  const createMut = useMutation({
    mutationFn: createDashboard,
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      toast.success('Dashboard created');
      navigate(`/dashboards/${d.id}`);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create dashboard'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteDashboard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      toast.success('Dashboard deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const filtered = useMemo(() => {
    let list = dashboards;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => (d.name || '').toLowerCase().includes(q));
    }
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'created') list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else list = [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return list;
  }, [dashboards, search, sort]);

  const handlePickTemplate = (template, accountIds = []) => {
    if (!template.available) return;
    const name = template.key === 'custom'
      ? 'Custom dashboard'
      : template.name;
    // Pre-populate channelIds on every seed widget with the accounts the
    // user picked in step 2 — that way widgets immediately render data
    // for those profiles instead of needing per-widget configuration.
    const widgets = (template.widgets || []).map(w => ({
      ...w,
      channelIds: accountIds.length > 0 ? accountIds : (w.channelIds || []),
    }));
    createMut.mutate({
      name,
      templateKey: template.key,
      description: template.description,
      clientId: activeClientId || undefined,
      // Persist the picked accounts at the dashboard level so an empty
      // Custom canvas still remembers which accounts the user chose —
      // widgets added later inherit this scope via the server's
      // effectiveChannelIds fallback.
      channelIds: accountIds.length > 0 ? accountIds : undefined,
      widgets,
    });
    setShowTemplatePicker(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboards</h1>
        {canCreate && (
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Create dashboard
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by dashboard or channel name"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span>Sorted by</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="px-2 py-1.5 text-xs uppercase tracking-wide rounded-md border border-slate-200 bg-white font-semibold text-slate-700"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Loading dashboards...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-20 px-6 text-center">
          <Sparkles className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            You don't have any dashboards added
          </h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Create a dashboard to start tracking your social media performance.
          </p>
          {canCreate && (
            <button
              onClick={() => setShowTemplatePicker(true)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Create dashboard
            </button>
          )}
          <p className="text-xs text-slate-400 mt-6">
            Tip: starter templates for Facebook, Instagram, TikTok and paid performance are in the picker.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(d => (
            <div
              key={d.id}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-sm transition cursor-pointer"
              onClick={() => navigate(`/dashboards/${d.id}`)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <LayoutGrid className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 truncate">{d.name}</h3>
                </div>
                {d.activeShareCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                    <Share2 className="w-2.5 h-2.5" />
                    Shared
                  </span>
                )}
              </div>
              {d.description && (
                <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-snug">{d.description}</p>
              )}
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{d.widgetCount || 0} widget{d.widgetCount === 1 ? '' : 's'}</span>
                <span>Updated {format(new Date(d.updatedAt), 'MMM d, yyyy')}</span>
              </div>
              {canDelete && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    by {d.creatorName}{d.clientName ? ` · ${d.clientName}` : ''}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete dashboard "${d.name}"?`)) deleteMut.mutate(d.id);
                    }}
                    className={clsx('p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50')}
                    title="Delete dashboard"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showTemplatePicker && (
        <TemplatePickerModal
          onPick={handlePickTemplate}
          clientId={activeClientId || null}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  );
}
