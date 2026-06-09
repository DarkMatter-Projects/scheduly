import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useLayoutEffect, useEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Trash2, AlertTriangle, Pencil, Inbox, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link as LinkIcon, Image as ImageIcon, AlignLeft, Download } from 'lucide-react';
import { getWidgetData, updateWidget } from '../../api/dashboardsApi';

// Dashboard-level annotation context — populated at the dashboard
// builder level and consumed by TimeSeriesBody / SentimentTrendBody
// so they render vertical lines on the timeline without each widget
// having to fetch annotations itself.
export const AnnotationsContext = createContext([]);

// Widget data fetcher context. Defaults to the authenticated endpoint.
// SharedDashboardPage overrides it with a token-scoped fetcher so the
// public viewer can reuse this whole renderer file without forking.
export const WidgetDataFetcherContext = createContext({
  fetch: (widget) => getWidgetData(widget.id),
  keyParts: [],
});
import { uploadMedia } from '../../api/mediaApi';
import toast from 'react-hot-toast';
import KpiCard from '../common/KpiCard';
import ChartEmptyState from '../common/ChartEmptyState';
import { FacebookIcon, InstagramIcon, TiktokIcon } from '../common/SocialIcons';

const METRIC_COLORS = [
  '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#f59e0b',
  '#06b6d4', '#ef4444', '#6366f1', '#22c55e', '#f97316',
];

// Tailwind purges class names it can't see at build time. Dynamic strings
// like `lg:col-span-${n}` get dropped, which is why every widget was
// collapsing to single-column width. A static lookup keeps the classes
// in the bundle.
export const COL_SPAN = {
  1:  'lg:col-span-1',
  2:  'lg:col-span-2',
  3:  'lg:col-span-3',
  4:  'lg:col-span-4',
  5:  'lg:col-span-5',
  6:  'lg:col-span-6',
  7:  'lg:col-span-7',
  8:  'lg:col-span-8',
  9:  'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12',
};

// One renderer that switches on widgetType. Fetches its own data so each
// widget loads independently (a slow one doesn't block its siblings).
export default function WidgetRenderer({ widget, canEdit, onRemove }) {
  const w = Math.max(1, Math.min(12, widget.width || 4));
  const spanClass = COL_SPAN[w];
  const heightStyle = { minHeight: `${Math.max(160, (widget.height || 2) * 80)}px` };
  // Cached widget data so the export button can re-use what the body
  // already fetched instead of hitting the API again. We need the same
  // queryKey the WidgetBody uses, which means honouring the fetcher
  // context's keyParts (token suffix for shared-dashboard view).
  const queryClient = useQueryClient();
  const fetcher = useContext(WidgetDataFetcherContext);
  const cachedData = queryClient.getQueryData(['widget-data', widget.id, widget.updatedAt, ...(fetcher.keyParts || [])]);

  return (
    <div className={clsx('bg-white border border-slate-200 rounded-xl flex flex-col col-span-1 sm:col-span-2', spanClass)} style={heightStyle}>
      <div className="flex items-start justify-between px-4 pt-4">
        <div className="min-w-0 flex-1">
          <EditableTitle widget={widget} canEdit={canEdit} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => exportWidgetCsv(widget, cachedData)}
            className="p-1 text-slate-300 hover:text-blue-600"
            title="Export as CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          {canEdit && (
            <button
              onClick={onRemove}
              className="p-1 text-slate-300 hover:text-rose-600"
              title="Remove widget"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 px-4 pb-4 pt-2">
        <WidgetBody widget={widget} />
      </div>
    </div>
  );
}

// Walk the widget data response and serialise the rows array (or
// metrics array, or points array, or whatever the widget happens to
// have) into a CSV. Falls back to a full JSON dump when the shape
// isn't recognised, so the user always gets something downloadable.
function exportWidgetCsv(widget, data) {
  if (!data) {
    // Last resort — kick the user to JSON download if no data is cached.
    triggerDownload(`${widget.title || widget.widgetType}.json`, JSON.stringify({ message: 'No data loaded yet' }, null, 2));
    return;
  }
  const rows = data.rows || data.metrics || data.series?.[0]?.points || data.points || data.cards || null;
  if (!rows || rows.length === 0) {
    triggerDownload(`${widget.title || widget.widgetType}.csv`, 'No rows to export\n');
    return;
  }
  // Headers = union of all top-level keys across rows, but if a row
  // has a `cells` object, expand each cell to its own column.
  const expand = (r) => {
    const flat = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === 'cells' && v && typeof v === 'object') {
        for (const [cellKey, cellVal] of Object.entries(v)) {
          if (cellVal && typeof cellVal === 'object' && 'current' in cellVal) {
            flat[`${cellKey}_current`] = cellVal.current;
            flat[`${cellKey}_prior`]   = cellVal.prior;
          } else {
            flat[cellKey] = cellVal;
          }
        }
      } else if (v && typeof v === 'object') {
        // Skip nested objects we can't flatten — they'd come out as [object Object].
        // Time series points + similar already-flat objects pass through.
      } else {
        flat[k] = v;
      }
    }
    return flat;
  };
  const expanded = rows.map(expand);
  const headers = [...new Set(expanded.flatMap(r => Object.keys(r)))];
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(','),
    ...expanded.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');
  triggerDownload(`${widget.title || widget.widgetType}.csv`, csv);
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function WidgetBody({ widget }) {
  // Either the default getWidgetData(widget.id) or, when rendered
  // inside SharedDashboardPage, a token-scoped fetcher that hits the
  // public /api/dashboards/share/:token/widgets/:widgetId/data route.
  const fetcher = useContext(WidgetDataFetcherContext);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['widget-data', widget.id, widget.updatedAt, ...(fetcher.keyParts || [])],
    queryFn: () => fetcher.fetch(widget),
  });

  if (isLoading) return <div className="h-full flex items-center justify-center text-xs text-slate-400">Loading…</div>;
  if (isError) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-xs text-rose-600 px-4">
        <AlertTriangle className="w-5 h-5 mb-1" />
        Failed to load. {error?.response?.data?.error || error?.message}
      </div>
    );
  }

  switch (widget.widgetType) {
    case 'key_metrics':           return <KeyMetricsBody data={data} />;
    case 'time_series':           return <TimeSeriesBody data={data} />;
    case 'channel_comparison':    return <ChannelComparisonBody data={data} />;
    case 'channel_performance_table': return <ChannelPerformanceTableBody data={data} />;
    case 'network_comparison':    return <NetworkComparisonBody data={data} />;
    case 'breakdown':             return <BreakdownBody data={data} />;
    case 'content_performance':   return <ContentPerformanceBody data={data} />;
    case 'sentiment_breakdown':   return <SentimentBreakdownBody data={data} />;
    case 'sentiment_trend':       return <SentimentTrendBody data={data} />;
    case 'text_block':            return <TextBlockBody data={data} widget={widget} />;
    case 'metric_by_post_type':            return <MetricByPostTypeBody data={data} />;
    case 'metric_by_post_type_over_time':  return <MetricByPostTypeOverTimeBody data={data} />;
    case 'top_err_profiles':               return <TopErrProfilesBody data={data} />;
    case 'engagements_by_profile':         return <EngagementsByProfileBody data={data} />;
    case 'follow_non_follow_split':        return <FollowNonFollowBody data={data} />;
    case 'metric_organic_paid_split':      return <OrganicPaidSplitBody data={data} />;
    case 'reach_by_follower_type':         return <ReachByFollowerTypeBody data={data} />;
    case 'reach_by_distribution':          return <ReachByDistributionBody data={data} />;
    case 'engage_volume_by_network':       return <EngageVolumeByNetworkBody data={data} />;
    case 'engage_sentiment_by_network':    return <EngageSentimentByNetworkBody data={data} />;
    case 'engage_sentiment_by_channel':    return <EngageSentimentByChannelBody data={data} />;
    case 'engage_sentiment_kpi_group':     return <EngageSentimentKpiGroupBody data={data} />;
    case 'video_performance':              return <ContentPerformanceBody data={data} />;
    case 'longform_videos_performance':    return <PostTypePerformanceBody data={data} label="Long-form video" />;
    case 'shorts_performance':             return <PostTypePerformanceBody data={data} label="Short" />;
    case 'net_new_subscribers_by_country': return <YoutubeDimensionListBody data={data} label="Subscribers" valueFormat="number" />;
    case 'video_views_by_country':         return <YoutubeDimensionListBody data={data} label="Views" valueFormat="number" />;
    case 'watch_time_by_country':          return <YoutubeDimensionListBody data={data} label="Watch time" valueFormat="duration" />;
    case 'engagements_by_country':         return <YoutubeDimensionListBody data={data} label="Engagements" valueFormat="number" />;
    case 'top_sources_by_views':           return <YoutubeDimensionListBody data={data} label="Views" valueFormat="number" friendly={YT_SOURCE_LABEL} />;
    case 'shares_by_source':               return <YoutubeSharingDonutBody data={data} />;
    case 'reaction_breakdown':             return <ReactionBreakdownBody data={data} />;
    case 'followers_by_country':           return <FollowersByCountryBody data={data} />;
    case 'fans_by_age_gender':             return <FansByAgeGenderBody data={data} />;
    case 'reels_performance':              return <PostTypePerformanceBody data={data} label="Reel"  />;
    case 'story_performance':              return <PostTypePerformanceBody data={data} label="Story" />;
    case 'label_performance':
    case 'paid_performance':
    case 'reaction_breakdown':
    case 'demographics':
    case 'geographics':
    case 'views_from_source':
    case 'fans_online_hourly':
    case 'engage_sentiment_by_label':
    case 'engage_sentiment_kpi_group':
    case 'net_new_subscribers_by_country':
    case 'shares_by_source':
    case 'engagements_by_country':
    case 'top_sources_by_views':
    case 'video_views_by_country':
    case 'watch_time_by_country':
    case 'fans_by_function':
    case 'fans_by_seniority':
    case 'fans_by_association':            return <NoDataPlaceholder />;

    // (no other cases)
    default:
      return (
        <div className="h-full flex items-center justify-center text-center text-xs text-slate-400">
          The <code className="mx-1 px-1 bg-slate-100 rounded">{widget.widgetType}</code> widget hasn't shipped yet.
        </div>
      );
  }
}

