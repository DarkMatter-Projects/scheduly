import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPost, deletePost, submitForApproval, approvePost, rejectPost, schedulePost, refreshTiktokTargetStatus } from '../api/postsApi';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  ArrowLeft, Trash2, Send, CheckCircle, XCircle, Clock,
  Edit3, Film, Calendar, RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import CommentThread from '../components/posts/CommentThread';

function localNow() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  pending_approval: { label: 'Pending Approval', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700' },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  publishing: { label: 'Publishing', color: 'bg-purple-100 text-purple-700' },
  published: { label: 'Published', color: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700' },
};

// Lifecycle map for the TikTok per-publish status TikTok returns after init.
const TIKTOK_STATUS_LABEL = {
  PROCESSING_DOWNLOAD: 'TikTok: downloading media…',
  PROCESSING_UPLOAD: 'TikTok: uploading to draft…',
  PUBLISH_COMPLETE: 'TikTok: live on profile',
  SEND_TO_USER_INBOX: 'TikTok: waiting in user inbox',
  FAILED: 'TikTok: processing failed',
  EXPIRED: 'TikTok: session expired',
};

function TargetRow({ target }) {
  const queryClient = useQueryClient();
  const [ttStatus, setTtStatus] = useState(null);
  const isTiktok = target.platform === 'tiktok';

  const refreshMut = useMutation({
    mutationFn: () => refreshTiktokTargetStatus(target.id),
    onSuccess: (data) => {
      setTtStatus(data);
      const label = TIKTOK_STATUS_LABEL[data.tiktokStatus] || `TikTok: ${data.tiktokStatus || 'unknown'}`;
      if (data.tiktokStatus === 'FAILED') {
        toast.error(`${label}${data.failReason ? ` — ${data.failReason}` : ''}`, { duration: 6000 });
        queryClient.invalidateQueries({ queryKey: ['post'] });
      } else if (data.tiktokStatus === 'PUBLISH_COMPLETE') {
        toast.success(label);
      } else {
        toast(label, { icon: '⏳' });
      }
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to fetch status'),
  });

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-700 truncate">{target.accountName}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={clsx(
            'px-2 py-0.5 rounded-full text-xs',
            target.status === 'published' ? 'bg-green-100 text-green-700' :
            target.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          )}>
            {target.status}
          </span>
          {isTiktok && target.platformPostId && (
            <button
              onClick={() => refreshMut.mutate()}
              disabled={refreshMut.isPending}
              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="Check TikTok processing status"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', refreshMut.isPending && 'animate-spin')} />
            </button>
          )}
        </div>
      </div>
      {ttStatus && (
        <p className="text-[11px] text-slate-500 mt-1">
          {TIKTOK_STATUS_LABEL[ttStatus.tiktokStatus] || `TikTok: ${ttStatus.tiktokStatus || 'unknown'}`}
          {ttStatus.publiclyAvailablePostId && (
            <> · post id <code className="bg-slate-100 px-1 rounded">{ttStatus.publiclyAvailablePostId}</code></>
          )}
          {ttStatus.failReason && <> · {ttStatus.failReason}</>}
        </p>
      )}
      {target.errorMessage && !ttStatus && (
        <p className="text-[11px] text-rose-600 mt-1">{target.errorMessage}</p>
      )}
    </div>
  );
}

