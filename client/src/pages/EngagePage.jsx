import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Search, Inbox, MessageSquare, AtSign, Hash, Send, RefreshCw, Clock,
  CheckCircle, ChevronDown, MoreHorizontal, X,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  listThreads, getThreadCounts, getThread, markThreadRead, setThreadStatus,
  assignThread, replyToThread, addThreadNote, deleteThreadNote, refreshEngageInbox,
} from '../api/engageApi';
import { listUsers } from '../api/usersApi';
import { useAuth } from '../context/AuthContext';
import { useClientScope } from '../context/ClientContext';
import { getPlatform } from '../utils/platforms';
import { SENTIMENT_STYLES } from '../utils/sentiment';

const FEEDS = [
  { key: 'all',             label: 'All feeds',       icon: Inbox },
  { key: 'unread',          label: 'Unread',          icon: MessageSquare },
  { key: 'assigned_to_me',  label: 'My assignments',  icon: AtSign },
  { key: 'open',            label: 'Open',            icon: Hash },
  { key: 'snoozed',         label: 'Snoozed',         icon: Clock },
  { key: 'closed',          label: 'Closed',          icon: CheckCircle },
];

export default function EngagePage() {
  const { user, hasRole } = useAuth();
  const { activeClientId } = useClientScope();
  const queryClient = useQueryClient();
  const canReply  = hasRole('admin', 'manager', 'editor');
  const canAssign = hasRole('admin', 'manager');

  const [feed, setFeed] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const { data: counts } = useQuery({
    queryKey: ['engage-counts', activeClientId],
    queryFn: () => getThreadCounts({ clientId: activeClientId || undefined }),
    refetchInterval: 30000,
  });

  const { data: threads = [], isLoading: threadsLoading, refetch: refetchThreads } = useQuery({
    queryKey: ['engage-threads', feed, activeClientId, search],
    queryFn: () => listThreads({
      feed,
      clientId: activeClientId || undefined,
      search: search || undefined,
    }),
    refetchInterval: 30000,
  });

  const { data: thread } = useQuery({
    queryKey: ['engage-thread', selectedId],
    queryFn: () => getThread(selectedId),
    enabled: !!selectedId,
  });

  // Open the first thread automatically when the list loads, so the right
  // pane isn't empty on the first visit.
  useMemo(() => {
    if (!selectedId && threads.length > 0) setSelectedId(threads[0].id);
  }, [threads, selectedId]);

  const markReadMut = useMutation({
    mutationFn: markThreadRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engage-threads'] });
      queryClient.invalidateQueries({ queryKey: ['engage-counts'] });
    },
  });

  const refreshMut = useMutation({
    mutationFn: refreshEngageInbox,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engage-threads'] });
      queryClient.invalidateQueries({ queryKey: ['engage-counts'] });
      toast.success('Inbox refreshed');
    },
    onError: (err) => {
      const retry = err.response?.data?.retryAfterSeconds;
      toast.error(retry
        ? `Just refreshed — try again in ${retry}s`
        : (err.response?.data?.error || 'Refresh failed'));
    },
  });

  // Marking-read fires automatically when a thread is selected and it has unread items.
  const selectThread = (t) => {
    setSelectedId(t.id);
    if (t.unreadCount > 0) markReadMut.mutate(t.id);
  };

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[600px] bg-white border border-slate-200 rounded-xl overflow-hidden">
      <SidebarFeeds feed={feed} setFeed={setFeed} counts={counts || {}} />

      <ThreadList
        threads={threads}
        loading={threadsLoading}
        selectedId={selectedId}
        onSelect={selectThread}
        onRefresh={() => refreshMut.mutate()}
        refreshing={refreshMut.isPending}
        feed={feed}
        search={search}
        setSearch={setSearch}
      />

      <ConversationPane
        thread={thread}
        canReply={canReply}
        onReply={(body) => {
          if (!selectedId) return;
          return replyToThread(selectedId, body).then(() => {
            queryClient.invalidateQueries({ queryKey: ['engage-thread', selectedId] });
            queryClient.invalidateQueries({ queryKey: ['engage-threads'] });
            toast.success('Reply queued');
          }, (err) => toast.error(err.response?.data?.error || 'Reply failed'));
        }}
      />

      <DetailsPanel
        thread={thread}
        currentUserId={user?.id}
        canAssign={canAssign}
        onAssign={(uid) => {
          if (!selectedId) return;
          return assignThread(selectedId, uid).then(() => {
            queryClient.invalidateQueries({ queryKey: ['engage-thread', selectedId] });
            queryClient.invalidateQueries({ queryKey: ['engage-threads'] });
            toast.success(uid ? 'Assigned' : 'Unassigned');
          });
        }}
        onStatus={(status) => {
          if (!selectedId) return;
          return setThreadStatus(selectedId, status).then(() => {
            queryClient.invalidateQueries({ queryKey: ['engage-thread', selectedId] });
            queryClient.invalidateQueries({ queryKey: ['engage-threads'] });
            queryClient.invalidateQueries({ queryKey: ['engage-counts'] });
          });
        }}
        onAddNote={(body) => {
          if (!selectedId) return;
          return addThreadNote(selectedId, body).then(() => {
            queryClient.invalidateQueries({ queryKey: ['engage-thread', selectedId] });
            toast.success('Note added');
          });
        }}
        onDeleteNote={(noteId) => {
          return deleteThreadNote(noteId).then(() => {
            queryClient.invalidateQueries({ queryKey: ['engage-thread', selectedId] });
          });
        }}
      />
    </div>
  );
}