// Friendly empty state for widget types that don't have data ingestion yet
// (label_performance, paid_performance, followers_by_country, etc.).
function NoDataPlaceholder() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-10">
      <Inbox className="w-12 h-12 mb-3" strokeWidth={1} />
      <p className="text-sm">No data available for the specified period and channels selected</p>
    </div>
  );
}

// ── Text block widget ──

// Minimal rich-text editor: contenteditable + execCommand toolbar.
// Saves the HTML on blur via updateWidget(config: { html }). Not building on
// a heavy editor library here — execCommand covers the formatting buttons in
// the reference toolbar and avoids a 100KB+ dependency for what's a static
// content block on a dashboard.
function TextBlockBody({ data, widget }) {
  const queryClient = useQueryClient();
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const savedRangeRef = useRef(null);
  const initialHtml = (widget.config && widget.config.html) ?? data?.html ?? '';
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Seed editor with stored html once; never overwrite on rerender so the
  // user's cursor + selection survive React's reconciliation.
  useEffect(() => {
    if (editorRef.current && !editorRef.current.dataset.seeded) {
      editorRef.current.innerHTML = initialHtml;
      editorRef.current.dataset.seeded = '1';
    }
  }, [initialHtml]);

  const mut = useMutation({
    mutationFn: (html) => updateWidget(widget.id, { config: { ...(widget.config || {}), html } }),
    onSuccess: () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'dashboard' }),
  });

  const save = () => {
    if (!dirty || !editorRef.current) return;
    mut.mutate(editorRef.current.innerHTML);
    setDirty(false);
  };

  // execCommand is deprecated but still the path of least resistance for a
  // tiny in-app editor — every modern browser still supports the basics.
  const cmd = (command, value) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    setDirty(true);
  };
  const cmdLink = () => {
    const url = window.prompt('Link URL');
    if (url) cmd('createLink', url);
  };
  // Picking an image opens the OS file dialog rather than asking for a URL.
  // The current caret position is captured first because clicking on the
  // file input blurs the editor and clears the selection — we restore it
  // before calling insertImage so the image lands where the user pointed.
  const cmdImage = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    } else {
      savedRangeRef.current = null;
    }
    fileInputRef.current?.click();
  };
  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Pick an image file');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadMedia([file]);
      // uploadMedia returns either an array of media records or an object
      // wrapping one. Normalize.
      const list = Array.isArray(res) ? res : (res.media || res.uploaded || res.files || [res]);
      const url = list[0]?.url || list[0]?.publicUrl;
      if (!url) throw new Error('Upload returned no URL');
      // Restore the caret to where it was when the user clicked the image
      // button, then insert the <img> there.
      editorRef.current?.focus();
      if (savedRangeRef.current) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
      cmd('insertImage', url);
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };
  const cmdHeading = (e) => {
    const tag = e.target.value;
    cmd('formatBlock', tag);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-2 mb-2 text-slate-600">
        <select onChange={cmdHeading} defaultValue="p" className="text-xs border border-slate-200 rounded px-1 py-0.5">
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <ToolbarBtn icon={Bold}          onClick={() => cmd('bold')}            label="Bold" />
        <ToolbarBtn icon={Italic}        onClick={() => cmd('italic')}          label="Italic" />
        <ToolbarBtn icon={UnderlineIcon} onClick={() => cmd('underline')}       label="Underline" />
        <ToolbarBtn icon={AlignLeft}     onClick={() => cmd('justifyLeft')}     label="Align" />
        <ToolbarBtn icon={ListOrdered}   onClick={() => cmd('insertOrderedList')} label="Numbered list" />
        <ToolbarBtn icon={List}          onClick={() => cmd('insertUnorderedList')} label="Bulleted list" />
        <ToolbarBtn icon={LinkIcon}      onClick={cmdLink}                      label="Insert link" />
        <ToolbarBtn icon={ImageIcon}     onClick={cmdImage}                     label={uploading ? 'Uploading…' : 'Upload image'} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFilePicked}
          className="hidden"
        />
        {uploading && <span className="text-[10px] text-slate-400 ml-1">Uploading…</span>}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => setDirty(true)}
        onBlur={save}
        className="flex-1 outline-none text-sm text-slate-700 leading-relaxed px-1 prose prose-sm max-w-none"
        style={{ minHeight: 80 }}
      />
    </div>
  );
}

function ToolbarBtn({ icon: Icon, onClick, label }) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="p-1 rounded hover:bg-slate-100 text-slate-600"
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

// ── Key metrics ──

function KeyMetricsBody({ data }) {
  const metrics = data?.metrics || [];
  if (metrics.length === 0) return <EmptyHint hint="No metrics selected for this widget." />;

  const hasAnyValue = metrics.some(m => Number(m.current) > 0 || Number(m.prior) > 0);
  if (!hasAnyValue) {
    return <EmptyHint hint="No data for this period yet. Publish posts or run the daily insights sync, then come back." />;
  }

  // Layout rules tuned to match the reference designs:
  //   1-2 metrics  → vertical stack so each card fills the widget width
  //                  (Avg. Daily Reach, Views, Organic vs Paid views…)
  //   3-6 metrics  → 2-column grid (Engagements breakdown,
  //                  Engaged users, etc.)
  //   7+ metrics   → 3-column grid (legacy Page key metrics row)
  let containerClass;
  if (metrics.length <= 2) {
    containerClass = 'flex flex-col gap-3 h-full';
  } else if (metrics.length <= 6) {
    containerClass = 'grid grid-cols-2 gap-3 h-full';
  } else {
    containerClass = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 h-full';
  }
  return (
    <div className={containerClass}>
      {metrics.map((m, idx) => (
        <KpiCard
          key={m.key}
          label={m.label}
          value={formatValue(m.current, m.format)}
          current={m.current}
          prior={m.prior}
          priorValue={formatValue(m.prior, m.format)}
          invertDelta={m.invertDelta}
          scope={m.scope}
          platforms={m.platforms}
          sparkData={Array.isArray(m.daily) && m.daily.length > 1 ? m.daily : null}
          sparkColor={METRIC_COLORS[idx % METRIC_COLORS.length]}
        />
      ))}
    </div>
  );
}

// ── Time series ──