export default function PostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const [scheduleDate, setScheduleDate] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['post', id],
    queryFn: () => getPost(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['post', id] });
    queryClient.invalidateQueries({ queryKey: ['posts'] });
  };

  const deleteMut = useMutation({
    mutationFn: () => deletePost(id),
    onSuccess: () => { toast.success('Post deleted'); navigate('/'); },
    onError: () => toast.error('Failed to delete'),
  });

  const submitMut = useMutation({
    mutationFn: () => submitForApproval(id),
    onSuccess: () => { toast.success('Submitted for approval'); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const approveMut = useMutation({
    mutationFn: () => approvePost(id),
    onSuccess: () => { toast.success('Post approved'); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectPost(id, rejectNote),
    onSuccess: () => { toast.success('Post rejected'); setShowRejectModal(false); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const scheduleMut = useMutation({
    mutationFn: () => schedulePost(id, scheduleDate),
    onSuccess: () => { toast.success('Post scheduled'); setShowScheduleModal(false); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (error) return <div className="text-center py-12 text-red-500">Post not found</div>;

  const status = statusConfig[post.status] || statusConfig.draft;
  const canEdit = hasRole('admin', 'manager') || post.createdBy === user?.id;
  const canApprove = hasRole('admin', 'manager') && post.status === 'pending_approval';
  const canSubmit = canEdit && post.status === 'draft';
  const canSchedule = hasRole('admin', 'manager') && ['draft', 'approved'].includes(post.status);
  const canDelete = hasRole('admin', 'manager') || post.createdBy === user?.id;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {post.title || 'Untitled Post'}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-medium', status.color)}>
                {status.label}
              </span>
              <span className="text-xs text-gray-400">
                by {post.creatorName} &middot; {format(new Date(post.createdAt), 'MMM d, yyyy h:mm a')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && !['published', 'publishing'].includes(post.status) && (
            <button
              onClick={() => navigate(`/posts/${post.id}/edit`)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              <Edit3 className="w-4 h-4" />
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => { if (confirm('Delete this post?')) deleteMut.mutate(); }}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Post content */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{post.content}</p>
          </div>

          {/* Media */}
          {post.media && post.media.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Attached Media ({post.media.length})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {post.media.map(m => {
                  const isVideo = m.mimeType.startsWith('video/');
                  return (
                    <div key={m.id} className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                      {isVideo ? (
                        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                          <Film className="w-8 h-8 text-gray-400" />
                        </div>
                      ) : (
                        <img src={m.url} alt={m.originalName} className="w-full h-full object-cover" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Publish error */}
          {post.publishError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="text-sm font-medium text-red-700 mb-1">Publish Error</h3>
              <p className="text-sm text-red-600">{post.publishError}</p>
            </div>
          )}

          {/* Approval History */}
          {post.approvals && post.approvals.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Approval History</h3>
              <div className="space-y-3">
                {post.approvals.map(a => (
                  <div key={a.id} className="flex items-start gap-3">
                    <div className={clsx(
                      'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                      a.decision === 'approved' ? 'bg-green-100' : a.decision === 'rejected' ? 'bg-red-100' : 'bg-yellow-100'
                    )}>
                      {a.decision === 'approved' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-800">
                        <span className="font-medium">{a.reviewerName}</span>
                        {' '}{a.decision === 'approved' ? 'approved' : 'rejected'} this post
                      </p>
                      {a.note && <p className="text-xs text-gray-500 mt-0.5">"{a.note}"</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{format(new Date(a.decidedAt), 'MMM d, h:mm a')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <CommentThread postId={parseInt(id, 10)} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Actions</h3>
            <div className="space-y-2">
              {canSubmit && (
                <button
                  onClick={() => submitMut.mutate()}
                  disabled={submitMut.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-white bg-yellow-500 rounded-lg hover:bg-yellow-600 transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  Submit for Approval
                </button>
              )}

              {canApprove && (
                <>
                  <button
                    onClick={() => approveMut.mutate()}
                    disabled={approveMut.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </>
              )}

              {canSchedule && (
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
                >
                  <Clock className="w-4 h-4" />
                  Schedule
                </button>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="text-gray-800 capitalize">{post.postType}</span>
              </div>
              {post.scheduledAt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Scheduled</span>
                  <span className="text-gray-800">{format(new Date(post.scheduledAt), 'MMM d, h:mm a')}</span>
                </div>
              )}
              {post.publishedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Published</span>
                  <span className="text-gray-800">{format(new Date(post.publishedAt), 'MMM d, h:mm a')}</span>
                </div>
              )}
              {post.assigneeName && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Assigned to</span>
                  <span className="text-gray-800">{post.assigneeName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Targets */}
          {post.targets && post.targets.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Publish Targets</h3>
              <div className="space-y-2">
                {post.targets.map(t => (
                  <TargetRow key={t.id} target={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Reject Post</h3>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="Reason for rejection (optional)"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-red-500 outline-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => rejectMut.mutate()}
                disabled={rejectMut.isPending}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Schedule Post</h3>
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                min={localNow()}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={() => setScheduleDate(localNow())}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                title="Set to current date and time"
              >
                Now
              </button>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowScheduleModal(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => scheduleMut.mutate()}
                disabled={!scheduleDate || scheduleMut.isPending}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