// ── Left rail: Feeds ──────────────────────────────────────────────────────────

function SidebarFeeds({ feed, setFeed, counts }) {
  return (
    <aside className="w-56 border-r border-slate-200 bg-slate-50/40 px-3 py-4 flex-shrink-0 overflow-y-auto">
      <div className="flex items-center justify-between mb-3 px-2">
        <h2 className="text-base font-bold text-slate-900">Engage</h2>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Live</span>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 mb-1">Feeds</p>
      <nav className="space-y-0.5 mb-6">
        {FEEDS.map(f => {
          const count =
            f.key === 'all' ? counts.all
            : f.key === 'unread' ? counts.unread
            : f.key === 'assigned_to_me' ? counts.assignedToMe
            : f.key === 'open' ? counts.open
            : f.key === 'snoozed' ? counts.snoozed
            : f.key === 'closed' ? counts.closed
            : 0;
          return (
            <button
              key={f.key}
              onClick={() => setFeed(f.key)}
              className={clsx(
                'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm',
                feed === f.key ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-white'
              )}
            >
              <span className="flex items-center gap-2">
                <f.icon className="w-3.5 h-3.5" />
                {f.label}
              </span>
              {count > 0 && (
                <span className={clsx(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                  feed === f.key ? 'bg-blue-200 text-blue-800' : 'text-slate-500 bg-slate-100'
                )}>
                  {formatCount(count)}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ── Middle: Thread list ──────────────────────────────────────────────────────

function ThreadList({ threads, loading, selectedId, onSelect, onRefresh, refreshing, feed, search, setSearch }) {
  return (
    <div className="w-[360px] border-r border-slate-200 flex flex-col flex-shrink-0">
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 capitalize">{feed.replace(/_/g, ' ')}</h3>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Message feed</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-50"
          title="Pull new comments and DMs from the platforms"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
        </button>
      </div>
      <div className="px-3 py-2 border-b border-slate-100 bg-white">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search messages..."
            className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading…</div>
        ) : threads.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-500">Nothing here yet</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Comments and DMs land here once ingestion runs. The first ingest fires within minutes of a new platform event.
            </p>
          </div>
        ) : (
          threads.map(t => (
            <ThreadRow key={t.id} thread={t} selected={t.id === selectedId} onClick={() => onSelect(t)} />
          ))
        )}
      </div>
    </div>
  );
}

function ThreadRow({ thread, selected, onClick }) {
  const p = getPlatform(thread.platform);
  const Icon = p?.icon;
  const sentimentStyle = thread.sentiment ? SENTIMENT_STYLES[thread.sentiment] : null;
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition',
        selected && 'bg-blue-50/40'
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-slate-200" />
            {Icon && (
              <div className={clsx('absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border border-white', p.bg)}>
                <Icon className="w-2 h-2 text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">
              {thread.participantName || thread.participantHandle || `@${thread.participantId}`}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              {sourceLabel(thread)} to {thread.accountName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[10px] text-slate-400">{thread.lastMessageAt ? formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: false }) : ''}</span>
          {thread.unreadCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
        </div>
      </div>
      {thread.lastMessagePreview && (
        <p className="text-xs text-slate-700 line-clamp-3 ml-10">{thread.lastMessagePreview}</p>
      )}
      {sentimentStyle && (
        <div className="ml-10 mt-1.5">
          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide', sentimentStyle.bg, sentimentStyle.text)}>
            {sentimentStyle.label}
          </span>
        </div>
      )}
    </button>
  );
}

// ── Middle/right: Conversation pane ──────────────────────────────────────────

function ConversationPane({ thread, canReply, onReply }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  if (!thread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-300 px-8 text-center">
        <Inbox className="w-12 h-12 mb-3" />
        <p className="text-sm text-slate-500 font-medium">Select a conversation to open it</p>
      </div>
    );
  }
  const p = getPlatform(thread.platform);
  const Icon = p?.icon;

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await onReply(draft.trim());
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2">
        {Icon && (
          <span className={clsx('w-5 h-5 rounded flex items-center justify-center text-white', p.bg)}>
            <Icon className="w-2.5 h-2.5" />
          </span>
        )}
        <h3 className="text-sm font-semibold text-slate-900 truncate">
          {sourceLabel(thread)} from {thread.participantName || thread.participantHandle || `@${thread.participantId}`}
          {' '}on {thread.accountName}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 bg-slate-50/30 space-y-4">
        {(thread.messages || []).length === 0 ? (
          <div className="text-center text-xs text-slate-400 pt-8">No messages in this thread yet.</div>
        ) : (
          thread.messages.map(m => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      {canReply && (
        <div className="border-t border-slate-200 p-3 bg-white">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a reply…"
              rows={2}
              className="flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? 'Sending…' : 'Reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }) {
  const isOut = message.direction === 'outgoing';
  return (
    <div className={clsx('flex gap-2', isOut ? 'justify-end' : 'justify-start')}>
      {!isOut && <div className="w-6 h-6 rounded-full bg-slate-200 flex-shrink-0 mt-1" />}
      <div className={clsx('max-w-[70%] rounded-2xl px-3 py-2', isOut ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-800')}>
        {!isOut && (message.authorHandle || message.authorName) && (
          <p className="text-[10px] font-semibold mb-0.5 text-slate-500">
            {message.authorName || message.authorHandle}
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
        <p className={clsx('text-[10px] mt-1', isOut ? 'text-blue-100' : 'text-slate-400')}>
          {message.sentAt ? format(new Date(message.sentAt), 'MMM d, HH:mm') : ''}
          {message.errorMessage && <span className="ml-2 text-rose-300">· {message.errorMessage}</span>}
        </p>
      </div>
    </div>
  );
}

// ── Right: Conversation details panel ────────────────────────────────────────

function DetailsPanel({ thread, currentUserId, canAssign, onAssign, onStatus, onAddNote, onDeleteNote }) {
  const { data: teamUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    staleTime: 60000,
  });
  const [noteDraft, setNoteDraft] = useState('');

  if (!thread) {
    return <aside className="w-80 border-l border-slate-200 bg-slate-50/30 flex-shrink-0" />;
  }

  return (
    <aside className="w-80 border-l border-slate-200 bg-slate-50/30 flex-shrink-0 overflow-y-auto p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">Conversation details</h3>

      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3">
        <p className="text-xs font-semibold text-slate-900">{thread.participantName || thread.participantHandle || `@${thread.participantId}`}</p>
        {thread.participantHandle && (
          <p className="text-[11px] text-slate-500">@{thread.participantHandle}</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-[11px]">
          <span className="text-slate-500">Account</span>
          <span className="text-slate-800 text-right">{thread.accountName}</span>
          <span className="text-slate-500">Source</span>
          <span className="text-slate-800 text-right capitalize">{thread.sourceType}</span>
          <span className="text-slate-500">First seen</span>
          <span className="text-slate-800 text-right">{thread.createdAt ? format(new Date(thread.createdAt), 'MMM d, HH:mm') : '—'}</span>
          <span className="text-slate-500">Last activity</span>
          <span className="text-slate-800 text-right">{thread.lastMessageAt ? format(new Date(thread.lastMessageAt), 'MMM d, HH:mm') : '—'}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Status</p>
        <select
          value={thread.status}
          onChange={(e) => onStatus(e.target.value)}
          className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 bg-white"
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="snoozed">Snoozed</option>
        </select>
      </div>

      {canAssign && (
        <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Assigned to</p>
          <select
            value={thread.assignedTo || ''}
            onChange={(e) => onAssign(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 bg-white"
          >
            <option value="">Unassigned</option>
            {teamUsers.map(u => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}{u.id === currentUserId ? ' (me)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Notes</p>
        <div className="space-y-2 mb-2">
          {(thread.notes || []).length === 0 && (
            <p className="text-[11px] text-slate-400 italic">No notes yet.</p>
          )}
          {(thread.notes || []).map(n => (
            <div key={n.id} className="text-xs bg-amber-50 border border-amber-100 rounded p-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-medium text-amber-900">{n.userName}</span>
                <button onClick={() => onDeleteNote(n.id)} className="text-amber-700 hover:text-rose-600 text-[10px]" title="Delete">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <p className="text-amber-900 whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
        </div>
        <textarea
          value={noteDraft}
          onChange={e => setNoteDraft(e.target.value)}
          placeholder="Add an internal note…"
          rows={2}
          className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 resize-y outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => {
            if (!noteDraft.trim()) return;
            onAddNote(noteDraft.trim()).then(() => setNoteDraft(''));
          }}
          disabled={!noteDraft.trim()}
          className="mt-1.5 w-full text-xs font-medium text-amber-900 bg-amber-100 hover:bg-amber-200 rounded py-1.5 disabled:opacity-50"
        >
          Add note
        </button>
      </div>
    </aside>
  );
}

function sourceLabel(thread) {
  if (thread.sourceType === 'dm') return 'DM';
  if (thread.sourceType === 'comment') return 'Comment';
  if (thread.sourceType === 'mention') return 'Mention';
  return thread.sourceType;
}

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
