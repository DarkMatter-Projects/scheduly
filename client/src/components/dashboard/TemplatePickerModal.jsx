import { X, Lock } from 'lucide-react';
import clsx from 'clsx';
import { DASHBOARD_TEMPLATES } from '../../utils/dashboardTemplates';
import { getPlatform } from '../../utils/platforms';

// Modal shown when the user clicks "Create dashboard". Replicates the
// 4-column template grid from the reference UI.
export default function TemplatePickerModal({ onPick, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-stretch sm:items-center justify-center overflow-y-auto">
      <div className="bg-slate-50 w-full sm:max-w-6xl sm:rounded-2xl shadow-2xl my-0 sm:my-6 max-h-screen sm:max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white sm:rounded-t-2xl flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900">Select dashboard template</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DASHBOARD_TEMPLATES.map(t => (
              <TemplateCard key={t.key} template={t} onPick={onPick} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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
      {/* Preview area — abstract gradient mock */}
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

// Tiny abstract preview per template — gives the cards visual variety without
// shipping screenshots. Pure SVG, no external assets.
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
