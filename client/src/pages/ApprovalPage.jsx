import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, Image as ImageIcon, Film } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fetchApprovalLink, submitApprovalDecision } from '../api/postsApi';

// Public, no-auth approval page for brand stakeholders. They land here
// via a tokenized URL the agency sends them, read the post preview,
// then approve or reject without ever logging in. Their decision
// flows back into the same post.approve / post.reject server flow
// that an authenticated reviewer would trigger.
export default function ApprovalPage() {
  const { token } = useParams();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['approval-link', token],
    queryFn: () => fetchApprovalLink(token),
    retry: false,
  });
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerEmail, setReviewerEmail] = useState('');
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState(null);

  const submitMut = useMutation({
    mutationFn: (decision) => submitApprovalDecision(token, {
      decision,
      reviewerName: reviewerName.trim(),
      reviewerEmail: reviewerEmail.trim() || null,
      note: note.trim() || null,
    }),
    onSuccess: (_data, decision) => {
      setFeedback({ kind: 'success', decision });
      refetch();
    },
    onError: (err) => setFeedback({ kind: 'error', message: err.response?.data?.error || err.message }),
  });

  if (isLoading) return <Wrap><p className="text-sm text-slate-500">Loading…</p></Wrap>;
  if (isError) {
    const status = error?.response?.status;
    return (
      <Wrap>
        <p className="font-semibold text-slate-900 mb-1">Link unavailable</p>
        <p className="text-sm text-slate-500">
          {status === 410 ? 'This approval link has expired.'
           : status === 404 ? 'This approval link is not valid. It may have been revoked.'
           : 'Something went wrong loading this link.'}
        </p>
      </Wrap>
    );
  }
  if (!data) return null;

  const { post } = data;
  const alreadyDecided = !!data.decision;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Review this post</h1>
            <p className="text-xs text-slate-500">Approve or send back with a note — no login required.</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* Decision state — banners if already approved / rejected */}
        {alreadyDecided && (
          <div className={`rounded-xl border p-4 ${
            data.decision === 'approved'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}>
            <p className="font-semibold flex items-center gap-2">
              {data.decision === 'approved' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {data.decision === 'approved' ? 'Approved' : 'Sent back for changes'}
            </p>
            <p className="text-xs mt-1">
              {data.reviewerName} · {data.decidedAt ? format(parseISO(data.decidedAt), 'MMM d, yyyy HH:mm') : ''}
              {data.decisionNote ? ` — "${data.decisionNote}"` : ''}
            </p>
          </div>
        )}

        {/* Post preview */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {post.title && (
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{post.title}</p>
          )}
          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{post.content || '(no caption)'}</p>

          {post.media && post.media.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {post.media.map(m => (
                <div key={m.id} className="aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                  {(m.mimeType || '').startsWith('video/') ? (
                    m.thumbnailUrl
                      ? <img src={m.thumbnailUrl} alt={m.originalName} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-slate-400" /></div>
                  ) : (
                    <img src={m.thumbnailUrl || m.url} alt={m.originalName} className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          )}

          {post.scheduledAt && (
            <p className="text-xs text-slate-500 mt-4 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Scheduled for {format(parseISO(post.scheduledAt), 'MMM d, yyyy HH:mm')}
            </p>
          )}

          {post.targets && post.targets.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Will publish to</p>
              <div className="flex flex-wrap gap-2">
                {post.targets.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {t.profilePictureUrl && <img src={t.profilePictureUrl} alt="" className="w-4 h-4 rounded-full" />}
                    {t.accountName} <span className="text-slate-400">· {t.platform.replace('_', ' ')}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Decision form — hidden once a decision has been recorded */}
        {!alreadyDecided && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Your decision</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Your name *</label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={e => setReviewerName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={reviewerEmail}
                  onChange={e => setReviewerEmail(e.target.value)}
                  placeholder="jane@brand.com"
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Note (optional)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Looks great. Please ship after 10am SAST."
                rows={3}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
              />
            </div>
            {feedback?.kind === 'error' && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-2">{feedback.message}</p>
            )}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => submitMut.mutate('approved')}
                disabled={!reviewerName.trim() || submitMut.isPending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </button>
              <button
                onClick={() => submitMut.mutate('rejected')}
                disabled={!reviewerName.trim() || submitMut.isPending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Send back
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-slate-400 py-6">
        powered by <a className="text-blue-600 hover:underline" href="/">Scheduly</a>
      </footer>
    </div>
  );
}

function Wrap({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-sm w-full text-center">
        {children}
      </div>
    </div>
  );
}
