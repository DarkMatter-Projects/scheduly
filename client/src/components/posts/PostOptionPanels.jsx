// Shared platform-specific option panels for the post composer. Used
// by both PostCreatePage and PostEditPage so editing a scheduled post
// surfaces the same fields the user filled in at create time.
//
// The panels render conditionally based on which platforms are in the
// target list. Picker / positioner modals are owned by this component
// so the parent doesn't have to manage their open state.
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Hash, Film, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { searchPlaces } from '../../api/postsApi';
import { searchInstagramProducts } from '../../api/socialApi';
import { listMedia } from '../../api/mediaApi';

export default function PostOptionPanels({
  selectedAccounts,
  attachedMedia,
  value, onChange,
}) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const fb = selectedAccounts.filter(a => a.platform === 'facebook_page').length;
  const tw = selectedAccounts.filter(a => a.platform === 'twitter').length;
  const ig = selectedAccounts.filter(a => a.platform === 'instagram_business').length;
  const li = selectedAccounts.filter(a => a.platform === 'linkedin').length;
  const yt = selectedAccounts.filter(a => a.platform === 'youtube').length;
  const tt = selectedAccounts.filter(a => a.platform === 'tiktok').length;

  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productPositionerOpen, setProductPositionerOpen] = useState(false);
  const [fbTagsPositionerOpen, setFbTagsPositionerOpen] = useState(false);
  const [fbTagIdInput, setFbTagIdInput] = useState('');
  const [fbTagLabelInput, setFbTagLabelInput] = useState('');
  const [thumbPickerOpen, setThumbPickerOpen] = useState(false);

  return (
    <>
      {/* Location — FB + X share this panel */}
      {(fb > 0 || tw > 0) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-emerald-900 uppercase tracking-wider">Location (optional)</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Display label</label>
            <input
              type="text"
              value={value.geoLabel || ''}
              onChange={(e) => set('geoLabel', e.target.value)}
              placeholder="Cape Town, South Africa"
              className="w-full px-3 py-2 text-sm rounded-lg border border-emerald-200 focus:ring-2 focus:ring-emerald-400 outline-none"
            />
          </div>
          {fb > 0 && (
            <PlaceAutocomplete
              platform="facebook_page"
              label="Facebook place"
              value={value.geoFacebookPlaceId || ''}
              onPick={(place) => {
                set('geoFacebookPlaceId', place?.id || '');
                if (place?.label && !value.geoLabel) set('geoLabel', place.label);
              }}
              onClear={() => set('geoFacebookPlaceId', '')}
              initialLabel={value.geoLabel}
            />
          )}
          {tw > 0 && (
            <PlaceAutocomplete
              platform="twitter"
              label="X place"
              value={value.geoTwitterPlaceId || ''}
              onPick={(place) => {
                set('geoTwitterPlaceId', place?.id || '');
                if (place?.label && !value.geoLabel) set('geoLabel', place.label);
              }}
              onClear={() => set('geoTwitterPlaceId', '')}
              initialLabel={value.geoLabel}
            />
          )}
        </div>
      )}

      {/* Facebook-specific — photo tags */}
      {fb > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-blue-900 uppercase tracking-wider">Facebook options</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Photo tags <span className="text-slate-400">(optional)</span>
            </label>
            {(value.facebookPhotoTags || []).length > 0 && (
              <ul className="space-y-1 mb-2">
                {value.facebookPhotoTags.map(t => (
                  <li key={t.id} className="flex items-center gap-2 px-2 py-1.5 bg-white border border-blue-200 rounded-md">
                    <span className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                      <Hash className="w-3 h-3 text-blue-700" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-900 truncate">{t.label || `User ${t.id}`}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{t.id}</p>
                    </div>
                    <button onClick={() => set('facebookPhotoTags', value.facebookPhotoTags.filter(x => x.id !== t.id))} className="text-rose-600 text-xs hover:underline">Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={fbTagIdInput}
                onChange={(e) => setFbTagIdInput(e.target.value)}
                placeholder="FB user_id or page_id"
                className="px-3 py-2 text-xs rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-400 outline-none font-mono"
              />
              <input
                type="text"
                value={fbTagLabelInput}
                onChange={(e) => setFbTagLabelInput(e.target.value)}
                placeholder="Friendly label"
                className="px-3 py-2 text-xs rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-400 outline-none"
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => {
                  const id = fbTagIdInput.trim();
                  if (!id) return;
                  if ((value.facebookPhotoTags || []).some(t => t.id === id)) return;
                  set('facebookPhotoTags', [...(value.facebookPhotoTags || []), { id, label: fbTagLabelInput.trim() || null, x: 0.5, y: 0.5 }]);
                  setFbTagIdInput(''); setFbTagLabelInput('');
                }}
                disabled={!fbTagIdInput.trim()}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >+ Add tag</button>
              {(value.facebookPhotoTags || []).length > 0 && attachedMedia.length > 0 && (
                <button
                  onClick={() => setFbTagsPositionerOpen(true)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-300 hover:bg-blue-50 rounded-lg"
                >Position tags</button>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
              Meta doesn't expose user search via the Graph API, so paste the FB user_id / page_id manually.
            </p>
          </div>
        </div>
      )}

      {/* Instagram-specific — story toggle, first comment, collaborators, product tags */}
      {ig > 0 && (
        <div className="rounded-xl border border-pink-200 bg-pink-50/40 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-pink-900 uppercase tracking-wider">Instagram options</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Post type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set('instagramPublishAsStory', false)}
                className={clsx('px-3 py-2 text-xs font-medium rounded-lg border text-left', !value.instagramPublishAsStory ? 'border-pink-300 bg-white text-pink-900' : 'border-slate-200 bg-white text-slate-700')}
              >
                <div className="font-semibold">Feed post</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Standard caption + media. Reels for single video.</div>
              </button>
              <button
                type="button"
                onClick={() => set('instagramPublishAsStory', true)}
                className={clsx('px-3 py-2 text-xs font-medium rounded-lg border text-left', value.instagramPublishAsStory ? 'border-pink-300 bg-white text-pink-900' : 'border-slate-200 bg-white text-slate-700')}
              >
                <div className="font-semibold">Story (24h)</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Single image or video. Caption / collaborators ignored.</div>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">First comment <span className="text-slate-400">(optional)</span></label>
            <textarea
              value={value.instagramFirstComment || ''}
              onChange={(e) => set('instagramFirstComment', e.target.value)}
              placeholder="Drop the hashtag dump here…"
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-pink-200 focus:ring-2 focus:ring-pink-400 outline-none resize-y"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Collaborators <span className="text-slate-400">(comma-separated, up to 20)</span></label>
            <input
              type="text"
              value={(value.instagramCollaborators || []).join(', ')}
              onChange={(e) => set('instagramCollaborators', e.target.value.split(',').map(s => s.trim().replace(/^@/, '')).filter(Boolean).slice(0, 20))}
              placeholder="@brandpartner, @influencer"
              className="w-full px-3 py-2 text-sm rounded-lg border border-pink-200 focus:ring-2 focus:ring-pink-400 outline-none font-mono"
            />
          </div>
          {!value.instagramPublishAsStory && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Product tags <span className="text-slate-400">(up to 5)</span>
              </label>
              {(value.instagramProductTags || []).length > 0 && (
                <ul className="space-y-1 mb-2">
                  {value.instagramProductTags.map(p => (
                    <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 bg-white border border-pink-200 rounded-md">
                      {p.imageUrl && <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover" />}
                      <span className="text-xs flex-1 truncate">{p.name}</span>
                      <button onClick={() => set('instagramProductTags', value.instagramProductTags.filter(x => x.id !== p.id))} className="text-rose-600 text-xs hover:underline">Remove</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setProductPickerOpen(true)}
                  disabled={(value.instagramProductTags || []).length >= 5}
                  className="flex-1 px-3 py-2 text-xs font-medium text-pink-700 bg-white border border-dashed border-pink-300 hover:border-pink-500 rounded-lg disabled:opacity-50"
                >
                  {(value.instagramProductTags || []).length >= 5 ? '5 products selected' : '+ Add product from IG Shop'}
                </button>
                {(value.instagramProductTags || []).length > 0 && attachedMedia.length > 0 && (
                  <button
                    onClick={() => setProductPositionerOpen(true)}
                    className="px-3 py-2 text-xs font-medium text-pink-700 bg-white border border-pink-300 hover:bg-pink-50 rounded-lg whitespace-nowrap"
                  >Position tags</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LinkedIn — article URL */}
      {li > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-sky-900 uppercase tracking-wider">LinkedIn options</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Article URL <span className="text-slate-400">(optional)</span></label>
            <input
              type="url"
              value={value.linkedinArticleUrl || ''}
              onChange={(e) => set('linkedinArticleUrl', e.target.value)}
              placeholder="https://blog.example.com/our-latest-post"
              className="w-full px-3 py-2 text-sm rounded-lg border border-sky-200 focus:ring-2 focus:ring-sky-400 outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">When set, the post renders as a link-preview card (overrides any attached image / video).</p>
          </div>
        </div>
      )}

      {/* YouTube — title, visibility, shorts, made-for-kids, custom thumbnail */}
      {yt > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-red-900 uppercase tracking-wider">YouTube options</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Video title <span className="text-slate-400">(required, max 100 chars)</span></label>
            <input
              type="text"
              value={value.youtubeTitle || ''}
              onChange={(e) => set('youtubeTitle', e.target.value.slice(0, 100))}
              maxLength={100}
              placeholder="Catchy title viewers will see on YouTube"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-red-500 outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1 text-right">{(value.youtubeTitle || '').length}/100</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Custom thumbnail <span className="text-slate-400">(optional, JPG / PNG up to 2 MB)</span></label>
            <ThumbnailField
              value={value.customThumbnail}
              onChange={(media) => set('customThumbnail', media)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Video format</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => set('youtubeIsShort', false)}
                className={clsx('px-3 py-2 text-xs font-medium rounded-lg border text-left', !value.youtubeIsShort ? 'border-red-300 bg-white text-red-900' : 'border-slate-200 bg-white text-slate-700')}>
                <div className="font-semibold">Long-form video</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Standard YouTube upload</div>
              </button>
              <button type="button" onClick={() => set('youtubeIsShort', true)}
                className={clsx('px-3 py-2 text-xs font-medium rounded-lg border text-left', value.youtubeIsShort ? 'border-red-300 bg-white text-red-900' : 'border-slate-200 bg-white text-slate-700')}>
                <div className="font-semibold">YouTube Short</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Adds "#Shorts" to description</div>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Visibility</label>
            <div className="grid grid-cols-3 gap-2">
              {['private','unlisted','public'].map(p => (
                <button key={p} type="button" onClick={() => set('youtubePrivacy', p)}
                  className={clsx('px-3 py-1.5 text-xs font-medium rounded-lg border', (value.youtubePrivacy || 'private') === p ? 'border-red-300 bg-white text-red-900' : 'border-slate-200 bg-white text-slate-700')}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={!!value.youtubeMadeForKids} onChange={(e) => set('youtubeMadeForKids', e.target.checked)} className="rounded" />
              This video is made for kids (COPPA)
            </label>
          </div>
        </div>
      )}

      {productPickerOpen && (
        <InstagramProductPicker
          igAccounts={selectedAccounts.filter(a => a.platform === 'instagram_business')}
          existingIds={(value.instagramProductTags || []).map(p => p.id)}
          onPick={(product) => {
            const next = (value.instagramProductTags || []).find(x => x.id === product.id)
              ? value.instagramProductTags
              : [...(value.instagramProductTags || []), { id: product.id, name: product.name, imageUrl: product.imageUrl, x: 0.5, y: 0.5 }];
            set('instagramProductTags', next);
          }}
          onClose={() => setProductPickerOpen(false)}
        />
      )}
      {productPositionerOpen && attachedMedia[0] && (
        <MediaTagPositioner
          mediaUrl={attachedMedia[0].thumbnailUrl || attachedMedia[0].url}
          isVideo={(attachedMedia[0].mimeType || '').startsWith('video/')}
          tags={value.instagramProductTags || []}
          accentColor="#ec4899"
          accentRing="ring-pink-500"
          tagLabelFor={(t) => t.name}
          onChange={(next) => set('instagramProductTags', next)}
          onClose={() => setProductPositionerOpen(false)}
        />
      )}
      {fbTagsPositionerOpen && attachedMedia[0] && (
        <MediaTagPositioner
          mediaUrl={attachedMedia[0].thumbnailUrl || attachedMedia[0].url}
          isVideo={(attachedMedia[0].mimeType || '').startsWith('video/')}
          tags={value.facebookPhotoTags || []}
          accentColor="#2563eb"
          accentRing="ring-blue-500"
          tagLabelFor={(t) => t.label || `User ${t.id}`}
          onChange={(next) => set('facebookPhotoTags', next)}
          onClose={() => setFbTagsPositionerOpen(false)}
        />
      )}
    </>
  );
}

// ── Helpers (local to keep this component self-contained) ────────────────────

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
      } finally { setLoading(false); }
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
          <button onClick={() => { onClear(); setQuery(''); setResults([]); }} className="text-emerald-700 hover:text-rose-700 text-xs">Change</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label} <span className="text-slate-400">(type to search)</span></label>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Cape Town…"
        className="w-full px-3 py-2 text-sm rounded-lg border border-emerald-200 focus:ring-2 focus:ring-emerald-400 outline-none"
      />
      {loading && <p className="text-[10px] text-slate-400 mt-1">Searching…</p>}
      {notice && <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mt-1">{notice}</p>}
      {open && results.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {results.map(r => (
            <li key={r.id} onClick={() => { onPick(r); setOpen(false); setQuery(r.label); }}
              className="px-3 py-2 hover:bg-emerald-50 cursor-pointer border-b border-slate-100 last:border-b-0">
              <p className="text-sm text-slate-900">{r.label}</p>
              {r.sublabel && <p className="text-[10px] text-slate-500">{r.sublabel}{r.category ? ` · ${r.category}` : ''}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InstagramProductPicker({ igAccounts, existingIds, onPick, onClose }) {
  const [accountId, setAccountId] = useState(igAccounts[0]?.id || null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

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
            <select value={accountId || ''} onChange={(e) => setAccountId(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-pink-400">
              {igAccounts.map(a => (<option key={a.id} value={a.id}>{a.accountName || `IG #${a.id}`}</option>))}
            </select>
          )}
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name…"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-pink-400 outline-none" />
        </div>
        <div className="flex-1 overflow-auto p-4">
          {notice && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mb-3">{notice}</p>}
          {loading ? <p className="text-xs text-slate-400">Loading…</p>
           : results.length === 0 ? <p className="text-xs text-slate-400 italic">{notice ? '' : query ? 'No matching products.' : 'No products to show.'}</p>
           : (
            <ul className="divide-y divide-slate-100">
              {results.map(p => {
                const already = existingIds.includes(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded object-cover" /> : <div className="w-10 h-10 rounded bg-slate-100" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 truncate">{p.name}</p>
                      {p.retailerId && <p className="text-[10px] text-slate-400">{p.retailerId}</p>}
                    </div>
                    <button disabled={already} onClick={() => onPick(p)}
                      className="px-3 py-1 text-xs font-medium rounded-md text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50">
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

function MediaTagPositioner({ mediaUrl, isVideo, tags, accentColor = '#2563eb', accentRing = 'ring-blue-500', tagLabelFor, onChange, onClose }) {
  const [draggingId, setDraggingId] = useState(null);
  const [local, setLocal] = useState(tags);
  useEffect(() => setLocal(tags), [tags]);
  const [containerEl, setContainerEl] = useState(null);

  const setTagPos = (id, x, y) => setLocal(prev => prev.map(t => t.id === id ? { ...t, x, y } : t));
  const handlePointerDown = (id) => (e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDraggingId(id); };
  const handlePointerMove = (e) => {
    if (!draggingId || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const x = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / rect.height));
    setTagPos(draggingId, x, y);
  };
  const handlePointerUp = () => setDraggingId(null);
  const save = () => { onChange(local); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Position tags</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">×</button>
        </div>
        <div className="p-4 flex-1 overflow-auto">
          <p className="text-[11px] text-slate-500 mb-2">Drag each dot to the spot on the photo where the tag should appear when the post is published.</p>
          <div ref={setContainerEl}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="relative w-full max-w-md mx-auto bg-slate-100 rounded-lg overflow-hidden select-none"
            style={{ aspectRatio: '1 / 1', touchAction: 'none' }}>
            {isVideo
              ? <div className="absolute inset-0 bg-slate-200 flex items-center justify-center"><Film className="w-10 h-10 text-slate-400" /></div>
              : <img src={mediaUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />}
            {local.map(t => (
              <div key={t.id}
                onPointerDown={handlePointerDown(t.id)}
                className={clsx('absolute group', draggingId === t.id ? 'cursor-grabbing z-20' : 'cursor-grab z-10')}
                style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, transform: 'translate(-50%, -50%)' }}>
                <div className={clsx('w-7 h-7 rounded-full bg-white shadow-lg ring-2 flex items-center justify-center', accentRing)}>
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
                </div>
                <div className="absolute left-1/2 top-full -translate-x-1/2 mt-1.5 px-2 py-0.5 text-[10px] font-medium bg-slate-900 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
                  {tagLabelFor(t)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md">Cancel</button>
          <button onClick={save} className="px-4 py-1.5 text-xs font-semibold rounded-md text-white" style={{ backgroundColor: accentColor }}>Save positions</button>
        </div>
      </div>
    </div>
  );
}

function ThumbnailField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  if (value) {
    return (
      <div className="flex items-center gap-3">
        <img src={value.url || value.thumbnailUrl} alt="Thumbnail" className="w-32 h-18 object-cover rounded-lg border border-slate-200" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-800 truncate">{value.originalName}</p>
          <button onClick={() => onChange(null)} className="text-[11px] text-rose-600 hover:underline mt-1">Remove thumbnail</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="w-full px-3 py-3 text-xs font-medium text-slate-600 bg-white border border-dashed border-slate-300 hover:border-red-400 rounded-lg">
        Choose thumbnail from media library
      </button>
      {open && <ThumbnailPickerModal onSelect={(m) => { onChange(m); setOpen(false); }} onClose={() => setOpen(false)} />}
    </>
  );
}

function ThumbnailPickerModal({ onSelect, onClose }) {
  const { data, isLoading } = useQuery({ queryKey: ['media', 1, ''], queryFn: () => listMedia({ page: 1, limit: 48 }) });
  const items = (data?.data || []).filter(m => (m.mimeType || '').startsWith('image/'));
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Choose thumbnail</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? <p className="text-center text-slate-400 py-8">Loading…</p>
           : items.length === 0 ? <p className="text-center text-slate-400 py-8">No image media. Upload images first.</p>
           : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {items.map(item => (
                <div key={item.id} onClick={() => onSelect(item)}
                  className="relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 border-transparent hover:border-red-400">
                  <img src={item.thumbnailUrl || item.url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
