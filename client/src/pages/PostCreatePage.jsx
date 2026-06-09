import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPost, schedulePost, generateCaption, searchPlaces } from '../api/postsApi';
import { listMedia, uploadMedia } from '../api/mediaApi';
import { listAccounts, getYoutubeQuota, searchInstagramProducts } from '../api/socialApi';
import { listClients } from '../api/clientsApi';
import { useAuth } from '../context/AuthContext';
import { useClientScope } from '../context/ClientContext';
import { useDropzone } from 'react-dropzone';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import toast from 'react-hot-toast';
// Emoji picker is large (~300KB), so we lazy-load it.
const EmojiPicker = lazy(() => import('emoji-picker-react'));
import {
  X, Upload, Film, Clock, ChevronDown, ChevronUp, Trash2, Image as ImageIcon,
  Smile, Hash, Sparkles, Zap, Edit3, FileText, Settings2,
  ArrowLeftRight, MessageSquare, AlertTriangle, Check, Users,
} from 'lucide-react';
import { FacebookIcon, InstagramIcon } from '../components/common/SocialIcons';
import AccountAvatar from '../components/common/AccountAvatar';
import UploadProgressCard from '../components/common/UploadProgressCard';
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
          return (
            <div key={a.id} className="relative" title={`${a.accountName} (${p.label})`}>
              <AccountAvatar account={a} size={36} ringClass="ring-2 ring-white shadow-sm" />
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
                            <AccountAvatar account={account} size={36} />
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

function MediaLibraryModal({ onSelect, onClose, mimeFilter }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const { data, isLoading } = useQuery({
    queryKey: ['media', 1, ''],
    queryFn: () => listMedia({ page: 1, limit: 48 }),
  });
  // Optional client-side filter — used for the YouTube custom-thumbnail
  // picker so only images are selectable.
  const items = (data?.data || []).filter(m => !mimeFilter || (m.mimeType || '').startsWith(mimeFilter));
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
  const [tiktokPostMode, setTiktokPostMode] = useState('INBOX');
  const [tiktokPrivacyLevel, setTiktokPrivacyLevel] = useState('SELF_ONLY');
  const [tiktokDisableComment, setTiktokDisableComment] = useState(false);
  const [tiktokDisableDuet, setTiktokDisableDuet] = useState(false);
  const [tiktokDisableStitch, setTiktokDisableStitch] = useState(false);
  const [youtubePrivacy, setYoutubePrivacy] = useState('private');
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [youtubeMadeForKids, setYoutubeMadeForKids] = useState(false);
  const [youtubeIsShort, setYoutubeIsShort] = useState(false);
  // Geotag — display label plus optional platform-specific place IDs.
  // For FB Page posts the place ID is required; for X the place_id
  // is required. The label alone shows up in the composer preview but
  // doesn't actually publish a geotag (the platforms need an ID).
  const [geoLabel, setGeoLabel] = useState('');
  const [geoFacebookPlaceId, setGeoFacebookPlaceId] = useState('');
  const [geoTwitterPlaceId, setGeoTwitterPlaceId] = useState('');
  const [instagramFirstComment, setInstagramFirstComment] = useState('');
  // IG collaborators — comma-separated usernames at the form level,
  // split into an array before submission.
  const [instagramCollaboratorsInput, setInstagramCollaboratorsInput] = useState('');
  const [instagramPublishAsStory, setInstagramPublishAsStory] = useState(false);
  // Product tags — array of { id, name, imageUrl, x, y } picked from
  // the IG catalog. We always store x/y as centered 0.5 since the
  // composer doesn't yet have a drag-to-position UI.
  const [instagramProductTags, setInstagramProductTags] = useState([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  // LinkedIn-specific — article URL share. When set, the post body
  // becomes a link preview card instead of a text + media post.
  const [linkedinArticleUrl, setLinkedinArticleUrl] = useState('');
  // Custom video thumbnail — references a media row from the library.
  // Used by the YouTube publisher (and FB Page video if we extend it).
  const [customThumbnail, setCustomThumbnail] = useState(null);
  const [showThumbPicker, setShowThumbPicker] = useState(false);
  // AI caption modal state.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState('engaging');
  const aiMut = useMutation({
    mutationFn: () => generateCaption({
      prompt: aiPrompt,
      platforms: [...new Set(selectedAccounts.map(a => a.platform))],
      tone: aiTone,
    }),
    onSuccess: (data) => {
      setContent(data.caption);
      setAiOpen(false);
      setAiPrompt('');
      toast.success('Caption generated');
    },
    onError: (err) => {
      const detail = err.response?.data?.error || err.message;
      toast.error(`AI caption failed: ${detail}`);
    },
  });
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

  // Only fetch YouTube quota if the user even has a YouTube account connected.
  const hasYoutubeAccount = socialAccounts.some(a => a.platform === 'youtube' && a.isActive);
  const { data: youtubeQuota } = useQuery({
    queryKey: ['youtubeQuota'],
    queryFn: getYoutubeQuota,
    enabled: hasYoutubeAccount,
    refetchInterval: 60000,
    staleTime: 30000,
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

  const [uploadProgress, setUploadProgress] = useState({ state: 'idle' });

  const uploadMutation = useMutation({
    mutationFn: (files) => uploadMedia(files, {
      onProgress: ({ loaded, total, percent }) =>
        setUploadProgress({ state: 'uploading', percent, loaded, total, fileCount: files.length }),
    }),
    onSuccess: (uploaded) => {
      queryClient.invalidateQueries({ queryKey: ['media'] });
      setAttachedMedia(prev => [...prev, ...uploaded]);
      setUploadProgress({ state: 'success', fileCount: uploaded.length });
      // Auto-dismiss the success card after a moment.
      setTimeout(() => setUploadProgress({ state: 'idle' }), 2500);
      toast.success('Files uploaded');
    },
    onError: (err) => {
      setUploadProgress({
        state: 'error',
        errorMessage: err.response?.data?.error || err.message || 'Upload failed',
      });
      setTimeout(() => setUploadProgress({ state: 'idle' }), 5000);
      toast.error('Upload failed');
    },
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      if (files.length === 0) return;
      setUploadProgress({ state: 'uploading', percent: 0, loaded: 0, total: 0, fileCount: files.length });
      uploadMutation.mutate(files);
    },
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
        tiktokPostMode,
        tiktokPrivacyLevel,
        tiktokDisableComment,
        tiktokDisableDuet,
        tiktokDisableStitch,
        youtubePrivacy,
        youtubeTitle: youtubeTitle || undefined,
        youtubeIsShort,
        instagramFirstComment: instagramFirstComment || undefined,
        instagramPublishAsStory,
        instagramProductTags: instagramProductTags.length > 0 ? instagramProductTags : undefined,
        instagramCollaborators: instagramCollaboratorsInput
          ? instagramCollaboratorsInput
              .split(',')
              .map(s => s.trim().replace(/^@/, ''))
              .filter(Boolean)
              .slice(0, 20)
          : undefined,
        customThumbnailMediaId: customThumbnail?.id || undefined,
        linkedinArticleUrl: linkedinArticleUrl || undefined,
        geoLabel: geoLabel || undefined,
        geoFacebookPlaceId: geoFacebookPlaceId || undefined,
        geoTwitterPlaceId: geoTwitterPlaceId || undefined,
        youtubeMadeForKids,
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
        tiktokPostMode,
        tiktokPrivacyLevel,
        tiktokDisableComment,
        tiktokDisableDuet,
        tiktokDisableStitch,
        youtubePrivacy,
        youtubeTitle: youtubeTitle || undefined,
        youtubeIsShort,
        instagramFirstComment: instagramFirstComment || undefined,
        instagramPublishAsStory,
        instagramProductTags: instagramProductTags.length > 0 ? instagramProductTags : undefined,
        instagramCollaborators: instagramCollaboratorsInput
          ? instagramCollaboratorsInput
              .split(',')
              .map(s => s.trim().replace(/^@/, ''))
              .filter(Boolean)
              .slice(0, 20)
          : undefined,
        customThumbnailMediaId: customThumbnail?.id || undefined,
        linkedinArticleUrl: linkedinArticleUrl || undefined,
        geoLabel: geoLabel || undefined,
        geoFacebookPlaceId: geoFacebookPlaceId || undefined,
        geoTwitterPlaceId: geoTwitterPlaceId || undefined,
        youtubeMadeForKids,
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
  const hasTiktokTarget = selectedAccounts.some(a => a.platform === 'tiktok');
  const youtubeTargetCount = selectedAccounts.filter(a => a.platform === 'youtube').length;
  const instagramTargetCount = selectedAccounts.filter(a => a.platform === 'instagram_business').length;
  const facebookTargetCount  = selectedAccounts.filter(a => a.platform === 'facebook_page').length;
  const twitterTargetCount   = selectedAccounts.filter(a => a.platform === 'twitter').length;
  const linkedinTargetCount  = selectedAccounts.filter(a => a.platform === 'linkedin').length;
  const youtubeOverQuota = youtubeTargetCount > 0
    && youtubeQuota
    && youtubeQuota.uploadsRemaining < youtubeTargetCount;
  // YouTube only accepts video files — block schedule with a clear reason
  // if the user targeted a YouTube channel but attached only images.
  const youtubeMissingVideo = youtubeTargetCount > 0
    && attachedMedia.length > 0
    && !attachedMedia.some(m => (m.mimeType || '').startsWith('video/'));
  const youtubeMissingTitle = youtubeTargetCount > 0 && !youtubeTitle.trim();
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

                {/* Thumbnail strip for multiple — drag to reorder */}
                {attachedMedia.length > 1 && (
                  <CarouselThumbStrip
                    media={attachedMedia}
                    onReorder={(newOrder) => setAttachedMedia(newOrder)}
                    onRemove={handleRemoveMedia}
                  />
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
                  <div className="px-4 pt-3 text-xs font-medium text-slate-500">
                    {youtubeTargetCount > 0 && selectedAccounts.length === youtubeTargetCount
                      ? 'Video description'
                      : youtubeTargetCount > 0
                        ? 'Caption / Video description'
                        : 'Post Caption'}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder={youtubeTargetCount > 0 ? 'Description that appears under the YouTube video…' : 'Write your caption...'}
                    rows={6}
                    className="w-full px-4 py-2 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none resize-y border-none"
                    style={{ minHeight: '140px' }}
                  />
                  <div className="px-4 py-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => { setAiPrompt(content || ''); setAiOpen(true); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-200 text-xs font-medium text-violet-700 hover:bg-violet-50 transition"
                    >
                      <Sparkles className="w-3 h-3" />
                      Generate with AI
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
                      <Suspense fallback={<div className="w-[320px] h-[400px] bg-white flex items-center justify-center text-xs text-slate-400">Loading…</div>}>
                        <EmojiPicker
                          onEmojiClick={(e) => insertAtCursor(e.emoji)}
                          emojiStyle="native"
                          theme="light"
                          width={320}
                          height={400}
                          searchPlaceholder="Search emoji..."
                          previewConfig={{ showPreview: false }}
                        />
                      </Suspense>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* TikTok-specific options — only when a TikTok target is selected */}
            {hasTiktokTarget && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">TikTok options</h4>
                  <span className="text-[10px] text-slate-400">Applied to all TikTok targets</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Attach a single video for a regular post, or multiple photos for a slideshow post (TikTok auto-adds music). Mixing video and images in one post isn't allowed.
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Post mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTiktokPostMode('INBOX')}
                      className={clsx(
                        'px-3 py-2 text-xs font-medium rounded-lg border text-left',
                        tiktokPostMode === 'INBOX'
                          ? 'border-blue-300 bg-blue-50 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-700'
                      )}
                    >
                      <div className="font-semibold">Send to inbox</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">User finishes posting in the TikTok app</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTiktokPostMode('DIRECT_POST')}
                      className={clsx(
                        'px-3 py-2 text-xs font-medium rounded-lg border text-left',
                        tiktokPostMode === 'DIRECT_POST'
                          ? 'border-blue-300 bg-blue-50 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-700'
                      )}
                    >
                      <div className="font-semibold">Publish directly</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Scheduly posts it for you (needs app review)</div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Who can see this</label>
                  <select
                    value={tiktokPrivacyLevel}
                    onChange={e => setTiktokPrivacyLevel(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="SELF_ONLY">Only me (required for sandbox apps)</option>
                    <option value="MUTUAL_FOLLOW_FRIENDS">Mutual followers</option>
                    <option value="FOLLOWER_OF_CREATOR">Followers</option>
                    <option value="PUBLIC_TO_EVERYONE">Public</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Un-reviewed TikTok apps can only post privately — TikTok will reject anything else.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tiktokDisableComment}
                      onChange={e => setTiktokDisableComment(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Disable comments
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tiktokDisableDuet}
                      onChange={e => setTiktokDisableDuet(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Disable duet
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tiktokDisableStitch}
                      onChange={e => setTiktokDisableStitch(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Disable stitch
                  </label>
                </div>
              </div>
            )}

            {/* Location / geotag — only for FB Pages + X (the platforms
                whose API actually accepts a place tag). IG removed
                geotagging via Graph API in 2018, TikTok / LinkedIn / YT
                don't expose it at all. */}
            {(facebookTargetCount > 0 || twitterTargetCount > 0) && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                <h4 className="text-xs font-semibold text-emerald-900 uppercase tracking-wider">Location (optional)</h4>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Display label</label>
                  <input
                    type="text"
                    value={geoLabel}
                    onChange={(e) => setGeoLabel(e.target.value)}
                    placeholder="Cape Town, South Africa"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-emerald-200 focus:ring-2 focus:ring-emerald-400 outline-none"
                  />
                </div>
                {facebookTargetCount > 0 && (
                  <PlaceAutocomplete
                    platform="facebook_page"
                    label="Facebook place"
                    value={geoFacebookPlaceId}
                    onPick={(place) => {
                      setGeoFacebookPlaceId(place?.id || '');
                      if (place?.label && !geoLabel) setGeoLabel(place.label);
                    }}
                    onClear={() => setGeoFacebookPlaceId('')}
                    initialLabel={geoLabel}
                  />
                )}
                {twitterTargetCount > 0 && (
                  <PlaceAutocomplete
                    platform="twitter"
                    label="X place"
                    value={geoTwitterPlaceId}
                    onPick={(place) => {
                      setGeoTwitterPlaceId(place?.id || '');
                      if (place?.label && !geoLabel) setGeoLabel(place.label);
                    }}
                    onClear={() => setGeoTwitterPlaceId('')}
                    initialLabel={geoLabel}
                  />
                )}
              </div>
            )}

            {/* Instagram-specific options — only when an IG account is targeted */}
            {instagramTargetCount > 0 && (
              <div className="rounded-xl border border-pink-200 bg-pink-50/40 p-4 space-y-3">
                <h4 className="text-xs font-semibold text-pink-900 uppercase tracking-wider">Instagram options</h4>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Post type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInstagramPublishAsStory(false)}
                      className={clsx(
                        'px-3 py-2 text-xs font-medium rounded-lg border text-left',
                        !instagramPublishAsStory ? 'border-pink-300 bg-white text-pink-900' : 'border-slate-200 bg-white text-slate-700'
                      )}
                    >
                      <div className="font-semibold">Feed post</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Standard caption + media. Reels for single video.</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstagramPublishAsStory(true)}
                      className={clsx(
                        'px-3 py-2 text-xs font-medium rounded-lg border text-left',
                        instagramPublishAsStory ? 'border-pink-300 bg-white text-pink-900' : 'border-slate-200 bg-white text-slate-700'
                      )}
                    >
                      <div className="font-semibold">Story (24h)</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Single image or video. Caption / collaborators ignored.</div>
                    </button>
                  </div>
                  {instagramPublishAsStory && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2">
                      Stories publish only a single image or video. Caption, collaborators, and first comment don't apply.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    First comment <span className="text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    value={instagramFirstComment}
                    onChange={(e) => setInstagramFirstComment(e.target.value)}
                    placeholder="Drop the hashtag dump here so it doesn't clutter the caption…"
                    rows={3}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-pink-200 focus:ring-2 focus:ring-pink-400 outline-none resize-y"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Posted as a comment under the published Instagram post immediately after it goes live.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Collaborators <span className="text-slate-400">(optional, up to 20 usernames)</span>
                  </label>
                  <input
                    type="text"
                    value={instagramCollaboratorsInput}
                    onChange={(e) => setInstagramCollaboratorsInput(e.target.value)}
                    placeholder="@brandpartner, @influencer, @photographer"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-pink-200 focus:ring-2 focus:ring-pink-400 outline-none font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Comma-separated. Each invitee gets a notification and the post lands on their profile once they accept.
                  </p>
                </div>
                {!instagramPublishAsStory && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Product tags <span className="text-slate-400">(optional, up to 5 products)</span>
                    </label>
                    {instagramProductTags.length > 0 && (
                      <ul className="space-y-1 mb-2">
                        {instagramProductTags.map(p => (
                          <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 bg-white border border-pink-200 rounded-md">
                            {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-8 h-8 rounded object-cover" />}
                            <span className="text-xs flex-1 truncate text-slate-800">{p.name}</span>
                            <button
                              type="button"
                              onClick={() => setInstagramProductTags(prev => prev.filter(x => x.id !== p.id))}
                              className="text-rose-600 text-xs hover:underline"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowProductPicker(true)}
                      disabled={instagramProductTags.length >= 5}
                      className="w-full px-3 py-2 text-xs font-medium text-pink-700 bg-white border border-dashed border-pink-300 hover:border-pink-500 rounded-lg disabled:opacity-50"
                    >
                      {instagramProductTags.length >= 5 ? '5 products selected' : '+ Add product from IG Shop'}
                    </button>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Requires a connected Commerce catalog on the IG account. Products show as taggable hotspots on the published post.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* LinkedIn-specific options — only when a LinkedIn account is targeted */}
            {linkedinTargetCount > 0 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-3">
                <h4 className="text-xs font-semibold text-sky-900 uppercase tracking-wider">LinkedIn options</h4>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Article URL <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={linkedinArticleUrl}
                    onChange={(e) => setLinkedinArticleUrl(e.target.value)}
                    placeholder="https://blog.example.com/our-latest-post"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-sky-200 focus:ring-2 focus:ring-sky-400 outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    When set, the post renders as a link-preview card (title / description / thumbnail auto-scraped by LinkedIn). Overrides any attached image / video.
                  </p>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Attach a PDF / DOC / PPT in the media library and we'll publish it as a native LinkedIn document post automatically — no extra config needed.
                </p>
              </div>
            )}

            {/* YouTube-specific options — only when a YouTube channel is targeted */}
            {youtubeTargetCount > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-red-900 uppercase tracking-wider">YouTube options</h4>
                  <span className="text-[10px] text-red-700/70">Caption above becomes the video description</span>
                </div>

                {/* Title — YouTube's per-video title (max 100 chars) */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Video title <span className="text-slate-400">(required, max 100 chars)</span>
                  </label>
                  <input
                    type="text"
                    value={youtubeTitle}
                    onChange={(e) => setYoutubeTitle(e.target.value.slice(0, 100))}
                    maxLength={100}
                    placeholder="Catchy title viewers will see on YouTube"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-red-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 text-right">{youtubeTitle.length}/100</p>
                </div>

                {/* Custom thumbnail — channel must be verified or YT
                    silently ignores the call. We log a warning then. */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Custom thumbnail <span className="text-slate-400">(optional, JPG / PNG up to 2 MB)</span>
                  </label>
                  {customThumbnail ? (
                    <div className="flex items-center gap-3">
                      <img src={customThumbnail.url || customThumbnail.thumbnailUrl} alt="Thumbnail" className="w-32 h-18 object-cover rounded-lg border border-slate-200" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{customThumbnail.originalName}</p>
                        <button onClick={() => setCustomThumbnail(null)} className="text-[11px] text-rose-600 hover:underline mt-1">
                          Remove thumbnail
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowThumbPicker(true)}
                      className="w-full px-3 py-3 text-xs font-medium text-slate-600 bg-white border border-dashed border-slate-300 hover:border-red-400 rounded-lg"
                    >
                      Choose thumbnail from media library
                    </button>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    Channel must be verified for custom thumbnails. Unverified channels keep YouTube's auto-generated one.
                  </p>
                </div>

                {/* Visibility */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Visibility</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'private',  label: 'Private',  desc: 'Only you can view' },
                      { key: 'unlisted', label: 'Unlisted', desc: 'Anyone with the link' },
                      { key: 'public',   label: 'Public',   desc: 'Visible on your channel' },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setYoutubePrivacy(opt.key)}
                        className={clsx(
                          'px-3 py-2 text-xs font-medium rounded-lg border text-left',
                          youtubePrivacy === opt.key
                            ? 'border-red-300 bg-white text-red-900'
                            : 'border-slate-200 bg-white text-slate-700'
                        )}
                      >
                        <div className="font-semibold">{opt.label}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shorts vs long-form — appends #Shorts to the description
                    when toggled on (combined with vertical aspect <= 60s
                    YouTube decides on its end whether it qualifies). */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Video format</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setYoutubeIsShort(false)}
                      className={clsx(
                        'px-3 py-2 text-xs font-medium rounded-lg border text-left',
                        !youtubeIsShort ? 'border-red-300 bg-white text-red-900' : 'border-slate-200 bg-white text-slate-700'
                      )}
                    >
                      <div className="font-semibold">Long-form video</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Standard YouTube upload, any duration / aspect</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setYoutubeIsShort(true)}
                      className={clsx(
                        'px-3 py-2 text-xs font-medium rounded-lg border text-left',
                        youtubeIsShort ? 'border-red-300 bg-white text-red-900' : 'border-slate-200 bg-white text-slate-700'
                      )}
                    >
                      <div className="font-semibold">YouTube Short</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Vertical 9:16, ≤60s. Adds "#Shorts" to description.</div>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    The "Short" badge in YouTube Studio only appears for videos that meet the format rules. Tagging here lights up Scheduly's Shorts dashboards.
                  </p>
                </div>

                {/* Made for kids — COPPA required */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Audience</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setYoutubeMadeForKids(false)}
                      className={clsx(
                        'px-3 py-2 text-xs font-medium rounded-lg border text-left',
                        !youtubeMadeForKids ? 'border-red-300 bg-white text-red-900' : 'border-slate-200 bg-white text-slate-700'
                      )}
                    >
                      <div className="font-semibold">No, it's not made for kids</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Personalised ads, comments, notifications</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setYoutubeMadeForKids(true)}
                      className={clsx(
                        'px-3 py-2 text-xs font-medium rounded-lg border text-left',
                        youtubeMadeForKids ? 'border-red-300 bg-white text-red-900' : 'border-slate-200 bg-white text-slate-700'
                      )}
                    >
                      <div className="font-semibold">Yes, it's made for kids</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">COPPA: limits personalisation, comments off</div>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    Required by COPPA. YouTube applies this regardless of viewer age, so pick honestly.
                  </p>
                </div>

                <p className="text-[10px] text-slate-500 pt-1">
                  Default visibility is Private so accidental publishes don't go public. Find uploaded videos in YouTube Studio → Content.
                </p>
              </div>
            )}

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
            disabled={isPending || !content.trim() || selectedAccountIds.length === 0 || youtubeOverQuota || youtubeMissingVideo || youtubeMissingTitle}
            title={
              youtubeMissingVideo ? 'YouTube only accepts videos — attach a video file or remove the YouTube target'
              : youtubeMissingTitle ? 'YouTube requires a video title — fill it in the YouTube options panel'
              : youtubeOverQuota ? `YouTube daily quota exhausted — ${youtubeQuota?.uploadsRemaining || 0} uploads remaining`
              : undefined
            }
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-full shadow-lg shadow-violet-600/20 transition disabled:opacity-50"
          >
            <Clock className="w-4 h-4" />
            {isPending ? 'Scheduling...' : selectedAccountIds.length > 1 ? `Schedule to ${selectedAccountIds.length}` : 'Schedule Post'}
          </button>
        </div>
        {youtubeMissingVideo && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            YouTube only accepts videos — attach a video file or unselect the YouTube channel
          </div>
        )}
        {youtubeTargetCount > 0 && youtubeQuota && !youtubeMissingVideo && (
          <YoutubeQuotaBadge quota={youtubeQuota} needed={youtubeTargetCount} />
        )}
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
      {showThumbPicker && (
        <MediaLibraryModal
          mimeFilter="image/"
          onSelect={(items) => {
            const img = items.find(i => (i.mimeType || '').startsWith('image/'));
            if (img) setCustomThumbnail(img);
            setShowThumbPicker(false);
          }}
          onClose={() => setShowThumbPicker(false)}
        />
      )}
      {showProductPicker && (
        <InstagramProductPicker
          igAccounts={selectedAccounts.filter(a => a.platform === 'instagram_business')}
          existingIds={instagramProductTags.map(p => p.id)}
          onPick={(product) => {
            setInstagramProductTags(prev => prev.find(x => x.id === product.id)
              ? prev
              : [...prev, { id: product.id, name: product.name, imageUrl: product.imageUrl, x: 0.5, y: 0.5 }]);
          }}
          onClose={() => setShowProductPicker(false)}
        />
      )}

      <UploadProgressCard
        state={uploadProgress.state}
        percent={uploadProgress.percent}
        loaded={uploadProgress.loaded}
        total={uploadProgress.total}
        fileCount={uploadProgress.fileCount}
        errorMessage={uploadProgress.errorMessage}
      />

      {/* AI caption modal — small, no separate component, just an inline div. */}
      {aiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setAiOpen(false); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <h3 className="text-sm font-semibold text-slate-900">Generate caption with AI</h3>
            </div>
            <p className="text-xs text-slate-500 leading-snug">
              Describe what the post should be about. The model adjusts tone and length per platform
              ({[...new Set(selectedAccounts.map(a => a.platform))].join(', ') || 'no accounts selected yet'}).
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Prompt</label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. New product launch — vintage-style leather notebooks, eco-friendly tanning, available next Monday"
                rows={5}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-violet-400 outline-none resize-y"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Tone</label>
              <select
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-violet-400 outline-none"
              >
                <option value="engaging">Engaging</option>
                <option value="professional">Professional</option>
                <option value="playful">Playful</option>
                <option value="witty">Witty</option>
                <option value="authoritative">Authoritative</option>
                <option value="inspirational">Inspirational</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAiOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => aiMut.mutate()}
                disabled={!aiPrompt.trim() || aiMut.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                {aiMut.isPending ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline pill that shows YouTube's daily quota status — surfaces *before* the
// publish click so the user knows if they'll be blocked. Goes red when the
// requested upload count would exceed what's left.
function YoutubeQuotaBadge({ quota, needed }) {
  const blocked = quota.uploadsRemaining < needed;
  return (
    <div
      className={clsx(
        'mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium',
        blocked ? 'bg-rose-50 text-rose-700' : 'bg-red-50 text-red-700'
      )}
      title="YouTube Data API v3 caps free-tier projects at 10,000 quota units/day. Each upload costs 1,600 units."
    >
      <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
      YouTube quota: {quota.uploadsRemaining} of {Math.floor(quota.dailyLimit / quota.costPerUpload)} uploads remaining today
      {blocked && ` — need ${needed}`}
    </div>
  );
}

// Carousel thumbnail strip — drag any thumbnail to reorder. The order
// drives both the preview "first slide" image and the order the media
// IDs hit the platform publishers, so dragging reorders the live
// carousel that gets published.
function CarouselThumbStrip({ media, onReorder, onRemove }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = media.map(m => m.id);
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(media, oldIndex, newIndex));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={media.map(m => m.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {media.map(m => (
            <SortableCarouselThumb key={m.id} media={m} onRemove={onRemove} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableCarouselThumb({ media, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: media.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    cursor: 'grab',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 group border border-slate-200"
    >
      {media.mimeType?.startsWith('video/')
        ? <div className="w-full h-full bg-slate-200 flex items-center justify-center"><Film className="w-5 h-5 text-slate-400" /></div>
        : <img src={media.thumbnailUrl || media.url} alt="" className="w-full h-full object-cover pointer-events-none" />}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(media.id); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// Modal that searches the connected IG account's product catalog and
// lets the user tag products on the post. We query the first IG
// account in selectedAccounts — multi-IG posts share the same product
// list, which matches IG's own composer UX.
function InstagramProductPicker({ igAccounts, existingIds, onPick, onClose }) {
  const [accountId, setAccountId] = useState(igAccounts[0]?.id || null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  // Initial fetch + debounced search-as-you-type.
  useEffect(() => {
    if (!accountId) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const out = await searchInstagramProducts(accountId, query.trim());
        setResults(out.products || []);
        setNotice(out.notice || null);
      } catch (err) {
        setNotice(err.response?.data?.error || err.message);
        setResults([]);
      } finally { setLoading(false); }
    }, query ? 350 : 0);
    return () => clearTimeout(t);
  }, [accountId, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Tag products from IG Shop</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">×</button>
        </div>
        <div className="p-4 space-y-3 border-b border-slate-100">
          {igAccounts.length > 1 && (
            <select
              value={accountId || ''}
              onChange={(e) => setAccountId(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-pink-400"
            >
              {igAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.accountName || a.handle || `IG #${a.id}`}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-pink-400 outline-none"
          />
        </div>
        <div className="flex-1 overflow-auto p-4">
          {notice && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mb-3">{notice}</p>
          )}
          {loading ? (
            <p className="text-xs text-slate-400">Loading products…</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-slate-400 italic">
              {notice ? '' : query ? 'No matching products.' : 'No products to show. Catalog may be empty or not connected to this IG account.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map(p => {
                const already = existingIds.includes(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-slate-100" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 truncate">{p.name}</p>
                      {p.retailerId && <p className="text-[10px] text-slate-400">{p.retailerId}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => onPick(p)}
                      className="px-3 py-1 text-xs font-medium rounded-md text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50"
                    >
                      {already ? 'Added' : 'Add'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md">Done</button>
        </div>
      </div>
    </div>
  );
}

// Autocomplete picker for FB Page places + X Geo places. Debounces
// queries to avoid hammering Graph Search / X Geo as the user types.
// Falls back to a manual-ID input when the API returns a notice
// (e.g. X tier doesn't allow geo search).
function PlaceAutocomplete({ platform, label, value, onPick, onClear, initialLabel }) {
  const [query, setQuery] = useState(initialLabel || '');
  const [results, setResults] = useState([]);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const out = await searchPlaces(platform, query.trim());
        setResults(out.results || []);
        setNotice(out.notice || null);
      } catch (err) {
        setNotice(err.response?.data?.error || err.message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, platform]);

  if (value) {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
        <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-emerald-300 bg-emerald-50">
          <span className="flex-1 truncate text-emerald-900">{query || `Place ID: ${value}`}</span>
          <code className="text-[10px] text-emerald-700">{String(value).slice(0, 18)}…</code>
          <button type="button" onClick={() => { onClear(); setQuery(''); setResults([]); }} className="text-emerald-700 hover:text-rose-700 text-xs">
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-slate-600 mb-1.5">
        {label} <span className="text-slate-400">(type to search)</span>
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Cape Town…"
        className="w-full px-3 py-2 text-sm rounded-lg border border-emerald-200 focus:ring-2 focus:ring-emerald-400 outline-none"
      />
      {loading && (
        <p className="text-[10px] text-slate-400 mt-1">Searching…</p>
      )}
      {notice && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mt-1">{notice}</p>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {results.map(r => (
            <li
              key={r.id}
              onClick={() => { onPick(r); setOpen(false); setQuery(r.label); }}
              className="px-3 py-2 hover:bg-emerald-50 cursor-pointer border-b border-slate-100 last:border-b-0"
            >
              <p className="text-sm text-slate-900">{r.label}</p>
              {r.sublabel && <p className="text-[10px] text-slate-500">{r.sublabel}{r.category ? ` · ${r.category}` : ''}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
