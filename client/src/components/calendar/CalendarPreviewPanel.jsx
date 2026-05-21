import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { FacebookIcon, InstagramIcon, TiktokIcon } from '../common/SocialIcons';
import { Heart, MessageCircle, Send, Play } from 'lucide-react';

// A phone-frame mock-up that arranges the calendar's scheduled posts in the
// shape each platform actually presents them: IG profile grid (3×3 squares),
// TikTok profile grid (3 columns, portrait tiles), FB feed (vertical cards).
//
// Driven entirely by the events the calendar already fetches. Filters down
// to whichever account the user picks in the dropdown.
const PLATFORM_TABS = [
  { key: 'instagram_business', label: 'Instagram', Icon: InstagramIcon },
  { key: 'facebook_page',      label: 'Facebook',  Icon: FacebookIcon },
  { key: 'tiktok',             label: 'TikTok',    Icon: TiktokIcon },
];

export default function CalendarPreviewPanel({ events = [], onPostClick }) {
  const [platform, setPlatform] = useState('instagram_business');
  const [accountId, setAccountId] = useState(null); // null = aggregate across all accounts on this platform

  // Posts that target the current platform, with the matching target snapshot
  // attached so we can show the account header (avatar/name) per post.
  const filtered = useMemo(() => {
    const out = [];
    for (const e of events) {
      const targets = e.extendedProps?.targets || [];
      const hit = targets.find(t => t.platform === platform && (!accountId || t.accountId === accountId));
      if (hit) out.push({ event: e, target: hit });
    }
    // Most-recently scheduled first — matches how a creator scrolls a feed.
    out.sort((a, b) => new Date(b.event.start) - new Date(a.event.start));
    return out;
  }, [events, platform, accountId]);

  // All accounts on the selected platform that appear in the events list.
  const accountsOnPlatform = useMemo(() => {
    const seen = new Map();
    for (const e of events) {
      for (const t of e.extendedProps?.targets || []) {
        if (t.platform === platform && !seen.has(t.accountId)) {
          seen.set(t.accountId, t);
        }
      }
    }
    return [...seen.values()];
  }, [events, platform]);

  const activeAccount = accountId
    ? accountsOnPlatform.find(a => a.accountId === accountId)
    : accountsOnPlatform[0] || null;

  return (
    <aside className="w-[340px] flex-shrink-0 hidden xl:flex flex-col">
      <div className="sticky top-4">
        {/* Platform tabs */}
        <div className="bg-white rounded-t-xl border border-slate-200 px-3 py-2 flex items-center gap-1">
          {PLATFORM_TABS.map(t => {
            const active = platform === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setPlatform(t.key); setAccountId(null); }}
                className={clsx(
                  'flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition',
                  active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <t.Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Account picker (only when >1 account on this platform) */}
        {accountsOnPlatform.length > 1 && (
          <div className="bg-white border-x border-slate-200 px-3 py-2">
            <select
              value={accountId || accountsOnPlatform[0].accountId}
              onChange={(e) => setAccountId(parseInt(e.target.value, 10))}
              className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 bg-white"
            >
              {accountsOnPlatform.map(a => (
                <option key={a.accountId} value={a.accountId}>{a.accountName}</option>
              ))}
            </select>
          </div>
        )}

        {/* Phone frame */}
        <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl p-3">
          <div className="mx-auto w-[280px] rounded-[2rem] border-[10px] border-slate-900 bg-white overflow-hidden shadow-xl">
            {/* Status bar */}
            <div className="h-6 bg-slate-900 flex items-center justify-center">
              <div className="w-20 h-1.5 bg-slate-700 rounded-full" />
            </div>

            {platform === 'instagram_business' && (
              <InstagramPreview filtered={filtered} account={activeAccount} onPostClick={onPostClick} />
            )}
            {platform === 'facebook_page' && (
              <FacebookPreview filtered={filtered} account={activeAccount} onPostClick={onPostClick} />
            )}
            {platform === 'tiktok' && (
              <TikTokPreview filtered={filtered} account={activeAccount} onPostClick={onPostClick} />
            )}
          </div>

          <p className="text-[10px] text-slate-400 mt-2 text-center">
            {filtered.length} post{filtered.length === 1 ? '' : 's'} targeting {PLATFORM_TABS.find(p => p.key === platform)?.label}
          </p>
        </div>
      </div>
    </aside>
  );
}

// ── Instagram (3×3 profile grid) ────────────────────────────────────────────

function InstagramPreview({ filtered, account, onPostClick }) {
  return (
    <div className="bg-white">
      <ProfileHeader account={account} captionStat="posts" count={filtered.length} />
      <div className="grid grid-cols-3 gap-px bg-slate-200 mt-2">
        {filtered.length === 0 ? (
          <EmptyTile span={9} hint="No scheduled IG posts" />
        ) : (
          filtered.slice(0, 12).map(({ event, target }) => (
            <PostTile key={event.id} event={event} target={target} aspect="square" onPostClick={onPostClick} />
          ))
        )}
      </div>
    </div>
  );
}

// ── TikTok (3-col portrait grid) ────────────────────────────────────────────

function TikTokPreview({ filtered, account, onPostClick }) {
  return (
    <div className="bg-white">
      <ProfileHeader account={account} captionStat="videos" count={filtered.length} dark />
      <div className="grid grid-cols-3 gap-px bg-slate-200 mt-2">
        {filtered.length === 0 ? (
          <EmptyTile span={9} hint="No scheduled TikToks" />
        ) : (
          filtered.slice(0, 9).map(({ event, target }) => (
            <PostTile key={event.id} event={event} target={target} aspect="portrait" overlay={<Play className="w-4 h-4 text-white" />} onPostClick={onPostClick} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Facebook (vertical feed cards) ──────────────────────────────────────────

function FacebookPreview({ filtered, account, onPostClick }) {
  return (
    <div className="bg-slate-100 max-h-[520px] overflow-y-auto">
      {filtered.length === 0 ? (
        <div className="p-6 text-center text-[10px] text-slate-500">No scheduled Facebook posts</div>
      ) : (
        filtered.slice(0, 8).map(({ event, target }) => (
          <FacebookCard key={event.id} event={event} target={target} onPostClick={onPostClick} />
        ))
      )}
    </div>
  );
}

function FacebookCard({ event, target, onPostClick }) {
  const ext = event.extendedProps;
  return (
    <button
      onClick={() => onPostClick?.(event.id)}
      className="block w-full bg-white border-b border-slate-200 text-left"
    >
      <div className="px-2 py-2 flex items-center gap-2">
        <AvatarBubble src={target.profilePictureUrl} name={target.accountName} size={24} />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-slate-900 truncate">{target.accountName}</p>
          <p className="text-[8px] text-slate-500">Scheduled</p>
        </div>
      </div>
      {ext.content && (
        <p className="px-2 pb-2 text-[10px] text-slate-700 line-clamp-3">{ext.content}</p>
      )}
      {ext.thumbnail && (
        <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
          <img src={ext.thumbnail} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="px-2 py-1.5 flex items-center gap-3 text-slate-400">
        <Heart className="w-2.5 h-2.5" />
        <MessageCircle className="w-2.5 h-2.5" />
        <Send className="w-2.5 h-2.5" />
      </div>
    </button>
  );
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function ProfileHeader({ account, captionStat, count, dark }) {
  return (
    <div className={clsx('px-3 py-2 flex items-center gap-2', dark ? 'bg-slate-900 text-white' : 'bg-white')}>
      <AvatarBubble src={account?.profilePictureUrl} name={account?.accountName || '?'} size={32} />
      <div className="min-w-0">
        <p className={clsx('text-[11px] font-semibold truncate', dark && 'text-white')}>
          {account?.accountName || '—'}
        </p>
        <p className={clsx('text-[9px]', dark ? 'text-slate-400' : 'text-slate-500')}>
          {count} {captionStat}
        </p>
      </div>
    </div>
  );
}

function PostTile({ event, target, aspect, overlay, onPostClick }) {
  const ext = event.extendedProps;
  const isVideo = ext.thumbnailMime?.startsWith('video/');
  const ratio = aspect === 'portrait' ? 'aspect-[3/4]' : 'aspect-square';
  return (
    <button
      onClick={() => onPostClick?.(event.id)}
      className={clsx('relative bg-slate-200 overflow-hidden group', ratio)}
      title={ext.content || 'Open post'}
    >
      {ext.thumbnail ? (
        isVideo ? (
          <video src={ext.thumbnail} className="w-full h-full object-cover" muted playsInline />
        ) : (
          <img src={ext.thumbnail} alt="" className="w-full h-full object-cover" />
        )
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
          <span className="text-[8px] text-slate-500 px-1 text-center line-clamp-3">
            {ext.content?.slice(0, 40) || 'No media'}
          </span>
        </div>
      )}
      {overlay && <div className="absolute top-1 right-1">{overlay}</div>}
      {(isVideo && !overlay) && <Play className="absolute top-1 right-1 w-3 h-3 text-white drop-shadow" />}
    </button>
  );
}

function EmptyTile({ span, hint }) {
  return (
    <div className="col-span-3 row-span-3 aspect-[3/1] bg-slate-50 flex items-center justify-center text-[10px] text-slate-400" style={{ gridColumn: `span ${span}` }}>
      {hint}
    </div>
  );
}

function AvatarBubble({ src, name, size = 32 }) {
  const initials = (name || '?').split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size} height={size}
        className="rounded-full object-cover bg-slate-100 flex-shrink-0"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-blue-400 to-pink-500 text-white flex items-center justify-center font-semibold flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.35) }}
    >
      {initials}
    </div>
  );
}
