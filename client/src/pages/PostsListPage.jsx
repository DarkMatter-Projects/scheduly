import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listPosts, deletePost } from '../api/postsApi';
import { listClients } from '../api/clientsApi';
import { listAccounts } from '../api/socialApi';
import { useAuth } from '../context/AuthContext';
import { useClientScope } from '../context/ClientContext';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Plus, Trash2, PenSquare, Search, Film, Image, Upload } from 'lucide-react';
import BulkUploadModal from '../components/posts/BulkUploadModal';
import Thumbnail from '../components/common/Thumbnail';
import clsx from 'clsx';
import { SENTIMENT_STYLES } from '../utils/sentiment';

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  pending_approval: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700' },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  publishing: { label: 'Publishing', color: 'bg-purple-100 text-purple-700' },
  published: { label: 'Published', color: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'failed', label: 'Failed' },
];

export default function PostsListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const { activeClientId, activeClient } = useClientScope();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showBulk, setShowBulk] = useState(false);

  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: listClients });
  const { data: accounts = [] } = useQuery({ queryKey: ['socialAccounts'], queryFn: listAccounts });

  // The active workspace client overrides any local client filter; we hide that filter UI when set.
  const effectiveClientId = activeClientId || (clientFilter ? Number(clientFilter) : null);

  // Reset paging when scope changes
  useEffect(() => { setPage(1); setAccountFilter(''); }, [activeClientId]);

  // Accounts shown in the dropdown narrow to the effective client when set
  const accountOptions = useMemo(() => {
    const active = accounts.filter(a => a.isActive);
    if (!effectiveClientId) return active;
    return active.filter(a => a.clientId === effectiveClientId);
  }, [accounts, effectiveClientId]);

  const { data, isLoading } = useQuery({
    queryKey: ['posts', page, statusFilter, search, effectiveClientId, accountFilter],
    queryFn: () => listPosts({
      page,
      limit: 15,
      status: statusFilter || undefined,
      search: search || undefined,
      clientId: effectiveClientId || undefined,
      socialAccountId: accountFilter || undefined,
    }),
  });

  const deleteMut = useMutation({
    mutationFn: deletePost,
    onSuccess: () => {
      toast.success('Post deleted');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
    onError: () => toast.error('Failed to delete'),
  });

  const posts = data?.data || [];
  const pagination = data?.pagination;

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Posts</h1>
          {activeClient && (
            <p className="text-sm text-slate-500 mt-1">Scoped to {activeClient.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Upload className="w-4 h-4" />
            Bulk upload
          </button>
          <Link
            to="/posts/new"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4" />
            New Post
          </Link>
        </div>
      </div>

      {showBulk && (
        <BulkUploadModal
          accounts={accounts || []}
          onClose={() => setShowBulk(false)}
          onDone={() => { setShowBulk(false); queryClient.invalidateQueries({ queryKey: ['posts'] }); }}
        />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex-1 min-w-[200px] max-w-sm relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search posts..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </form>
        {!activeClientId && (
          <select
            value={clientFilter}
            onChange={e => { setClientFilter(e.target.value); setAccountFilter(''); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <select
          value={accountFilter}
          onChange={e => { setAccountFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">All accounts</option>
          {accountOptions.map(a => (
            <option key={a.id} value={a.id}>{a.accountName}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Posts table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading posts...</div>
        ) : posts.length === 0 ? (
          <div className="p-12 text-center">
            <PenSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No posts found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or create a new post.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Post</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Tone</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Type</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Author</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Date</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map(post => {
                    const sc = statusConfig[post.status] || statusConfig.draft;
                    return (
                      <tr
                        key={post.id}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                        onClick={() => navigate(`/posts/${post.id}`)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Thumbnail
                              src={post.thumbnail}
                              mimeType={post.thumbnailMime}
                              alt=""
                              className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 object-cover"
                              placeholder={<PenSquare className="w-4 h-4 text-slate-300" />}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate max-w-xs">
                                {post.title || post.content.substring(0, 60)}
                              </p>
                              {post.mediaCount > 0 && (
                                <p className="text-xs text-gray-400">{post.mediaCount} media file{post.mediaCount > 1 ? 's' : ''}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-medium', sc.color)}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {post.captionSentimentLabel ? (() => {
                            const ss = SENTIMENT_STYLES[post.captionSentimentLabel];
                            return (
                              <span
                                className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', ss.bg, ss.text)}
                                title={post.captionSentimentScore != null ? `Score: ${post.captionSentimentScore}` : ''}
                              >
                                <span className={clsx('w-1.5 h-1.5 rounded-full', ss.dot)} />
                                {ss.label}
                              </span>
                            );
                          })() : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600 capitalize">{post.postType}</td>
                        <td className="px-5 py-3 text-sm text-gray-600">{post.creatorName}</td>
                        <td className="px-5 py-3 text-sm text-gray-500">
                          {format(new Date(post.createdAt), 'MMM d, yyyy')}
                        </td>
                        <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                          {hasRole('admin', 'manager') && (
                            <button
                              onClick={() => { if (confirm('Delete this post?')) deleteMut.mutate(post.id); }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  {pagination.total} post{pagination.total !== 1 ? 's' : ''} total
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    {page} / {pagination.pages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page >= pagination.pages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
