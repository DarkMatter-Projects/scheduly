import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPost, schedulePost } from '../api/postsApi';
import { listMedia, uploadMedia } from '../api/mediaApi';
import { listAccounts } from '../api/socialApi';
import { listClients } from '../api/clientsApi';
import { useAuth } from '../context/AuthContext';
import { useClientScope } from '../context/ClientContext';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import {
  X, Upload, Film, Clock, ChevronDown, ChevronUp, Trash2, Image as ImageIcon,
  Smile, Hash, Sparkles, Zap, Edit3, FileText, Settings2,
  ArrowLeftRight, MessageSquare, AlertTriangle, Check, Users,
} from 'lucide-react';
import { FacebookIcon, InstagramIcon } from '../components/common/SocialIcons';
import { getPlatform } from '../utils/platforms';
import clsx from 'clsx';
import { format } from 'date-fns';

const IG_LIMIT = 2200;
const FB_LIMIT = 63206;

function localNow() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function ProfilePicker({ accounts, clients, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Group accounts by client, in client-list order, with unassigned last
  const groups = useMemo(() => {
    const byId = new Map();
    for (const c of clients) byId.set(c.id, { client: c, accounts: [] });
    const unassigned = [];
    for (const a of accounts) {
      if (a.clientId && byId.has(a.clientId)) byId.get(a.clientId).accounts.push(a);
      else unassigned.push(a);
    }
    const ordered = [...byId.values()].filter(g => g.accounts.length > 0);
    if (unassigned.length > 0) ordered.push({ client: null, accounts: unassigned });
    return ordered;
  }, [accounts, clients]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedAccounts = accounts.filter(a => selectedSet.has(a.id));

  const toggle = (id) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };

  const toggleGroup = (groupAccounts) => {
    const ids = groupAccounts.map(a => a.id);
    const allSelected = ids.every(id => selectedSet.has(id));
    const next = new Set(selectedSet);
    if (allSelected) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    onChange([...next]);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOpen(!open)}
          className="relative flex items-center gap-2 pl-3 pr-3 py-1.5 bg-white border border-slate-300 rounded-full hover:bg-slate-50 transition"
        >
          <span className="text-sm font-medium text-slate-700">Select Profiles</span>
          {selectedAccounts.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-orange-500 text-white text-[11px] font-bold leading-none">
              {selectedAccounts.length}
            </span>
          )}
          <ChevronDown className={clsx('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
        </button>

        {selectedAccounts.slice(0, 6).map(a => {
          const p = getPlatform(a.platform);
          const PIcon = p.icon;
          return (
            <div key={a.id} className="relative" title={`${a.accountName} (${p.label})`}>
              {a.profilePictureUrl ? (
                <img src={a.profilePictureUrl} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm" />
              ) : (
                <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center text-white ring-2 ring-white shadow-sm', p.bg)}>
                  <PIcon className="w-4 h-4" />
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center border-2 border-white">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          );
        })}
        {selectedAccounts.length > 6 && (
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-semibold text-slate-600 ring-2 ring-white shadow-sm">
            +{selectedAccounts.length - 6}
          </div>
        )}
      </div>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-80 max-h-[70vh] bg-white rounded-xl shadow-xl border border-slate-200 z-50 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Select profiles</h3>
            <span className="text-[11px] text-slate-500">{selected.length} of {accounts.length} selected</span>
          </div>

          {accounts.length === 0 ? (
            <p className="p-6 text-sm text-slate-500 text-center">No connected accounts. Go to Accounts to connect one.</p>
          ) : (
            <div className="overflow-y-auto">
              {groups.map((group) => {
                const groupIds = group.accounts.map(a => a.id);
                const allSelected = groupIds.every(id => selectedSet.has(id));
                return (
                  <div key={group.client?.id || 'unassigned'}>
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-y border-slate-100 sticky top-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: group.client?.color || '#94a3b8' }}
                        />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 truncate">
                          {group.client?.name || 'No client'}
                        </span>
                        <span className="text-[10px] text-slate-400">({group.accounts.length})</span>
                      </div>
                      <button
                        onClick={() => toggleGroup(group.accounts)}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex-shrink-0"
                      >
                        {allSelected ? 'Clear' : 'Select all'}
                      </button>
                    </div>
                    {group.accounts.map(account => {
                      const isSel = selectedSet.has(account.id);
                      const p = getPlatform(account.platform);
                      const PIcon = p.icon;
                      return (
                        <button
                          key={account.id}
                          onClick={() => toggle(account.id)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition text-left',
                            isSel && 'bg-blue-50/40'
                          )}
                        >
                          <div className="relative flex-shrink-0">
                            {account.profilePictureUrl ? (
                              <img src={account.profilePictureUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                              <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center text-white', p.bg)}>
                                <PIcon className="w-4 h-4" />
                              </div>
                            )}
                            <div className={clsx('absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white', p.bg)}>
                              <PIcon className="w-2 h-2 text-white" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{account.accountName}</p>
                            <p className="text-[11px] text-slate-500">{p.label}</p>
                          </div>
                          <div className={clsx(
                            'w-5 h-5 rounded-md border-2 flex items-center justify-center transition flex-shrink-0',
                            isSel ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                          )}>
                            {isSel && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          <div className="px-3 py-2 border-t border-slate-100 bg-white flex items-center justify-between">
            <button
              onClick={() => onChange([])}
              disabled={selected.length === 0}
              className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40"
            >
              Clear all
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MediaLibraryModal({ onSelect, onClose }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const { data, isLoading } = useQuery({
    queryKey: ['media', 1, ''],
    queryFn: () => listMedia({ page: 1, limit: 48 }),
  });
  const items = data?.data || [];
  const toggle = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Select Media</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-center text-slate-400 py-8">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No media files. Upload some first!</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {items.map(item => {
                const isVideo = item.mimeType.startsWith('video/');
                const selected = selectedIds.includes(item.id);
                return (
                  <div key={item.id} onClick={() => toggle(item.id)}
                    className={clsx('relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2', selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent hover:border-slate-300')}>
                    {isVideo ? <div className="w-full h-full bg-slate-200 flex items-center justify-center"><Film className="w-6 h-6 text-slate-400" /></div>
                      : <img src={item.thumbnailUrl || item.url} alt="" className="w-full h-full object-cover" />}
                    {selected && <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center"><span className="text-white text-xs font-bold">{selectedIds.indexOf(item.id) + 1}</span></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between p-4 border-t border-slate-200">
          <span className="text-sm text-slate-500">{selectedIds.length} selected</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
            <button onClick={() => { onSelect(items.filter(i => selectedIds.includes(i.id))); onClose(); }}
              disabled={!selectedIds.length} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">Attach</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PostCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachedMedia, setAttachedMedia] = useState([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [autoPublish, setAutoPublish] = useState(true);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    d.setSeconds(0);
    return d.toISOString().slice(0, 16);
  });
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const textareaRef = useRef(null);
  const emojiRef = useRef(null);

  useEffect(() => {
    function handler(e) { if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false); }
    if (showEmoji) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [showEmoji]);

  const { activeClientId } = useClientScope();
  const { data: socialAccounts = [] } = useQuery({
    queryKey: ['socialAccounts'],
    queryFn: listAccounts,
  });
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: listClients,
  });
  // When a client workspace is active, only let users target that client's accounts.
  const activeAccounts = useMemo(() => {
    const live = socialAccounts.filter(a => a.isActive);
    return activeClientId ? live.filter(a => a.clientId === activeClientId) : live;
  }, [socialAccounts, activeClientId]);

  // When entering with a client active and no selection yet, default to all of that client's accounts.
  useEffect(() => {
    if (!activeClientId) return;
    if (selectedAccountIds.length > 0) return;
    if (activeAccounts.length === 0) return;
    setSelectedAccountIds(activeAccounts.map(a => a.id));
  }, [activeClientId, activeAccounts, selectedAccountIds.length]);

  const createMutation = useMutation({
    mutationFn: createPost,
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create post'),
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ id, scheduledAt }) => schedulePost(id, scheduledAt),
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to schedule'),
  });

  const uploadMutation = useMutation({
    mutationFn: uploadMedia,
    onSuccess: (uploaded) => {
      queryClient.invalidateQueries({ queryKey: ['media'] });
      setAttachedMedia(prev => [...prev, ...uploaded]);
      toast.success('Files uploaded');
    },
    onError: () => toast.error('Upload failed'),
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => uploadMutation.mutate(files),
    accept: {
      'image/jpeg': [], 'image/png': [], 'image/gif': [], 'image/webp': [],
      'video/mp4': [], 'video/quicktime': [],
    },
    noClick: true, noKeyboard: true,
  });

  const insertAtCursor = (text) => {
    const textarea = textareaRef.current;
    if (!textarea) { setContent(content + text); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = content.substring(0, start) + text + content.substring(end);
    setContent(newValue);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }, 0);
  };

  const handleSchedule = async () => {
    if (!content.trim()) { toast.error('Caption is required'); return; }
    if (selectedAccountIds.length === 0) { toast.error('Select at least one profile to publish to'); return; }

    try {
      const post = await createMutation.mutateAsync({
        title: title || undefined,
        content,
        mediaIds: attachedMedia.map(m => m.id),
        targetAccountIds: selectedAccountIds,
      });

      if (autoPublish) {
        const scheduledAt = new Date(scheduleDate).toISOString();
        await scheduleMutation.mutateAsync({ id: post.id, scheduledAt });
        toast.success(`Scheduled to ${selectedAccountIds.length} profile${selectedAccountIds.length === 1 ? '' : 's'}`);
      } else {
        toast.success('Post saved as draft');
      }

      queryClient.invalidateQueries({ queryKey: ['posts'] });
      navigate(`/posts/${post.id}`);
    } catch (err) {
      // already handled
    }
  };

  const handleSaveDraft = async () => {
    if (!content.trim()) { toast.error('Caption is required'); return; }
    try {
      const post = await createMutation.mutateAsync({
        title: title || undefined,
        content,
        mediaIds: attachedMedia.map(m => m.id),
        targetAccountIds: selectedAccountIds,
      });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Saved as draft');
      navigate(`/posts/${post.id}`);
    } catch (err) {}
  };

  const handleRemoveMedia = (id) => {
    setAttachedMedia(prev => prev.filter(m => m.id !== id));
  };

  const firstMedia = attachedMedia[0];
  const isVideo = firstMedia?.mimeType?.startsWith('video/');
  const charCount = content.length;
  const selectedAccounts = activeAccounts.filter(a => selectedAccountIds.includes(a.id));
  // Use the strictest applicable limit (Instagram) when any selected target is IG
  const anyIG = selectedAccounts.some(a => a.platform === 'instagram_business');
  const limit = anyIG || selectedAccounts.length === 0 ? IG_LIMIT : FB_LIMIT;
  const overLimit = charCount > limit;

  const isPending = createMutation.isPending || scheduleMutation.isPending;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[600px]" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0 gap-4 flex-wrap">
        <ProfilePicker accounts={activeAccounts} clients={clients} selected={selectedAccountIds} onChange={setSelectedAccountIds} />

        <div className="flex items-center gap-3 flex-1 justify-center min-w-[300px]">
          <Zap className={clsx('w-4 h-4', autoPublish ? 'text-violet-600' : 'text-slate-300')} />
          <button
            onClick={() => setAutoPublish(!autoPublish)}
            className={clsx(
              'text-sm font-medium px-2 py-0.5 rounded transition',
              autoPublish ? 'text-slate-900' : 'text-slate-400'
            )}
          >
            Auto Publish {autoPublish ? 'on' : 'off'}
          </button>
          <div className="relative flex items-center gap-1.5">
            <div className="relative">
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                min={localNow()}
                className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-medium text-slate-700 cursor-pointer"
              />
              <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
            <button
              type="button"
              onClick={() => setScheduleDate(localNow())}
              className="px-2 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
              title="Set to current date and time"
            >
              Now
            </button>
          </div>
        </div>

        <button className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50" title="Notes">
          <MessageSquare className="w-4 h-4" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 p-6">
          {/* Left: Media */}
          <div className="md:col-span-2 space-y-3">
            {attachedMedia.length === 0 ? (
              <div
                onClick={() => setShowMediaPicker(true)}
                className={clsx(
                  'aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition',
                  isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                )}
              >
                <ImageIcon className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-600">Add media</p>
                <p className="text-xs text-slate-400 mt-1">Click to browse or drag & drop</p>
              </div>
            ) : (
              <>
                <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group">
                  {isVideo ? (
                    <video src={firstMedia.url} controls className="w-full h-full object-cover" />
                  ) : (
                    <img src={firstMedia.url} alt="" className="w-full h-full object-cover" />
                  )}
                  {attachedMedia.length > 1 && (
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-xs font-medium px-2 py-1 rounded-full">
                      +{attachedMedia.length - 1}
                    </div>
                  )}
                </div>

                {/* Thumbnail strip for multiple */}
                {attachedMedia.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {attachedMedia.map((m, idx) => (
                      <div key={m.id} className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 group border border-slate-200">
                        {m.mimeType?.startsWith('video/') ? (
                          <div className="w-full h-full bg-slate-200 flex items-center justify-center"><Film className="w-5 h-5 text-slate-400" /></div>
                        ) : (
                          <img src={m.thumbnailUrl || m.url} alt="" className="w-full h-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveMedia(m.id)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="space-y-2">
                  <button
                    onClick={() => toast('Alt text coming soon', { icon: 'ℹ️' })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                  >
                    <FileText className="w-4 h-4 text-slate-400" />
                    Add Alt Text
                  </button>
                  <button
                    onClick={() => { setAttachedMedia([]); setShowMediaPicker(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-slate-400" />
                    Change Media
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right: Caption & options */}
          <div className="md:col-span-3 space-y-4">
            {/* Post Type */}
            <div className="flex items-center gap-3">
              <Settings2 className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-600">Post Type:</span>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700">
                Page Post
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
            </div>

            {/* Caption */}
            <div className="flex items-start gap-3">
              <MessageSquare className="w-4 h-4 text-slate-400 mt-2.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="bg-slate-50 rounded-xl border border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition">
                  <div className="px-4 pt-3 text-xs font-medium text-slate-500">Post Caption</div>
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Write your caption..."
                    rows={6}
                    className="w-full px-4 py-2 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none resize-y border-none"
                    style={{ minHeight: '140px' }}
                  />
                  <div className="px-4 py-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => toast('AI caption suggestions coming soon', { icon: '✨' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-200 text-xs font-medium text-violet-700 hover:bg-violet-50 transition"
                    >
                      <Sparkles className="w-3 h-3" />
                      Improve this caption
                    </button>
                    <span className={clsx('text-[11px] font-medium', overLimit ? 'text-red-500' : 'text-slate-400')}>
                      {charCount.toLocaleString()}/{limit.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Caption tools */}
                <div className="flex items-center gap-4 mt-2 relative">
                  <button
                    type="button"
                    onClick={() => setShowEmoji(!showEmoji)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition"
                  >
                    <Smile className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toast('Saved captions coming soon', { icon: '📌' })}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Saved Captions
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAtCursor('#')}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition"
                  >
                    <Hash className="w-3.5 h-3.5" />
                    Hashtag Suggestions
                  </button>

                  {showEmoji && (
                    <div ref={emojiRef} className="absolute top-full left-0 mt-1 z-50 shadow-2xl rounded-lg overflow-hidden border border-slate-200">
                      <EmojiPicker
                        onEmojiClick={(e) => insertAtCursor(e.emoji)}
                        emojiStyle={EmojiStyle.NATIVE}
                        theme={Theme.LIGHT}
                        width={320}
                        height={400}
                        searchPlaceholder="Search emoji..."
                        previewConfig={{ showPreview: false }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Internal title */}
            <details className="pt-2">
              <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700">
                More Options
              </summary>
              <div className="mt-3 space-y-3 pl-1">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Internal title (optional)</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Only visible to your team"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-white flex-shrink-0 flex-wrap gap-3">
        <button
          onClick={() => { if (confirm('Discard this post?')) navigate(-1); }}
          className="p-2 rounded-full border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition"
          title="Discard"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 ml-auto">
          {activeAccounts.length === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="w-3.5 h-3.5" />
              No accounts connected
            </div>
          )}

          <button
            onClick={handleSaveDraft}
            disabled={isPending || !content.trim()}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition disabled:opacity-50"
          >
            Save as Draft
          </button>

          <button
            onClick={handleSchedule}
            disabled={isPending || !content.trim() || selectedAccountIds.length === 0}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-full shadow-lg shadow-violet-600/20 transition disabled:opacity-50"
          >
            <Clock className="w-4 h-4" />
            {isPending ? 'Scheduling...' : selectedAccountIds.length > 1 ? `Schedule to ${selectedAccountIds.length}` : 'Schedule Post'}
          </button>
        </div>
      </div>

      {showMediaPicker && (
        <MediaLibraryModal
          onSelect={(items) => {
            const existing = new Set(attachedMedia.map(m => m.id));
            setAttachedMedia(prev => [...prev, ...items.filter(i => !existing.has(i.id))]);
          }}
          onClose={() => setShowMediaPicker(false)}
        />
      )}
    </div>
  );
}
