import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Lock, ArrowLeft, Check } from 'lucide-react';
import clsx from 'clsx';
import { DASHBOARD_TEMPLATES } from '../../utils/dashboardTemplates';
import { getPlatform } from '../../utils/platforms';
import { listAccounts } from '../../api/socialApi';
import AccountAvatar from '../common/AccountAvatar';

// Two-step modal:
//   1. Pick a template (grid of starter dashboards)
//   2. Pick which connected accounts to scope the dashboard to
//      — pre-selects every connected account on the template's platforms
//      — skip entirely for templates with no platform restriction (custom)
//        or no per-account scope (paid_performance pulls from ad insights)
export default function TemplatePickerModal({ onPick, onClose, clientId }) {
  const [picked, setPicked] = useState(null);
  const { data: accounts = [] } = useQuery({
    queryKey: ['socialAccounts'],
    queryFn: listAccounts,
  });

  const handlePick = (template) => {
    if (!template.available) return;
    // Templates that don't need per-account scoping go straight through.
    if (skipsAccountStep(template)) {
      onPick(template, []);
      return;
    }
    setPicked(template);
  };

  const handleConfirm = (accountIds) => {
    onPick(picked, accountIds);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-stretch sm:items-center justify-center overflow-y-auto">
      <div className="bg-slate-50 w-full sm:max-w-6xl sm:rounded-2xl shadow-2xl my-0 sm:my-6 max-h-screen sm:max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white sm:rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            {picked && (
              <button onClick={() => setPicked(null)} className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Back to templates">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-semibold text-slate-900">
              {picked ? `Select profiles for ${picked.name}` : 'Select dashboard template'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {picked ? (
          <AccountStep
            template={picked}
            accounts={accounts}
            clientId={clientId}
            onConfirm={handleConfirm}
            onBack={() => setPicked(null)}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {DASHBOARD_TEMPLATES.map(t => (
                <TemplateCard key={t.key} template={t} onPick={handlePick} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2: account picker ──────────────────────────────────────────────────

function AccountStep({ template, accounts, clientId, onConfirm, onBack }) {
  // Only show accounts on platforms this template can use, scoped to the
  // currently-active client if one is selected.
  const eligible = useMemo(() => {
    return accounts.filter(a => {
      if (!a.isActive) return false;
      if (clientId && a.clientId !== clientId) return false;
      return template.platforms.includes(a.platform);
    });
  }, [accounts, template, clientId]);

  // Default: every eligible account selected.
  const [selected, setSelected] = useState(() => new Set(eligible.map(a => a.id)));

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === eligible.length) setSelected(new Set());
    else setSelected(new Set(eligible.map(a => a.id)));
  };

  // Group accounts by platform for nicer layout.
  const groups = useMemo(() => {
    const m = new Map();
    for (const a of eligible) {
      if (!m.has(a.platform)) m.set(a.platform, []);
      m.get(a.platform).push(a);
    }
    return [...m.entries()];
  }, [eligible]);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-xs text-slate-500 mb-4">
          Widgets in this dashboard will only pull data from the profiles you tick below. You can change this later from the dashboard builder.
        </p>

        {eligible.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <p className="text-sm font-semibold text-slate-900 mb-1">No matching accounts connected</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              The <strong>{template.name}</strong> template needs at least one account on {template.platforms.map(p => getPlatform(p)?.label || p).join(' or ')}. Connect one on the Accounts page first.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {selected.size} of {eligible.length} selected
              </span>
              <button
                onClick={toggleAll}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
              >
                {selected.size === eligible.length ? 'Clear all' : 'Select all'}
              </button>
            </div>

            <div className="space-y-4">
              {groups.map(([platform, list]) => {
                const p = getPlatform(platform);
                const Icon = p?.icon;
                return (
                  <div key={platform}>
                    <div className="flex items-center gap-2 mb-2">
                      {Icon && (
                        <span className={clsx('w-4 h-4 rounded flex items-center justify-center text-white', p.bg)}>
                          <Icon className="w-2 h-2" />
                        </span>
                      )}
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        {p?.label || platform}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {list.map(a => {
                        const isSel = selected.has(a.id);
                        return (
                          <button
                            key={a.id}
                            onClick={() => toggle(a.id)}
                            className={clsx(
                              'flex items-center gap-3 px-3 py-2 rounded-lg border bg-white text-left transition',
                              isSel ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
                            )}
                          >
                            <AccountAvatar account={a} size={32} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{a.accountName}</p>
                              {a.clientName && (
                                <p className="text-[10px] text-slate-500 truncate">{a.clientName}</p>
                              )}
                            </div>
                            <div className={clsx(
                              'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0',
                              isSel ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                            )}>
                              {isSel && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-slate-200 px-6 py-3 flex items-center justify-between bg-white sm:rounded-b-2xl">
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-100 rounded"
        >
          Back
        </button>
        <button
          onClick={() => onConfirm([...selected])}
          disabled={eligible.length > 0 && selected.size === 0}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
        >
          Create dashboard
        </button>
      </div>
    </>
  );
}

// Templates that don't have per-account scoping — go straight to create.
function skipsAccountStep(template) {
  if (template.key === 'custom') return true;
  // Paid performance pulls from ad_insights tables (Meta Ads / Google Ads /
  // TikTok Ads), not from social_accounts — there's no account picker for it.
  if (template.key === 'paid_performance') return true;
  // Engage-only templates use the engage_messages table across all accounts.
  if (template.key === 'customer_engagement') return true;
  return false;
}

// ── Template card (unchanged) ──────────────────────────────────────────────

function TemplateCard({ template, onPick }) {
  const disabled = !template.available;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(template)}
      className={clsx(
        'group relative rounded-xl border border-slate-200 bg-white overflow-hidden text-left',
        'transition-shadow',
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-md hover:border-blue-300 cursor-pointer'
      )}
    >
      <div className="h-32 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center relative">
        <Preview templateKey={template.key} />
        {disabled && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-white/90 px-2 py-0.5 rounded-full">
            <Lock className="w-2.5 h-2.5" />
            Soon
          </span>
        )}
        {template.requiresAdAccount && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-white/95 px-2 py-0.5 rounded-full border border-slate-200">
            <Lock className="w-2.5 h-2.5" />
            Requires ad account
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold text-slate-900">{template.name}</span>
          {template.badge && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
              {template.badge}
            </span>
          )}
        </div>
        {template.description && (
          <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-snug">{template.description}</p>
        )}
        <div className="flex items-center gap-1.5">
          {template.platforms.map(key => {
            const p = getPlatform(key);
            const Icon = p?.icon;
            if (!Icon) {
              return (
                <span key={key} className="text-[10px] uppercase tracking-wide text-slate-400">{key.replace('_', ' ')}</span>
              );
            }
            return (
              <span
                key={key}
                className={clsx('w-5 h-5 rounded flex items-center justify-center text-white', p.bg)}
                title={p.label}
              >
                <Icon className="w-2.5 h-2.5" />
              </span>
            );
          })}
        </div>
      </div>
    </button>
  );
}

function Preview({ templateKey }) {
  const themed = {
    facebook_overview: { stroke: '#1d4ed8', fill: '#bfdbfe' },
    instagram_overview: { stroke: '#db2777', fill: '#fbcfe8' },
    tiktok_overview: { stroke: '#0f172a', fill: '#e2e8f0' },
    paid_performance: { stroke: '#059669', fill: '#a7f3d0' },
    content_performance: { stroke: '#7c3aed', fill: '#ddd6fe' },
    customer_engagement: { stroke: '#dc2626', fill: '#fecaca' },
    fans_overview: { stroke: '#f59e0b', fill: '#fde68a' },
    distribution_overview: { stroke: '#475569', fill: '#cbd5e1' },
    video_overview: { stroke: '#0284c7', fill: '#bae6fd' },
    instagram_stories_dms: { stroke: '#be185d', fill: '#fbcfe8' },
    label_performance: { stroke: '#7c3aed', fill: '#ddd6fe' },
    linkedin_overview: { stroke: '#0369a1', fill: '#bae6fd' },
    twitter_overview: { stroke: '#0f172a', fill: '#e2e8f0' },
    youtube_overview: { stroke: '#dc2626', fill: '#fecaca' },
    pinterest_overview: { stroke: '#dc2626', fill: '#fecaca' },
    custom: { stroke: '#64748b', fill: '#e2e8f0' },
  };
  const c = themed[templateKey] || themed.custom;

  return (
    <svg viewBox="0 0 200 90" className="w-32 h-20 opacity-90">
      <rect x="2" y="2" width="196" height="86" rx="6" fill="white" stroke="#e2e8f0" />
      <rect x="10" y="10" width="60" height="6" rx="2" fill="#cbd5e1" />
      <rect x="10" y="22" width="40" height="6" rx="2" fill="#e2e8f0" />
      <path
        d="M10,70 C40,30 80,80 120,40 C160,10 180,55 190,30"
        fill="none"
        stroke={c.stroke}
        strokeWidth="2"
      />
      <path
        d="M10,70 C40,30 80,80 120,40 C160,10 180,55 190,30 L190,82 L10,82 Z"
        fill={c.fill}
        opacity="0.65"
      />
    </svg>
  );
}
