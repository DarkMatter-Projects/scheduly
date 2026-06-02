import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ArrowLeft, Check, Lock, AlertTriangle, BarChart3, Activity, Smile, LineChart as LineIcon, GridIcon, Layers, PieChart as PieIcon } from 'lucide-react';
import clsx from 'clsx';
import { listAvailableMetrics } from '../../api/dashboardsApi';
import { FacebookIcon, InstagramIcon, TiktokIcon, LinkedinIcon, YoutubeIcon, PinterestIcon, TwitterIcon } from '../common/SocialIcons';

// Two-step modal: pick widget type, then pick the metrics that feed it.
// onSave receives { category, widgetType, title, metricKeys, width, height }.
export default function AddWidgetModal({ onSave, onClose }) {
  const [step, setStep] = useState('type');
  const [category, setCategory] = useState('channel');
  const [widgetType, setWidgetType] = useState(null);
  const [picked, setPicked] = useState([]);
  const [title, setTitle] = useState('');

  const { data: metrics = [] } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: listAvailableMetrics,
    staleTime: 5 * 60 * 1000,
  });

  // Group metrics by section for the picker. Filter to the chosen category
  // (channel/content/engage) — the registry tags every metric.
  const grouped = useMemo(() => {
    const list = metrics.filter(m => m.category === category);
    const bySection = new Map();
    for (const m of list) {
      const s = m.section || 'other';
      if (!bySection.has(s)) bySection.set(s, []);
      bySection.get(s).push(m);
    }
    return [...bySection.entries()];
  }, [metrics, category]);

  const toggle = (key) => {
    setPicked(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Widget types whose data source is fixed — they don't need user-picked metrics.
  const NO_METRIC_WIDGETS = new Set([
    'sentiment_breakdown', 'sentiment_trend',
    // Placeholder widgets that don't query metric data yet — let the user
    // add them to the canvas without forcing a metric pick.
    'demographics', 'geographics', 'label_performance',
    'paid_performance', 'followers_by_country', 'reaction_breakdown',
    'metric_by_post_type', 'metric_by_post_type_over_time',
    'follow_non_follow_split', 'top_err_profiles',
    'reels_performance', 'story_performance',
    'fans_by_age_gender', 'engagements_by_profile',
    'views_from_source', 'fans_online_hourly',
    'engage_volume_by_network', 'engage_sentiment_by_network',
    'engage_sentiment_by_channel', 'engage_sentiment_by_label',
    'engage_sentiment_kpi_group',
    'net_new_subscribers_by_country', 'shares_by_source',
    'engagements_by_country', 'top_sources_by_views',
    'video_views_by_country', 'watch_time_by_country',
    'longform_videos_performance', 'shorts_performance',
    'video_performance', 'fans_by_function', 'fans_by_seniority',
    'fans_by_association', 'reach_by_follower_type', 'reach_by_distribution',
  ]);
  const requiresMetrics = !NO_METRIC_WIDGETS.has(widgetType);

  const handleSave = () => {
    if (!widgetType) return;
    if (requiresMetrics && picked.length === 0) return;
    onSave({
      category,
      widgetType,
      title: title.trim() || undefined,
      metricKeys: picked,
      // Sensible default size per widget type.
      width: widgetType === 'key_metrics' ? 12 : widgetType === 'time_series' ? 6 : 6,
      height: widgetType === 'key_metrics' ? 2 : 3,
    });
  };

  const onNext = () => {
    // Skip the metric picker entirely for widgets that don't need metrics.
    if (!requiresMetrics) {
      handleSave();
      return;
    }
    setStep('metrics');
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-stretch sm:items-center justify-center overflow-y-auto">
      <div className="bg-white w-full sm:max-w-5xl sm:rounded-2xl shadow-2xl my-0 sm:my-6 max-h-screen sm:max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === 'metrics' && (
              <button onClick={() => setStep('type')} className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Back">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-semibold text-slate-900">
              {step === 'type' ? 'Select widget type' : `Select metrics · ${picked.length}`}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'type' ? (
          <TypeStep
            category={category}
            setCategory={setCategory}
            widgetType={widgetType}
            setWidgetType={setWidgetType}
            onNext={onNext}
          />
        ) : (
          <MetricStep
            title={title}
            setTitle={setTitle}
            grouped={grouped}
            picked={picked}
            toggle={toggle}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

// ── Step 1: pick category + widget type ──────────────────────────────────────

const CATEGORIES = [
  { key: 'channel', label: 'Channel metrics', icon: Activity, desc: 'Activity which occurred across the entire channel during the chosen date range.' },
  { key: 'content', label: 'Content metrics', icon: BarChart3, desc: 'Activity only on posts published during the chosen date range.', badge: 'New' },
  { key: 'engage',  label: 'Engage metrics',  icon: Smile,     desc: 'Data related to your incoming messages and their sentiment.', badge: 'New' },
];

const WIDGETS_BY_CATEGORY = {
  channel: [
    { key: 'key_metrics',              label: 'Key metrics',              icon: GridIcon,    impl: true },
    { key: 'time_series',              label: 'Time series',              icon: LineIcon,    impl: true },
    { key: 'channel_performance_table',label: 'Performance by channel',   icon: GridIcon,    impl: true },
    { key: 'channel_comparison',       label: 'Channel comparison (bar)', icon: BarChart3,   impl: true },
    { key: 'network_comparison',       label: 'Network comparison',       icon: Layers,      impl: true },
    { key: 'breakdown',                label: 'Breakdown',                icon: BarChart3,   impl: true },
    { key: 'demographics',             label: 'Demographics',             icon: Smile,       impl: true },
    { key: 'geographics',              label: 'Geographics',              icon: GridIcon,    impl: true },
  ],
  content: [
    { key: 'key_metrics',         label: 'Key metrics',         icon: GridIcon,   impl: true },
    { key: 'time_series',         label: 'Time series',         icon: LineIcon,   impl: true },
    { key: 'channel_comparison',  label: 'Channel comparison',  icon: BarChart3,  impl: true },
    { key: 'content_performance', label: 'Content performance', icon: BarChart3,  impl: true },
    { key: 'label_performance',   label: 'Label performance',   icon: BarChart3,  impl: true },
  ],
  engage: [
    { key: 'key_metrics',          label: 'Key metrics',          icon: GridIcon,   impl: true },
    { key: 'time_series',          label: 'Time series',          icon: LineIcon,   impl: true },
    { key: 'channel_comparison',   label: 'Channel comparison',   icon: BarChart3,  impl: true },
    { key: 'sentiment_breakdown',  label: 'Sentiment breakdown',  icon: PieIcon,    impl: true },
    { key: 'sentiment_trend',      label: 'Sentiment over time',  icon: LineIcon,   impl: true },
    { key: 'label_performance',    label: 'Label performance',    icon: BarChart3,  impl: true },
  ],
};

function TypeStep({ category, setCategory, widgetType, setWidgetType, onNext }) {
  const widgets = WIDGETS_BY_CATEGORY[category] || [];
  return (
    <>
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => { setCategory(c.key); setWidgetType(null); }}
              className={clsx(
                'text-left rounded-xl border p-4 transition bg-white',
                category === c.key ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <c.icon className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-slate-900">{c.label}</span>
                {c.badge && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                    {c.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-snug">{c.desc}</p>
            </button>
          ))}
        </div>

        <h3 className="text-sm font-semibold text-slate-700 mb-3">Widgets supporting {category} metrics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {widgets.map(w => (
            <button
              key={w.key}
              type="button"
              disabled={!w.impl}
              onClick={() => setWidgetType(w.key)}
              className={clsx(
                'text-left rounded-xl border p-5 transition bg-white',
                widgetType === w.key ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200',
                w.impl ? 'hover:border-slate-300 cursor-pointer' : 'opacity-60 cursor-not-allowed'
              )}
            >
              <div className="h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg mb-3 flex items-center justify-center">
                <w.icon className="w-7 h-7 text-slate-400" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{w.label}</span>
                {!w.impl && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 inline-flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Soon
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-200 px-6 py-3 flex justify-end gap-2 bg-white">
        <button
          type="button"
          onClick={onNext}
          disabled={!widgetType}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </>
  );
}

// ── Step 2: pick metrics for the chosen widget ───────────────────────────────

function MetricStep({ title, setTitle, grouped, picked, toggle, onSave }) {
  return (
    <>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-5">
          <label className="block text-xs font-medium text-slate-600 mb-1">Widget title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Page key metrics"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <p className="text-xs text-slate-500 mb-3">Tick the metrics this widget should pull. Some are still being collected and are shown disabled.</p>

        {grouped.map(([section, list]) => (
          <div key={section} className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              {section}
            </h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {list.map(m => {
                const isPicked = picked.includes(m.key);
                const disabled = m.available === false;
                return (
                  <button
                    key={m.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(m.key)}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 py-2.5 text-left border-b border-slate-100 last:border-b-0',
                      isPicked && !disabled ? 'bg-blue-50/60' : 'bg-white',
                      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                        isPicked ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                      )}>
                        {isPicked && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-sm text-slate-800">{m.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 uppercase tracking-wider">
                      {m.deprecated && (
                        <span className="flex items-center gap-1 normal-case tracking-normal text-amber-700">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="text-[11px]">Deprecated Facebook metric</span>
                        </span>
                      )}
                      {disabled && !m.deprecated && <span className="text-amber-600">Coming soon</span>}
                      <PlatformIcons platforms={m.platforms} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 px-6 py-3 flex items-center justify-between bg-white">
        <span className="text-xs text-slate-500">{picked.length} metric{picked.length === 1 ? '' : 's'} selected</span>
        <button
          type="button"
          onClick={onSave}
          disabled={picked.length === 0}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          Create widget
        </button>
      </div>
    </>
  );
}

const PLATFORM_ICON_MAP = {
  facebook_page:      FacebookIcon,
  instagram_business: InstagramIcon,
  tiktok:             TiktokIcon,
  linkedin:           LinkedinIcon,
  youtube:            YoutubeIcon,
  pinterest:          PinterestIcon,
  twitter:            TwitterIcon,
};

// Render the small platform icons on the right of each metric row.
function PlatformIcons({ platforms = [] }) {
  return (
    <span className="flex items-center gap-1.5 text-slate-400">
      {platforms.map(p => {
        const Icon = PLATFORM_ICON_MAP[p];
        return Icon ? <Icon key={p} className="w-3.5 h-3.5" /> : null;
      })}
    </span>
  );
}