function TimeSeriesBody({ data }) {
  const series = data?.series || [];
  const hasData = series.some(s => Array.isArray(s.points) && s.points.length > 0);
  if (!hasData) return <ChartEmptyState height={180} title="No data in range" hint="As soon as the underlying metric has values, this chart fills in." />;

  // Merge the series into a single array indexed by date for recharts.
  const allDates = new Set();
  series.forEach(s => (s.points || []).forEach(p => allDates.add(String(p.date).slice(0, 10))));
  const sortedDates = [...allDates].sort();
  const merged = sortedDates.map(d => {
    const row = { date: d };
    for (const s of series) {
      const hit = (s.points || []).find(p => String(p.date).slice(0, 10) === d);
      row[s.key] = hit ? hit.value : 0;
    }
    return row;
  });

  // 1-2 metrics render as soft area charts with gradients (matches the
  // reference design's Organic vs Paid / Follower vs Non-follower charts).
  // 3+ metrics use the multi-line layout — overlapping areas at that count
  // read as noise rather than comparison.
  if (series.length <= 2) {
    const palette = ['#6366f1', '#ec4899'];
    return (
      <ResponsiveContainer width="100%" height="100%" minHeight={180}>
        <AreaChart data={merged} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, i) => {
              const color = palette[i % palette.length];
              return (
                <linearGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => { try { return format(new Date(v), 'MMM d'); } catch { return v; } }}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickFormatter={(v) => formatCompact(v, series[0]?.format || 'number')}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            labelFormatter={(v) => { try { return format(new Date(v), 'MMM d, yyyy'); } catch { return v; } }}
            formatter={(v, name) => {
              const s = series.find(x => x.key === name);
              return [formatValue(v, s?.format || 'number'), s?.label || name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
          {series.map((s, i) => {
            const color = palette[i % palette.length];
            return (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label}
                    stroke={color} strokeWidth={2} fill={`url(#area-${s.key})`} isAnimationActive={false} />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={180}>
      <LineChart data={merged}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => { try { return format(new Date(v), 'MMM d'); } catch { return v; } }}
          tick={{ fontSize: 10, fill: '#94a3b8' }}
        />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <Tooltip
          labelFormatter={(v) => { try { return format(new Date(v), 'MMM d, yyyy'); } catch { return v; } }}
          formatter={(v, name) => {
            const s = series.find(x => x.key === name);
            return [formatValue(v, s?.format || 'number'), s?.label || name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <AnnotationMarkers points={merged} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={METRIC_COLORS[i % METRIC_COLORS.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// Render dashboard annotations as vertical ReferenceLine markers. We
// snap each annotation to the nearest series point by date so the
// line lands on the right X position regardless of timezone drift.
function AnnotationMarkers({ points }) {
  const annotations = useContext(AnnotationsContext);
  if (!annotations || annotations.length === 0 || !points || points.length === 0) return null;
  const dates = points.map(p => p.date);
  const start = new Date(dates[0]).getTime();
  const end   = new Date(dates[dates.length - 1]).getTime();
  return annotations
    .filter(a => {
      const t = new Date(a.occurredAt).getTime();
      return t >= start && t <= end;
    })
    .map(a => {
      // Snap to nearest existing X value so ReferenceLine actually shows.
      const target = new Date(a.occurredAt).getTime();
      let nearest = dates[0];
      let nearestDelta = Infinity;
      for (const d of dates) {
        const delta = Math.abs(new Date(d).getTime() - target);
        if (delta < nearestDelta) { nearest = d; nearestDelta = delta; }
      }
      return (
        <ReferenceLine
          key={a.id}
          x={nearest}
          stroke={a.color || '#6366f1'}
          strokeDasharray="3 3"
          label={{
            value: a.label,
            position: 'top',
            fontSize: 10,
            fill: a.color || '#6366f1',
            offset: 5,
          }}
        />
      );
    });
}

// ── Channel comparison ──

function ChannelComparisonBody({ data }) {
  const rows = data?.rows || [];
  if (rows.length === 0) return <EmptyHint hint="No accounts are in scope. Connect accounts on the Accounts page." />;
  const allZero = rows.every(r => Number(r.value) === 0);
  if (allZero) return <ChartEmptyState height={200} title="No data yet" hint="Once insights are fetched for the connected accounts, they'll appear here." />;

  const formatted = rows.map(r => ({
    name: r.accountName,
    value: Number(r.value) || 0,
  }));
  const metric = data?.metric;

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
      <BarChart data={formatted} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: '#475569' }} />
        <Tooltip
          formatter={(v) => [formatValue(v, metric?.format || 'number'), metric?.label || 'Value']}
          labelFormatter={(l) => l}
        />
        <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Network comparison (bar chart grouped by platform) ──

const PLATFORM_LABEL = {
  facebook_page: 'Facebook',
  instagram_business: 'Instagram',
  tiktok: 'TikTok',
};
const PLATFORM_COLOR = {
  facebook_page: '#1877f2',
  instagram_business: '#e4405f',
  tiktok: '#000000',
};

function NetworkComparisonBody({ data }) {
  const rows = data?.rows || [];
  if (rows.length === 0) return <EmptyHint hint="Connect at least one account to see network comparison." />;
  const allZero = rows.every(r => Number(r.value) === 0);
  if (allZero) return <ChartEmptyState height={200} title="No data yet" hint="Once insights sync, networks appear here." />;

  const formatted = rows.map(r => ({
    name: PLATFORM_LABEL[r.platform] || r.platform,
    platform: r.platform,
    value: Number(r.value) || 0,
  }));
  const metric = data?.metric;

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
      <BarChart data={formatted} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: '#475569' }} />
        <Tooltip formatter={(v) => [formatValue(v, metric?.format || 'number'), metric?.label || 'Value']} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {formatted.map((entry, idx) => (
            <Cell key={idx} fill={PLATFORM_COLOR[entry.platform] || METRIC_COLORS[idx]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Breakdown (pie chart of share by account) ──

function BreakdownBody({ data }) {
  const rows = (data?.rows || []).filter(r => Number(r.value) > 0);
  if (rows.length === 0) return <ChartEmptyState height={200} title="No data yet" hint="As soon as the metric has values, the breakdown fills in." />;
  const metric = data?.metric;

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={220}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="accountName"
          innerRadius="45%"
          outerRadius="80%"
          paddingAngle={1}
          isAnimationActive={false}
        >
          {rows.map((_, idx) => (
            <Cell key={idx} fill={METRIC_COLORS[idx % METRIC_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v, _name, entry) => {
            const share = entry?.payload?.share || 0;
            return [`${formatValue(v, metric?.format || 'number')} (${share.toFixed(1)}%)`, entry?.payload?.accountName];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Sentiment breakdown (donut + counts) ──

const SENTIMENT_COLORS = {
  positive: '#10b981',
  neutral:  '#94a3b8',
  negative: '#ef4444',
};
const SENTIMENT_LABEL = {
  positive: 'Positive',
  neutral:  'Neutral',
  negative: 'Negative',
};

function SentimentBreakdownBody({ data }) {
  const rows = data?.rows || [];
  const total = Number(data?.total) || 0;
  if (total === 0) {
    return <ChartEmptyState height={200} title="No messages yet" hint="Once incoming comments and DMs are ingested, the sentiment split appears here." />;
  }
  const display = rows.map(r => ({
    name: SENTIMENT_LABEL[r.sentiment] || r.sentiment,
    sentiment: r.sentiment,
    value: Number(r.value) || 0,
    share: Number(r.share) || 0,
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full">
      <ResponsiveContainer width="100%" height="100%" minHeight={180}>
        <PieChart>
          <Pie
            data={display}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={1}
            isAnimationActive={false}
          >
            {display.map(r => (
              <Cell key={r.sentiment} fill={SENTIMENT_COLORS[r.sentiment]} />
            ))}
          </Pie>
          <Tooltip formatter={(v, _n, e) => [`${v} (${(e.payload.share || 0).toFixed(1)}%)`, e.payload.name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col justify-center space-y-2 px-2">
        {display.map(r => (
          <div key={r.sentiment} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SENTIMENT_COLORS[r.sentiment] }} />
            <span className="text-xs text-slate-600 flex-1">{r.name}</span>
            <span className="text-xs font-semibold text-slate-900 tabular-nums">{r.value}</span>
            <span className="text-[10px] text-slate-400 tabular-nums w-12 text-right">{r.share.toFixed(1)}%</span>
          </div>
        ))}
        <div className="border-t border-slate-100 pt-2 mt-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">Total messages</span>
          <span className="text-xs font-bold text-slate-900">{total}</span>
        </div>
      </div>
    </div>
  );
}

// ── Channel performance table (multi-metric, per-channel rows) ──

function ChannelPerformanceTableBody({ data }) {
  const rows = data?.rows || [];
  const columns = data?.columns || [];
  const totals = data?.totals || {};
  const range = data?.range || {};
  if (rows.length === 0) {
    return <EmptyHint hint="No channels in scope for this widget." />;
  }
  return (
    <div className="overflow-x-auto overflow-y-visible h-full -mx-1">
      <table className="min-w-full text-xs">
        <thead>
          {/* Header row: column name above the aggregate total + delta.
              Mirrors the reference design where the top row is the
              "all-channels" summary and the per-channel rows sit below. */}
          <tr className="border-b border-slate-200">
            <th className="px-2 py-3 text-left">
              <span className="text-[10px] uppercase tracking-wider font-medium text-slate-500">Channel</span>
            </th>
            {columns.map(c => {
              const t = totals[c.key] || { current: 0, prior: 0 };
              return (
                <th key={c.key} className="px-2 py-3 text-left whitespace-nowrap font-normal align-bottom">
                  <div className="text-[10px] uppercase tracking-wider font-medium text-slate-500">{c.label}</div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-base font-bold text-slate-900 tabular-nums">{formatCompact(t.current, c.format)}</span>
                    <DeltaPill current={t.current} prior={t.prior} invertDelta={c.invertDelta} />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.socialAccountId} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-2 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ChannelAvatar row={row} />
                  <span className="text-slate-800 font-medium truncate">{row.accountName}</span>
                </div>
              </td>
              {columns.map(c => {
                const cell = row.cells?.[c.key] || { current: 0, prior: 0 };
                return (
                  <td key={c.key} className="px-2 py-3 whitespace-nowrap">
                    <CellWithHover row={row} column={c} cell={cell} range={range} compact />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Short form used in the table cells / header — "222,7K" instead of "222,734".
function formatCompact(value, format) {
  const n = Number(value) || 0;
  if (format === 'percent')    return `${n.toFixed(2)}%`;
  if (format === 'multiplier') return `${n.toFixed(2)}x`;
  if (format === 'currency') {
    return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
  }
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 });
  }
  return n.toLocaleString();
}

// Cell + on-hover popover. Renders the popover in a portal so it can
// escape the table's overflow-x-auto without getting clipped.
function CellWithHover({ row, column, cell, range, compact }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    // Place popover above the cell, centred. The popover is fixed-positioned
    // so it floats above any parent overflow.
    setPos({ top: r.top + window.scrollY - 8, left: r.left + window.scrollX + r.width / 2 });
  }, [open]);

  // Stack value above delta when in compact mode so per-channel rows match
  // the reference design (number on top, ▲/▼ % beneath).
  return (
    <>
      <div
        ref={ref}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={clsx('cursor-default', compact ? 'flex flex-col' : 'flex items-baseline gap-1.5')}
      >
        <span className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">
          {compact ? formatCompact(cell.current, column.format) : formatValue(cell.current, column.format)}
        </span>
        <DeltaPill current={cell.current} prior={cell.prior} invertDelta={column.invertDelta} />
      </div>
      {open && createPortal(
        <CellHoverCard row={row} column={column} cell={cell} range={range} pos={pos} />,
        document.body
      )}
    </>
  );
}

function CellHoverCard({ row, column, cell, range, pos }) {
  const Icon = PLATFORM_ICON[row.platform];
  const pct = cell.prior > 0
    ? ((cell.current - cell.prior) / Math.abs(cell.prior)) * 100
    : (cell.current > 0 ? 100 : 0);
  const isUp = pct > 0;
  const good = column.invertDelta ? !isUp : isUp;
  const priorWindow = (range.priorStartDay && range.priorEndDay)
    ? `${formatRangeDate(range.priorStartDay)} - ${formatRangeDate(range.priorEndDay)}`
    : (range.priorStart && range.priorEnd
        ? `${formatRangeDate(String(range.priorStart).slice(0,10))} - ${formatRangeDate(String(range.priorEnd).slice(0,10))}`
        : 'the previous period');

  const scopeLabel = column.scope === 'engage'  ? 'Engage metric'
                   : column.scope === 'content' ? 'Content metric'
                   :                              'Channel metric';
  const scopeFooter = column.scope === 'engage'
    ? 'Inbox activity within date range'
    : column.scope === 'content'
      ? 'Activity within date range on posts published in this range'
      : 'Activity within date range on any post or elsewhere on channel';

  return (
    <div
      style={{ position: 'absolute', top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)', zIndex: 60 }}
      className="w-72 pointer-events-none"
    >
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-3 text-left">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          {Icon ? <Icon className="w-3 h-3 text-slate-500" /> : null}
          <span>{column.label}</span>
        </div>
        <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
          {formatValue(cell.current, column.format)}
        </div>
        {(cell.prior > 0 || cell.current > 0) && (
          <div className={clsx('mt-0.5 text-[11px] font-medium', good ? 'text-emerald-600' : 'text-rose-600')}>
            {isUp ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}% compared to the previous period ({priorWindow})
          </div>
        )}
        {column.description && (
          <p className="mt-2 text-[11px] leading-snug text-slate-600">{column.description}</p>
        )}
        <div className="mt-2.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {scopeLabel}
          </span>
          <span className="text-[10px] text-slate-400">{scopeFooter}</span>
        </div>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-white border-r border-b border-slate-200 rotate-45" />
    </div>
  );
}

function formatRangeDate(d) {
  try { return format(new Date(d), 'd MMM yyyy'); } catch { return d; }
}

function ChannelAvatar({ row }) {
  const Icon = PLATFORM_ICON[row.platform];
  if (row.profilePictureUrl) {
    return (
      <div className="relative flex-shrink-0">
        <img src={row.profilePictureUrl} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full object-cover bg-slate-100" />
        {Icon && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-white flex items-center justify-center">
            <Icon className="w-2 h-2 text-slate-700" />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
      {Icon ? <Icon className="w-3.5 h-3.5 text-slate-500" /> : null}
    </div>
  );
}

function DeltaPill({ current, prior, invertDelta }) {
  if (current == null || prior == null) return null;
  if (current === 0 && prior === 0) return null;
  if (prior === 0) {
    return <span className="text-[10px] font-semibold text-emerald-600">new</span>;
  }
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-[10px] text-slate-400">—</span>;
  const isUp = pct > 0;
  const good = invertDelta ? !isUp : isUp;
  return (
    <span className={clsx(
      'text-[10px] font-semibold',
      good ? 'text-emerald-600' : 'text-rose-600',
    )}>
      {isUp ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Sentiment trend (stacked area over time) ──

function SentimentTrendBody({ data }) {
  const points = data?.points || [];
  const anyValue = points.some(p => p.positive + p.neutral + p.negative + (p.uncategorized || 0) > 0);
  if (!anyValue) {
    return <ChartEmptyState height={200} title="No messages in range" hint="Sentiment over time appears once incoming comments and DMs are ingested." />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
      <AreaChart data={points}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => { try { return format(new Date(v), 'MMM d'); } catch { return v; } }}
          tick={{ fontSize: 10, fill: '#94a3b8' }}
        />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <Tooltip labelFormatter={(v) => { try { return format(new Date(v), 'MMM d, yyyy'); } catch { return v; } }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        <Area type="monotone" dataKey="positive"      stackId="1" stroke={SENTIMENT_COLORS.positive} fill={SENTIMENT_COLORS.positive} fillOpacity={0.8} name="Positive messages"      isAnimationActive={false} />
        <Area type="monotone" dataKey="neutral"       stackId="1" stroke={SENTIMENT_COLORS.neutral}  fill={SENTIMENT_COLORS.neutral}  fillOpacity={0.8} name="Neutral messages"       isAnimationActive={false} />
        <Area type="monotone" dataKey="negative"      stackId="1" stroke={SENTIMENT_COLORS.negative} fill={SENTIMENT_COLORS.negative} fillOpacity={0.8} name="Negative messages"      isAnimationActive={false} />
        <Area type="monotone" dataKey="uncategorized" stackId="1" stroke="#6366f1"                    fill="#6366f1"                    fillOpacity={0.6} name="Uncategorized messages" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Content performance (top-N posts table) ──

const PLATFORM_ICON = {
  facebook_page: FacebookIcon,
  instagram_business: InstagramIcon,
  tiktok: TiktokIcon,
};

// Metadata for the Content Performance table columns — drives the
// per-cell hover popovers (label, format, description, scope) the same
// way Performance by Channel's column metadata does.
const CONTENT_COLUMNS = [
  { key: 'reactions',       label: 'Reactions',        format: 'number',     scope: 'content',
    description: 'Reactions on the post — likes on IG/TikTok/X/Pinterest, the Like/Love/Haha/Wow/Sad/Angry set on Facebook.' },
  { key: 'impressions',     label: 'Impressions',      format: 'number',     scope: 'content',
    description: 'Total number of times the post was displayed, including reels, posts and stories.' },
  { key: 'reachAvg',        label: 'Reach avg.',       format: 'number',     scope: 'content',
    description: 'The number of unique people who saw the post in their feed.' },
  { key: 'engagements',     label: 'Engagements',      format: 'number',     scope: 'content',
    description: 'Sum of reactions, comments, shares, saves and reposts on the post.' },
  { key: 'engagementRate',  label: 'Engagement rate',  format: 'percent',    scope: 'content',
    description: 'Engagements as a percentage of impressions. Formula: 100 * Engagements / Impressions.' },
  { key: 'videoViews',      label: 'Video views',      format: 'number',     scope: 'content',
    description: 'Number of times the video was viewed. Returns N/A for posts without video media.' },
];

function ContentPerformanceBody({ data }) {
  const rows = data?.rows || [];
  if (rows.length === 0) return <ChartEmptyState height={180} title="No posts in range" hint="Publish posts in the selected period to see top performers." />;
  const sortBy = data?.sortBy;

  // Derived per-row metrics:
  //   reactions       = likes (the platform-specific "reaction" count we collect)
  //   engagements     = likes + comments + shares + saves + reposts
  //   reachAvg        = the post's reach value
  //   engagementRate  = engagements / impressions, as a percentage
  //   videoViews      = impressions for video posts; null for non-video so
  //                     the cell renders "N/A" instead of a misleading 0
  const enriched = rows.map(r => {
    const reactions = r.likes || 0;
    const engagements = (r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0) + (r.reposts || 0);
    const reachAvg = r.reach || 0;
    const impressions = r.impressions || 0;
    const engagementRate = impressions > 0 ? (engagements / impressions) * 100 : 0;
    const isVideo = (r.mediaMime || '').startsWith('video/');
    const videoViews = isVideo ? impressions : null;
    return { ...r, reactions, impressions, reachAvg, engagements, engagementRate, videoViews };
  });

  return (
    <div className="overflow-auto overflow-y-visible h-full -mx-1">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-white border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
          <tr>
            <th className="px-2 py-2 text-left font-semibold">Post</th>
            {CONTENT_COLUMNS.map(c => (
              <th key={c.key} className="px-2 py-2 text-right font-semibold whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {enriched.map((r) => {
            const Icon = PLATFORM_ICON[r.platform];
            const isVideo = (r.mediaMime || '').startsWith('video/');
            return (
              <tr key={r.postId} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2">
                  <div className="flex items-start gap-2">
                    <PostThumb url={r.thumbnailUrl} isVideo={isVideo} Icon={Icon} />
                    <div className="min-w-0">
                      <div className="text-slate-800 line-clamp-2">{r.content || '(no caption)'}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        {Icon ? <Icon className="w-3 h-3 text-slate-400" /> : null}
                        <span>{r.accountName} · {r.publishedAt ? format(new Date(r.publishedAt), 'MMM d') : ''}</span>
                      </div>
                    </div>
                  </div>
                </td>
                {CONTENT_COLUMNS.map(c => {
                  const value = r[c.key];
                  if (value === null || value === undefined) {
                    return (
                      <td key={c.key} className="px-2 py-2 text-right tabular-nums text-slate-400">N/A</td>
                    );
                  }
                  return (
                    <td key={c.key} className="px-2 py-2 text-right tabular-nums text-slate-700">
                      <ContentCellHover platform={r.platform} column={c} value={value} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sortBy && (
        <p className="text-[10px] text-slate-400 mt-2 px-2">Top 10 by {sortBy.label}</p>
      )}
    </div>
  );
}

// Per-cell hover popover for Content Performance — same shape as
// CellHoverCard on the Performance-by-channel table (column label +
// big value + description + scope badge), minus the delta sentence
// since per-post values don't have a "previous period" to compare to.
function ContentCellHover({ platform, column, value }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.top + window.scrollY - 8, left: r.left + window.scrollX + r.width / 2 });
  }, [open]);

  const display = column.format === 'multiplier'
    ? `${(Number(value) || 0).toFixed(2)}X`
    : column.format === 'percent'
      ? `${(Number(value) || 0).toFixed(2)}%`
      : formatCompact(value, 'number');

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="cursor-default"
      >
        {display}
      </span>
      {open && createPortal(
        <ContentHoverCard platform={platform} column={column} value={value} display={display} pos={pos} />,
        document.body
      )}
    </>
  );
}

function ContentHoverCard({ platform, column, value, display, pos }) {
  const Icon = PLATFORM_ICON[platform];
  const scopeLabel = column.scope === 'engage'  ? 'Engage metric'
                   : column.scope === 'content' ? 'Content metric'
                   :                              'Channel metric';
  return (
    <div
      style={{ position: 'absolute', top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)', zIndex: 60 }}
      className="w-72 pointer-events-none"
    >
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-3 text-left">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          {Icon ? <Icon className="w-3 h-3 text-slate-500" /> : null}
          <span>{column.label}</span>
        </div>
        <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{display}</div>
        {column.description && (
          <p className="mt-2 text-[11px] leading-snug text-slate-600">{column.description}</p>
        )}
        <div className="mt-2.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {scopeLabel}
          </span>
        </div>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-white border-r border-b border-slate-200 rotate-45" />
    </div>
  );
}

// Square thumbnail in the Post column. Falls back to the platform icon
// for posts without attached media (e.g. text-only).
function PostThumb({ url, isVideo, Icon }) {
  if (url) {
    return (
      <div className="relative w-10 h-10 rounded overflow-hidden bg-slate-100 flex-shrink-0">
        {isVideo
          ? <video src={url} preload="metadata" className="w-full h-full object-cover" muted />
          : <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
        {Icon && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center">
            <Icon className="w-2 h-2 text-slate-700" />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center flex-shrink-0">
      {Icon ? <Icon className="w-4 h-4 text-slate-400" /> : null}
    </div>
  );
}

// ── Metric by post type (bar chart) ──

// Friendly labels for the post_type enum + future Reel/Story values.
const POST_TYPE_LABEL = {
  text:     'Text',
  image:    'Photo or video',
  video:    'Photo or video',
  carousel: 'Carousel',
  reel:     'Reel',
  story:    'Story',
};

function MetricByPostTypeBody({ data }) {
  const rows = data?.rows || [];
  if (rows.length === 0) {
    return <ChartEmptyState height={180} title="No data in range" hint="Publish posts in the selected period to see the breakdown." />;
  }
  const metric = data?.metric;
  const display = rows.map(r => ({
    name: POST_TYPE_LABEL[r.postType] || r.postType,
    value: Number(r.current) || 0,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={180}>
      <BarChart data={display} margin={{ top: 16, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => formatCompact(v, metric?.format || 'number')} tickLine={false} axisLine={false} width={50} />
        <Tooltip formatter={(v) => [formatValue(v, metric?.format || 'number'), metric?.label || 'Value']} />
        <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 10, fill: '#64748b', formatter: (v) => formatCompact(v, metric?.format || 'number') }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Metric by post type over time (multi-series line chart) ──

function MetricByPostTypeOverTimeBody({ data }) {
  const series = data?.series || [];
  const hasData = series.some(s => (s.points || []).some(p => Number(p.value) > 0));
  if (!hasData) {
    return <ChartEmptyState height={200} title="No data in range" hint="Publish posts in the selected period to see the per-post-type trend." />;
  }
  const allDates = new Set();
  series.forEach(s => (s.points || []).forEach(p => allDates.add(String(p.date).slice(0,10))));
  const dates = [...allDates].sort();
  const merged = dates.map(d => {
    const row = { date: d };
    for (const s of series) {
      const hit = (s.points || []).find(p => String(p.date).slice(0,10) === d);
      row[s.key] = hit ? hit.value : 0;
    }
    return row;
  });
  const POST_COLORS = { image: '#06b6d4', video: '#06b6d4', text: '#94a3b8', carousel: '#10b981', reel: '#8b5cf6', story: '#ec4899' };
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
      <LineChart data={merged}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(v) => { try { return format(new Date(v), 'MMM d'); } catch { return v; } }} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <Tooltip labelFormatter={(v) => { try { return format(new Date(v), 'MMM d, yyyy'); } catch { return v; } }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={POST_TYPE_LABEL[s.key] || s.key} stroke={POST_COLORS[s.key] || METRIC_COLORS[i % METRIC_COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Top ERR Profiles (channel table ranked by engagement_rate_reach) ──

function TopErrProfilesBody({ data }) {
  const rows = data?.rows || [];
  if (rows.length === 0) return <EmptyHint hint="No channels in scope." />;
  const total = data?.total || { current: 0, prior: 0 };
  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-slate-200 pb-2 mb-2 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider font-medium text-slate-500">Engagement rate (reach)</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-base font-bold text-slate-900 tabular-nums">{Number(total.current).toFixed(2)}%</span>
          <DeltaPill current={total.current} prior={total.prior} />
        </span>
      </div>
      <div className="overflow-auto -mx-1">
        <table className="min-w-full text-xs">
          <tbody>
            {rows.map(r => (
              <tr key={r.socialAccountId} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChannelAvatar row={r} />
                    <span className="text-slate-800 truncate">{r.accountName}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">{Number(r.current).toFixed(2)}%</span>
                    <DeltaPill current={r.current} prior={r.prior} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Engagements by Profile (per-channel table, columns per post type) ──

function EngagementsByProfileBody({ data }) {
  const rows = data?.rows || [];
  const columns = data?.columns || [];
  const totals = data?.totals || {};
  if (rows.length === 0) return <EmptyHint hint="No channels in scope." />;
  const columnHeader = (c) => (c === 'paid' ? 'Paid' : (POST_TYPE_LABEL[c] || c)) + ' engagements';
  return (
    <div className="overflow-auto overflow-y-visible h-full -mx-1">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="px-2 py-3 text-left">
              <span className="text-[10px] uppercase tracking-wider font-medium text-slate-500">Channel</span>
            </th>
            {columns.map(c => {
              const t = totals[c] || { current: 0, prior: 0 };
              return (
                <th key={c} className="px-2 py-3 text-left whitespace-nowrap font-normal align-bottom">
                  <div className="text-[10px] uppercase tracking-wider font-medium text-slate-500">{columnHeader(c)}</div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-base font-bold text-slate-900 tabular-nums">{formatCompact(t.current, 'number')}</span>
                    <DeltaPill current={t.current} prior={t.prior} />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.socialAccountId} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-2 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ChannelAvatar row={r} />
                  <span className="text-slate-800 font-medium truncate">{r.accountName}</span>
                </div>
              </td>
              {columns.map(c => {
                const cell = r.cells?.[c] || { current: 0, prior: 0 };
                // Per-row Paid cells are intentionally null (we can't tie
                // ad spend back to a specific social account from the
                // current schema). Show "N/A" so the column reads as
                // intentional rather than zero.
                if (cell.current == null) {
                  return (
                    <td key={c} className="px-2 py-3 whitespace-nowrap">
                      <span className="text-sm text-slate-400 tabular-nums">N/A</span>
                    </td>
                  );
                }
                return (
                  <td key={c} className="px-2 py-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">{formatCompact(cell.current, 'number')}</span>
                      <DeltaPill current={cell.current} prior={cell.prior} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Reels / Story performance (card grid filtered by post_type) ──

function PostTypePerformanceBody({ data, label }) {
  const rows = data?.rows || [];
  if (rows.length === 0) {
    return <ChartEmptyState height={200} title={`No ${label}s in range`} hint={`Publish ${label}s in the selected period to see them here.`} />;
  }
  // Aggregate top-row totals (Posts / Views / Reach avg. / Engagements / ER reach).
  const totalPosts = rows.length;
  const totalViews = rows.reduce((s, r) => s + (r.views || 0), 0);
  const totalReach = rows.reduce((s, r) => s + (r.reach || 0), 0);
  const totalEngagements = rows.reduce((s, r) => s + (r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0), 0);
  const avgReach = totalPosts > 0 ? totalReach / totalPosts : 0;
  const errReach = totalReach > 0 ? (totalEngagements / totalReach) * 100 : 0;

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-slate-200 pb-3 mb-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <SummaryStat label="Posts"       value={totalPosts.toLocaleString()} />
        <SummaryStat label="Views"       value={formatCompact(totalViews, 'number')} />
        <SummaryStat label="Reach avg."  value={formatCompact(avgReach, 'number')} />
        <SummaryStat label="Engagements" value={formatCompact(totalEngagements, 'number')} />
        <SummaryStat label="ER (reach)"  value={`${errReach.toFixed(2)}%`} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-auto">
        {rows.map(r => {
          const isVideo = (r.mediaMime || '').startsWith('video/');
          const interactions = (r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0);
          const er = r.reach > 0 ? (interactions / r.reach) * 100 : 0;
          return (
            <div key={r.postId} className="border border-slate-200 rounded-lg p-2.5 flex flex-col gap-2 bg-white">
              <div className="text-[10px] text-slate-400">{r.publishedAt ? format(new Date(r.publishedAt), 'd MMM HH:mm') : ''}</div>
              {r.thumbnailUrl ? (
                isVideo
                  ? <video src={r.thumbnailUrl} preload="metadata" className="w-full h-32 object-cover rounded bg-slate-100" muted />
                  : <img src={r.thumbnailUrl} alt="" className="w-full h-32 object-cover rounded bg-slate-100" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-32 rounded bg-slate-100" />
              )}
              <div className="text-xs text-slate-800 line-clamp-2">{r.content || '(no caption)'}</div>
              <dl className="text-[11px] text-slate-600 grid grid-cols-2 gap-x-2 gap-y-0.5 mt-auto">
                <dt>Views</dt>          <dd className="text-right font-semibold text-slate-900">{formatCompact(r.views, 'number')}</dd>
                <dt>Reach</dt>          <dd className="text-right font-semibold text-slate-900">{formatCompact(r.reach, 'number')}</dd>
                <dt>Engagements</dt>    <dd className="text-right font-semibold text-slate-900">{interactions.toLocaleString()}</dd>
                <dt>ER (reach)</dt>     <dd className="text-right font-semibold text-slate-900">{er.toFixed(2)}%</dd>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-medium text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-900 tabular-nums truncate">{value}</div>
    </div>
  );
}

// ── FB reaction breakdown (horizontal bar list with emoji) ──

function ReactionBreakdownBody({ data }) {
  const rows = data?.rows || [];
  if (!rows.some(r => r.value > 0)) {
    return <ChartEmptyState height={180} title="No reactions in range" hint="Page reaction breakdown appears once channel insights are ingested." />;
  }
  const max = Math.max(...rows.map(r => r.value), 0);
  const COLORS = { like: '#2563eb', love: '#ec4899', haha: '#f59e0b', wow: '#a855f7', sad: '#64748b', angry: '#ef4444' };
  return (
    <div className="h-full overflow-auto">
      <ul className="divide-y divide-slate-100 text-xs">
        {rows.map(r => (
          <li key={r.key} className="flex items-center gap-2 py-1.5">
            <span className="w-5 text-base text-center">{r.emoji}</span>
            <span className="text-slate-700 w-12">{r.label}</span>
            <span className="text-slate-900 font-semibold tabular-nums w-16 text-right">{formatCompact(r.value, 'number')}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
              <div className="h-full rounded" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%`, backgroundColor: COLORS[r.key] || '#6366f1' }} />
            </div>
            <span className="text-[10px] text-slate-400 tabular-nums w-12 text-right">{r.share.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── YouTube dimension renderers ──

// Friendly labels for YT's insightTrafficSourceType. Keys are the
// canonical enum names returned by the Analytics API.
const YT_SOURCE_LABEL = {
  ADVERTISING:        'Advertising',
  ANNOTATION:         'Annotation',
  CAMPAIGN_CARD:      'Card',
  END_SCREEN:         'End screen',
  EXT_APP:            'External app',
  EXT_URL:            'External URL',
  HASHTAGS:           'Hashtags',
  LIVE_REDIRECT:      'Live redirect',
  NO_LINK_EMBEDDED:   'Embedded video',
  NO_LINK_OTHER:      'Direct or other',
  NOTIFICATION:       'Notifications',
  PLAYLIST:           'Playlist',
  PROMOTED:           'Promoted',
  RELATED_VIDEO:      'Suggested video',
  SEARCH:             'YouTube search',
  SHORTS:             'Shorts feed',
  SHORTS_CONTENT_LINKS: 'Shorts content links',
  SUBSCRIBER:         'Subscribers',
  YT_CHANNEL:         'Channel page',
  YT_OTHER_PAGE:      'Other YT page',
  YT_PLAYLIST_PAGE:   'Playlist page',
  YT_SEARCH:          'YouTube search',
};

function YoutubeDimensionListBody({ data, label, valueFormat = 'number', friendly }) {
  const rows = data?.rows || [];
  if (rows.length === 0) {
    return <ChartEmptyState height={200} title="No data yet" hint="Per-dimension data appears once the YouTube Analytics cron runs." />;
  }
  const max = Math.max(...rows.map(r => r.value), 0);
  const fmt = (v) => {
    if (valueFormat === 'duration') {
      const totalMinutes = Math.round(v / 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }
    return formatCompact(v, 'number');
  };
  return (
    <div className="h-full overflow-auto">
      <ul className="divide-y divide-slate-100 text-xs">
        {rows.map(r => (
          <li key={r.key} className="flex items-center gap-2 py-1.5">
            <span className="text-slate-700 truncate w-36">{friendly ? (friendly[r.key] || r.key) : r.key}</span>
            <span className="text-slate-900 font-semibold tabular-nums w-16 text-right">{fmt(r.value)}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
              <div className="h-full bg-indigo-400 rounded" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Sharing services donut — keys come back as FACEBOOK / WHATSAPP /
// COPY_PASTE / etc.; we humanise them via a small map.
const YT_SHARING_LABEL = {
  FACEBOOK:           'Facebook',
  WHATSAPP:           'WhatsApp',
  WHATSAPP_BUSINESS:  'WhatsApp Business',
  COPY_PASTE:         'Copy link',
  EMBED:              'Embed',
  EMAIL:              'Email',
  TWITTER:            'X',
  REDDIT:             'Reddit',
  PINTEREST:          'Pinterest',
  LINKEDIN:           'LinkedIn',
  DIRECT_SYSTEM_ACTIVITY_DIALOG: 'System share',
  OTHER:              'Other',
};
const DONUT_COLORS = ['#6366f1','#ec4899','#06b6d4','#f59e0b','#10b981','#8b5cf6','#ef4444','#3b82f6','#22c55e','#f97316'];

function YoutubeSharingDonutBody({ data }) {
  const rows = (data?.rows || []).filter(r => r.value > 0);
  if (rows.length === 0) {
    return <ChartEmptyState height={200} title="No shares in range" hint="Donut populates once viewers share your videos." />;
  }
  const display = rows.map((r, i) => ({
    name: YT_SHARING_LABEL[r.key] || r.key,
    value: r.value,
    share: r.share,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full">
      <ResponsiveContainer width="100%" height="100%" minHeight={200}>
        <PieChart>
          <Pie data={display} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={1} isAnimationActive={false}>
            {display.map(r => <Cell key={r.name} fill={r.color} />)}
          </Pie>
          <Tooltip formatter={(v, _n, e) => [`${formatCompact(v, 'number')} (${(e.payload.share || 0).toFixed(1)}%)`, e.payload.name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col justify-center space-y-1.5 px-2 text-xs overflow-auto">
        {display.map(r => (
          <div key={r.name} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
            <span className="text-slate-600 flex-1 truncate">{r.name}</span>
            <span className="text-slate-900 font-semibold tabular-nums">{formatCompact(r.value, 'number')}</span>
            <span className="text-[10px] text-slate-400 tabular-nums w-12 text-right">{r.share.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Followers by country (scrollable list with bars) ──

function FollowersByCountryBody({ data }) {
  const rows = data?.rows || [];
  if (rows.length === 0) {
    return <ChartEmptyState height={200} title="No data yet" hint="Country breakdown appears once channel_demographics has been ingested." />;
  }
  const max = Math.max(...rows.map(r => r.value), 0);
  return (
    <div className="h-full overflow-auto">
      <ul className="divide-y divide-slate-100 text-xs">
        {rows.map(r => (
          <li key={r.key} className="flex items-center gap-2 py-1.5">
            <span className="text-slate-700 truncate w-28">{r.key}</span>
            <span className="text-slate-900 font-semibold tabular-nums w-16 text-right">{formatCompact(r.value, 'number')}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
              <div className="h-full bg-indigo-400 rounded" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Fans by age and gender (grouped bar chart) ──

function FansByAgeGenderBody({ data }) {
  const rows = data?.rows || [];
  if (rows.length === 0) {
    return <ChartEmptyState height={220} title="No data yet" hint="Age + gender breakdown appears once channel_demographics has been ingested." />;
  }
  // Pivot F.25-34 / M.18-24 / U.65+ into { ageBucket, Female, Male, Unknown }.
  const buckets = new Map();
  for (const r of rows) {
    const [g, age] = r.key.split('.');
    if (!age) continue;
    if (!buckets.has(age)) buckets.set(age, { age, Female: 0, Male: 0, Unknown: 0 });
    const slot = buckets.get(age);
    if (g === 'F') slot.Female += r.value;
    else if (g === 'M') slot.Male += r.value;
    else slot.Unknown += r.value;
  }
  const sortAge = (a, b) => {
    const order = ['13-17','18-24','25-34','35-44','45-54','55-64','65+'];
    return order.indexOf(a.age) - order.indexOf(b.age);
  };
  const display = [...buckets.values()].sort(sortAge);
  const totalF = display.reduce((s, b) => s + b.Female, 0);
  const totalM = display.reduce((s, b) => s + b.Male, 0);
  const totalU = display.reduce((s, b) => s + b.Unknown, 0);
  const total  = totalF + totalM + totalU;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4 h-full">
      <div className="flex flex-col justify-center text-xs space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ background: '#ec4899' }} />
          <span className="text-slate-600">Female</span>
          <span className="ml-auto font-semibold tabular-nums text-slate-900">{formatCompact(totalF, 'number')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ background: '#3b82f6' }} />
          <span className="text-slate-600">Male</span>
          <span className="ml-auto font-semibold tabular-nums text-slate-900">{formatCompact(totalM, 'number')}</span>
        </div>
        {totalU > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: '#94a3b8' }} />
            <span className="text-slate-600">Unknown</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-900">{formatCompact(totalU, 'number')}</span>
          </div>
        )}
        <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">Total</span>
          <span className="text-xs font-bold text-slate-900">{formatCompact(total, 'number')}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%" minHeight={220}>
        <BarChart data={display}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="age" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => formatCompact(v, 'number')} tickLine={false} axisLine={false} width={50} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
          <Bar dataKey="Female"  fill="#ec4899" radius={[3,3,0,0]} />
          <Bar dataKey="Male"    fill="#3b82f6" radius={[3,3,0,0]} />
          <Bar dataKey="Unknown" fill="#94a3b8" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Organic vs Paid split (vertical bar) ──

function OrganicPaidSplitBody({ data }) {
  const rows = data?.rows || [];
  const anyValue = rows.some(r => Number(r.current) > 0);
  if (!anyValue) {
    return <ChartEmptyState height={180} title="No data in range" hint="Organic vs paid split appears once channel insights are ingested." />;
  }
  const display = rows.map(r => ({ name: r.label, value: Number(r.current) || 0 }));
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={180}>
      <BarChart data={display} margin={{ top: 16, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => formatCompact(v, 'number')} tickLine={false} axisLine={false} width={50} />
        <Tooltip formatter={(v) => [formatCompact(v, 'number'), 'Value']} />
        <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 10, fill: '#64748b', formatter: (v) => formatCompact(v, 'number') }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Reach by follower type (donut) ──

function ReachByFollowerTypeBody({ data }) {
  const rows = data?.rows || [];
  if (rows.length === 0 || !rows.some(r => Number(r.value) > 0)) {
    return <ChartEmptyState height={180} title="No data yet" hint="Follower / non-follower split appears once page insights are ingested." />;
  }
  const COLORS = { follower: '#6366f1', non_follower: '#ec4899' };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full">
      <ResponsiveContainer width="100%" height="100%" minHeight={180}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={1} isAnimationActive={false}>
            {rows.map(r => <Cell key={r.key} fill={COLORS[r.key] || '#6366f1'} />)}
          </Pie>
          <Tooltip formatter={(v, _n, e) => [`${formatCompact(v, 'number')} (${(e.payload.share || 0).toFixed(1)}%)`, e.payload.label]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col justify-center space-y-2 px-2 text-xs">
        {rows.map(r => (
          <div key={r.key} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[r.key] || '#6366f1' }} />
            <span className="text-slate-600 flex-1">{r.label}</span>
            <span className="text-slate-900 font-semibold tabular-nums">{formatCompact(r.value, 'number')}</span>
            <span className="text-[10px] text-slate-400 tabular-nums w-12 text-right">{(r.share || 0).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reach by distribution (horizontal bar) ──

function ReachByDistributionBody({ data }) {
  const rows = data?.rows || [];
  if (!rows.some(r => Number(r.value) > 0)) {
    return <ChartEmptyState height={180} title="No data yet" hint="Distribution mix appears once page insights are ingested." />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={180}>
      <BarChart data={rows.map(r => ({ name: r.label, value: Number(r.value) || 0 }))}
                layout="vertical" margin={{ top: 8, right: 32, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(v, 'number')} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => [formatCompact(v, 'number'), 'Reach']} />
        <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, fill: '#64748b', formatter: (v) => formatCompact(v, 'number') }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Engage volume by network (table) ──

const PLATFORM_LABEL_FULL = {
  facebook_page: 'Facebook',
  instagram_business: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  twitter: 'X',
};

function EngageVolumeByNetworkBody({ data }) {
  const rows = data?.rows || [];
  const total = data?.total || { current: 0, prior: 0 };
  if (rows.length === 0) return <EmptyHint hint="No incoming messages in range." />;
  return (
    <div className="overflow-auto h-full -mx-1">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="px-2 py-3 text-left">
              <span className="text-[10px] uppercase tracking-wider font-medium text-slate-500">Network</span>
            </th>
            <th className="px-2 py-3 text-right whitespace-nowrap font-normal align-bottom">
              <div className="text-[10px] uppercase tracking-wider font-medium text-slate-500">Incoming messages</div>
              <div className="flex items-baseline justify-end gap-1.5 mt-0.5">
                <span className="text-base font-bold text-slate-900 tabular-nums">{formatCompact(total.current, 'number')}</span>
                <DeltaPill current={total.current} prior={total.prior} />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const Icon = PLATFORM_ICON[r.platform];
            return (
              <tr key={r.platform} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    {Icon ? <Icon className="w-4 h-4 text-slate-500" /> : null}
                    <span className="text-slate-800">{PLATFORM_LABEL_FULL[r.platform] || r.platform}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">{formatCompact(r.current, 'number')}</span>
                    <DeltaPill current={r.current} prior={r.prior} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Engage sentiment by network (table) ──

function EngageSentimentByNetworkBody({ data }) {
  const rows = data?.rows || [];
  const totals = data?.totals || {};
  if (rows.length === 0) return <EmptyHint hint="No incoming messages in range." />;
  const cols = [
    { key: 'positive',      label: 'Positive messages' },
    { key: 'neutral',       label: 'Neutral messages' },
    { key: 'negative',      label: 'Negative messages' },
    { key: 'uncategorized', label: 'Uncategorized messages' },
  ];
  return (
    <div className="overflow-auto h-full -mx-1">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="px-2 py-3 text-left">
              <span className="text-[10px] uppercase tracking-wider font-medium text-slate-500">Network</span>
            </th>
            {cols.map(c => {
              const t = totals[c.key] || { current: 0, prior: 0 };
              return (
                <th key={c.key} className="px-2 py-3 text-left whitespace-nowrap font-normal align-bottom">
                  <div className="text-[10px] uppercase tracking-wider font-medium text-slate-500">{c.label}</div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-base font-bold text-slate-900 tabular-nums">{formatCompact(t.current, 'number')}</span>
                    <DeltaPill current={t.current} prior={t.prior} />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const Icon = PLATFORM_ICON[r.platform];
            return (
              <tr key={r.platform} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    {Icon ? <Icon className="w-4 h-4 text-slate-500" /> : null}
                    <span className="text-slate-800">{PLATFORM_LABEL_FULL[r.platform] || r.platform}</span>
                  </div>
                </td>
                {cols.map(c => {
                  const cell = r.cells?.[c.key] || { current: 0, prior: 0 };
                  return (
                    <td key={c.key} className="px-2 py-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">{formatCompact(cell.current, 'number')}</span>
                        <DeltaPill current={cell.current} prior={cell.prior} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Engage sentiment by channel (table) ──

function EngageSentimentByChannelBody({ data }) {
  const rows = data?.rows || [];
  const totals = data?.totals || {};
  if (rows.length === 0) return <EmptyHint hint="No incoming messages in range." />;
  const cols = [
    { key: 'positive',      label: 'Positive messages' },
    { key: 'neutral',       label: 'Neutral messages' },
    { key: 'negative',      label: 'Negative messages' },
    { key: 'uncategorized', label: 'Uncategorized messages' },
  ];
  return (
    <div className="overflow-auto h-full -mx-1">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="px-2 py-3 text-left">
              <span className="text-[10px] uppercase tracking-wider font-medium text-slate-500">Channel</span>
            </th>
            {cols.map(c => {
              const t = totals[c.key] || { current: 0, prior: 0 };
              return (
                <th key={c.key} className="px-2 py-3 text-left whitespace-nowrap font-normal align-bottom">
                  <div className="text-[10px] uppercase tracking-wider font-medium text-slate-500">{c.label}</div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-base font-bold text-slate-900 tabular-nums">{formatCompact(t.current, 'number')}</span>
                    <DeltaPill current={t.current} prior={t.prior} />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.socialAccountId} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-2 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ChannelAvatar row={r} />
                  <span className="text-slate-800 font-medium truncate">{r.accountName}</span>
                </div>
              </td>
              {cols.map(c => {
                const cell = r.cells?.[c.key] || { current: 0, prior: 0 };
                return (
                  <td key={c.key} className="px-2 py-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-900 tabular-nums leading-tight">{formatCompact(cell.current, 'number')}</span>
                      <DeltaPill current={cell.current} prior={cell.prior} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Engage sentiment KPI group (4-up subtype sentiment cards) ──

function EngageSentimentKpiGroupBody({ data }) {
  const cards = data?.cards || [];
  if (cards.length === 0) return <EmptyHint hint="No data in range." />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 h-full">
      {cards.map(c => (
        <KpiCard
          key={c.key}
          label={c.label}
          value={formatValue(c.current, 'number')}
          current={c.current}
          prior={c.prior}
          priorValue={formatValue(c.prior, 'number')}
        />
      ))}
    </div>
  );
}

// ── Follow vs Non-follow (horizontal bar) ──

function FollowNonFollowBody({ data }) {
  const rows = data?.rows || [];
  const anyValue = rows.some(r => Number(r.current) > 0);
  if (!anyValue) {
    return <ChartEmptyState height={160} title="No data in range" hint="Follow / non-follow view split appears once page insights are ingested." />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      <BarChart data={rows.map(r => ({ name: r.label, value: Number(r.current) || 0 }))}
                layout="vertical" margin={{ top: 8, right: 32, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => [formatCompact(v, 'number'), 'Views']} />
        <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, fill: '#64748b', formatter: (v) => formatCompact(v, 'number') }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Editable widget title ──

// Click the title (or pencil) to swap in an input; blur or Enter saves
// via PUT /dashboards/widgets/:id, Escape cancels. Optimistic update so
// the new title shows immediately while the request flies.
function EditableTitle({ widget, canEdit }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(widget.title || titleFor(widget));
  const inputRef = useRef(null);

  useEffect(() => {
    setValue(widget.title || titleFor(widget));
  }, [widget.title, widget.widgetType]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const mut = useMutation({
    mutationFn: (title) => updateWidget(widget.id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'dashboard' });
    },
  });

  const commit = () => {
    const trimmed = (value || '').trim();
    const next = trimmed || titleFor(widget);
    setValue(next);
    setEditing(false);
    if (next !== (widget.title || titleFor(widget))) {
      mut.mutate(next);
    }
  };

  if (!canEdit) {
    return <h4 className="text-sm font-semibold text-slate-900 mt-0.5">{value}</h4>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setValue(widget.title || titleFor(widget));
            setEditing(false);
          }
        }}
        className="text-sm font-semibold text-slate-900 mt-0.5 w-full bg-white border border-blue-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to rename"
      className="group flex items-center gap-1 mt-0.5 text-left"
    >
      <h4 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">{value}</h4>
      <Pencil className="w-3 h-3 text-slate-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ── helpers ──

function EmptyHint({ hint }) {
  return <div className="h-full flex items-center justify-center text-center text-xs text-slate-400 px-4">{hint}</div>;
}

function formatValue(value, format) {
  const n = Number(value) || 0;
  if (format === 'currency') {
    return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  }
  if (format === 'percent') return `${n.toFixed(2)}%`;
  if (format === 'multiplier') return `${n.toFixed(2)}x`;
  return n.toLocaleString();
}

function titleFor(widget) {
  const map = {
    key_metrics: 'Key metrics',
    time_series: 'Time series',
    channel_comparison: 'Channel comparison',
    channel_performance_table: 'Performance by channel',
    network_comparison: 'Network comparison',
    breakdown: 'Breakdown',
    content_performance: 'Top content',
    sentiment_breakdown: 'Sentiment breakdown',
    sentiment_trend: 'Sentiment over time',
  };
  return map[widget.widgetType] || (widget.widgetType || '').replace(/_/g, ' ');
}
