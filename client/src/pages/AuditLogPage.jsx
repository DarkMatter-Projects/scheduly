import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Activity, Search, RefreshCw, Download } from 'lucide-react';
import clsx from 'clsx';
import { listAuditLog, getActivityFacets } from '../api/activityApi';
import { useAuth } from '../context/AuthContext';

// Friendly labels for the most common action verbs. Anything not in the
// map renders as-is so new action types just show up.
const ACTION_LABEL = {
  'post.submitted':  'Submitted post for approval',
  'post.approved':   'Approved post',
  'post.rejected':   'Rejected post',
  'post.scheduled':  'Scheduled post',
  'post.published':  'Published post',
  'post.deleted':    'Deleted post',
  'post.pinned':     'Pinned post',
  'post.unpinned':   'Unpinned post',
  'comment.added':   'Added comment',
};
const ACTION_BADGE = {
  'post.approved': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'post.rejected': 'bg-rose-50 text-rose-700 border-rose-200',
  'post.deleted':  'bg-rose-50 text-rose-700 border-rose-200',
  'post.pinned':   'bg-amber-50 text-amber-800 border-amber-200',
  'post.unpinned': 'bg-slate-50 text-slate-600 border-slate-200',
  'post.published':'bg-blue-50 text-blue-700 border-blue-200',
};

export default function AuditLogPage() {
  const { hasRole } = useAuth();
  const isManager = hasRole('admin', 'manager');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data: facets } = useQuery({
    queryKey: ['activity-facets'],
    queryFn: getActivityFacets,
    enabled: isManager,
  });
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['audit-log', page, action, entityType, since, until],
    queryFn: () => listAuditLog({
      page,
      limit: 50,
      action: action || undefined,
      entityType: entityType || undefined,
      since: since || undefined,
      until: until || undefined,
    }),
    enabled: isManager,
    keepPreviousData: true,
  });

  if (!isManager) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <Activity className="w-8 h-8 mx-auto text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-700">Manager access required</p>
        <p className="text-xs text-slate-500 mt-1">The audit log shows every workspace member's actions. Ask an admin for access.</p>
      </div>
    );
  }

  const rows = data?.data || [];
  const filteredRows = searchInput.trim()
    ? rows.filter(r =>
        (r.userName || '').toLowerCase().includes(searchInput.toLowerCase())
        || (r.action || '').toLowerCase().includes(searchInput.toLowerCase())
        || (r.entityType || '').toLowerCase().includes(searchInput.toLowerCase())
        || String(r.entityId || '').includes(searchInput))
    : rows;
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const headers = ['When','User','Action','Entity','EntityID','Details'];
    const escape = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        new Date(r.createdAt).toISOString(),
        r.userName,
        r.action,
        r.entityType || '',
        r.entityId || '',
        r.details ? JSON.stringify(r.details) : '',
      ].map(escape).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-page${pagination.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit log</h1>
          <p className="text-sm text-slate-500 mt-1">Every approval, schedule, publish, pin, comment — across every user.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export page
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Filter visible rows…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <select
          value={action}
          onChange={e => { setPage(1); setAction(e.target.value); }}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All actions</option>
          {(facets?.actions || []).map(a => (
            <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>
          ))}
        </select>
        <select
          value={entityType}
          onChange={e => { setPage(1); setEntityType(e.target.value); }}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All entities</option>
          {(facets?.entityTypes || []).map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <input
          type="date"
          value={since}
          onChange={e => { setPage(1); setSince(e.target.value); }}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
          title="Since"
        />
        <input
          type="date"
          value={until}
          onChange={e => { setPage(1); setUntil(e.target.value); }}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
          title="Until"
        />
        {(action || entityType || since || until || searchInput) && (
          <button
            onClick={() => { setAction(''); setEntityType(''); setSince(''); setUntil(''); setSearchInput(''); setPage(1); }}
            className="text-[11px] text-slate-500 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="py-10 text-center text-xs text-slate-400">Loading…</div>
        ) : filteredRows.length === 0 ? (
          <div className="py-10 text-center">
            <Activity className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500">No matching activity in the selected range.</p>
          </div>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-500">When</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">User</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Action</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Entity</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(r => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600 tabular-nums">
                    {format(new Date(r.createdAt), 'MMM d, HH:mm:ss')}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="font-medium text-slate-800">{r.userName}</div>
                    {r.userEmail && <div className="text-[10px] text-slate-400">{r.userEmail}</div>}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border',
                      ACTION_BADGE[r.action] || 'bg-slate-50 text-slate-600 border-slate-200'
                    )}>
                      {ACTION_LABEL[r.action] || r.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-700">
                    {r.entityType
                      ? <EntityLink type={r.entityType} id={r.entityId} />
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600 max-w-md">
                    <DetailsCell details={r.details} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 tabular-nums">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total.toLocaleString()} total entries
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EntityLink({ type, id }) {
  if (type === 'post' && id) {
    return <Link to={`/posts/${id}`} className="text-blue-600 hover:underline">Post #{id}</Link>;
  }
  if (type === 'post_target' && id) {
    return <span className="text-slate-500">Target #{id}</span>;
  }
  return <span className="text-slate-500">{type}{id ? ` #${id}` : ''}</span>;
}

function DetailsCell({ details }) {
  if (!details) return <span className="text-slate-300">—</span>;
  // Pretty-print a few well-known shapes; fall back to JSON for anything else.
  if (details.note) return <span className="text-slate-700">"{details.note}"</span>;
  if (details.platform) return <span className="text-slate-600">{details.platform}</span>;
  return <code className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">{JSON.stringify(details)}</code>;
}
