import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { X, Calendar, Send, Check, Pencil, MessageSquare, Trash2, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { getPost, approvePost, submitForApproval } from '../../api/postsApi';
import { listComments, addComment, deleteComment } from '../../api/commentsApi';
import { useAuth } from '../../context/AuthContext';
import AccountAvatar from '../common/AccountAvatar';
import { formatRelative } from '../../utils/time';
import { platformPostUrl, platformPostUrlLabel } from '../../utils/platformPostUrl';

// Quick-look modal for a calendar post. Pulls the full post detail + comments
// so editors can leave feedback and managers can approve without leaving the
// calendar view.
export default function PostQuickModal({ postId, onClose }) {
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data: post, isLoading } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => getPost(postId),
    enabled: !!postId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => listComments(postId),
    enabled: !!postId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['post', postId] });
    queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
  };

  const approveMut = useMutation({
    mutationFn: () => approvePost(postId),
    onSuccess: () => { toast.success('Post approved'); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Approve failed'),
  });

  const submitMut = useMutation({
    mutationFn: () => submitForApproval(postId),
    onSuccess: () => { toast.success('Submitted for approval'); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Submit failed'),
  });

  const addCommentMut = useMutation({
    mutationFn: (body) => addComment(postId, body),
    onSuccess: () => { setDraft(''); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Comment failed'),
  });

  const deleteCommentMut = useMutation({
    mutationFn: (id) => deleteComment(id),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const canApprove = hasRole('admin', 'manager');
  const canSubmit  = hasRole('admin', 'manager', 'editor');
  const canComment = hasRole('admin', 'manager', 'editor');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl mt-8 mb-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {post?.title || 'Post details'}
            </h2>
            {post && <StatusPill status={post.status} />}
          </div>
          <div className="flex items-center gap-1">
            {post && (
              <Link
                to={`/posts/${postId}/edit`}
                onClick={onClose}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
              >
                <Pencil className="w-3 h-3" /> Full edit
              </Link>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLoading || !post ? (
          <div className="p-10 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-0 flex-1 overflow-y-auto">
            {/* Left: post content */}
            <div className="md:col-span-3 p-5 border-r border-slate-100">
              {/* Schedule line */}
              <div className="flex items-center gap-2 mb-3 text-xs text-slate-600">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {post.scheduledAt
                  ? <>Scheduled for <strong className="text-slate-900">{format(new Date(post.scheduledAt), 'EEE, MMM d · HH:mm')}</strong></>
                  : post.publishedAt
                    ? <>Published <strong className="text-slate-900">{format(new Date(post.publishedAt), 'EEE, MMM d · HH:mm')}</strong></>
                    : <span className="text-slate-400">Not yet scheduled</span>}
              </div>

              {/* Targets — for published targets the chip becomes a link to
                  the post on the platform (when we can construct a stable URL). */}
              {Array.isArray(post.targets) && post.targets.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {post.targets.map(t => {
                    const url = t.status === 'published' ? platformPostUrl(t) : null;
                    const chip = (
                      <>
                        <AccountAvatar account={{ id: t.socialAccountId, platform: t.platform }} size={14} />
                        {t.accountName}
                        {url && <ExternalLink className="w-2.5 h-2.5 ml-0.5 text-slate-400" />}
                      </>
                    );
                    return url ? (
                      <a
                        key={t.id}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={platformPostUrlLabel(t.platform)}
                        className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
                      >{chip}</a>
                    ) : (
                      <span key={t.id} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {chip}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Caption */}
              <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-800 whitespace-pre-wrap mb-4">
                {post.content || <span className="text-slate-400 italic">No caption</span>}
              </div>

              {/* Media */}
              {Array.isArray(post.media) && post.media.length > 0 && (
                <div className={clsx(
                  'grid gap-2 mb-4',
                  post.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                )}>
                  {post.media.map(m => (
                    <div key={m.id} className="aspect-square bg-slate-100 rounded-lg overflow-hidden">
                      {m.mimeType?.startsWith('video/') ? (
                        <video src={m.url || m.filePath} controls className="w-full h-full object-cover" />
                      ) : (
                        <img src={m.url || m.filePath} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                {post.status === 'draft' && canSubmit && (
                  <button
                    onClick={() => submitMut.mutate()}
                    disabled={submitMut.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit for approval
                  </button>
                )}
                {post.status === 'pending_approval' && canApprove && (
                  <button
                    onClick={() => approveMut.mutate()}
                    disabled={approveMut.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {approveMut.isPending ? 'Approving…' : 'Approve'}
                  </button>
                )}
                {post.status === 'approved' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg">
                    <Check className="w-3.5 h-3.5" />
                    Approved
                  </span>
                )}
              </div>
            </div>

            {/* Right: comments thread */}
            <div className="md:col-span-2 flex flex-col bg-slate-50/50 min-h-[300px]">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Team comments
                </h3>
                <span className="text-[10px] text-slate-500">{comments.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {comments.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic text-center py-4">
                    No comments yet. Leave the first one →
                  </p>
                ) : (
                  comments.map(c => (
                    <div key={c.id} className="bg-white rounded-lg border border-slate-200 p-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                            {c.userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-900 truncate">{c.userName}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[10px] text-slate-400">{formatRelative(c.createdAt)}</span>
                          {(c.userId === user?.id || hasRole('admin', 'manager')) && (
                            <button
                              onClick={() => deleteCommentMut.mutate(c.id)}
                              className="p-0.5 text-slate-300 hover:text-rose-600"
                              title="Delete"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  ))
                )}
              </div>

              {canComment && (
                <div className="border-t border-slate-200 p-3 bg-white">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Add feedback for the team…"
                    rows={2}
                    className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 resize-y focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={() => addCommentMut.mutate(draft.trim())}
                    disabled={!draft.trim() || addCommentMut.isPending}
                    className="mt-1.5 w-full text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded py-1.5 disabled:opacity-50"
                  >
                    {addCommentMut.isPending ? 'Posting…' : 'Add comment'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    draft:            { bg: 'bg-slate-100',  text: 'text-slate-700',  label: 'Draft' },
    pending_approval: { bg: 'bg-amber-100',  text: 'text-amber-800',  label: 'Pending' },
    approved:         { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Approved' },
    scheduled:        { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Scheduled' },
    publishing:       { bg: 'bg-violet-100', text: 'text-violet-800', label: 'Publishing' },
    published:        { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Published' },
    failed:           { bg: 'bg-rose-100',   text: 'text-rose-800',   label: 'Failed' },
  };
  const s = map[status] || map.draft;
  return (
    <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide', s.bg, s.text)}>
      {s.label}
    </span>
  );
}
