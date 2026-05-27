import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Trash2, AlertTriangle } from 'lucide-react';
import { getWidgetData } from '../../api/dashboardsApi';
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
const COL_SPAN = {
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

  return (
    <div className={clsx('bg-white border border-slate-200 rounded-xl flex flex-col col-span-1 sm:col-span-2', spanClass)} style={heightStyle}>
      <div className="flex items-start justify-between px-4 pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
            {widget.category} · {(widget.widgetType || '').replace(/_/g, ' ')}
          </p>
          <h4 className="text-sm font-semibold text-slate-900 mt-0.5">
            {widget.title || titleFor(widget)}
          </h4>
        </div>
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
      <div className="flex-1 px-4 pb-4 pt-2">
        <WidgetBody widget={widget} />
      </div>
    </div>
  );
}

function WidgetBody({ widget }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['widget-data', widget.id, widget.updatedAt],
    queryFn: () => getWidgetData(widget.id),
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
    case 'network_comparison':    return <NetworkComparisonBody data={data} />;
    case 'breakdown':             return <BreakdownBody data={data} />;
    case 'content_performance':   return <ContentPerformanceBody data={data} />;
    case 'sentiment_breakdown':   return <SentimentBreakdownBody data={data} />;
    case 'sentiment_trend':       return <SentimentTrendBody data={data} />;
    default:
      return (
        <div className="h-full flex items-center justify-center text-center text-xs text-slate-400">
          The <code className="mx-1 px-1 bg-slate-100 rounded">{widget.widgetType}</code> widget hasn't shipped yet.
        </div>
      );
  }
}

// ── Key metrics ──

function KeyMetricsBody({ data }) {
  const metrics = data?.metrics || [];
  if (metrics.length === 0) return <EmptyHint hint="No metrics selected for this widget." />;

  const hasAnyValue = metrics.some(m => Number(m.current) > 0 || Number(m.prior) > 0);
  if (!hasAnyValue) {
    return <EmptyHint hint="No data for this period yet. Publish posts or run the daily insights sync, then come back." />;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 h-full">
      {metrics.map((m, idx) => (
        <KpiCard
          key={m.key}
          label={m.label}
          value={formatValue(m.current, m.format)}
          current={m.current}
          prior={m.prior}
          priorValue={formatValue(m.prior, m.format)}
          invertDelta={m.invertDelta}
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

// ── Sentiment trend (stacked area over time) ──

function SentimentTrendBody({ data }) {
  const points = data?.points || [];
  const anyValue = points.some(p => p.positive + p.neutral + p.negative > 0);
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
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="positive" stackId="1" stroke={SENTIMENT_COLORS.positive} fill={SENTIMENT_COLORS.positive} fillOpacity={0.8} name="Positive" isAnimationActive={false} />
        <Area type="monotone" dataKey="neutral"  stackId="1" stroke={SENTIMENT_COLORS.neutral}  fill={SENTIMENT_COLORS.neutral}  fillOpacity={0.8} name="Neutral"  isAnimationActive={false} />
        <Area type="monotone" dataKey="negative" stackId="1" stroke={SENTIMENT_COLORS.negative} fill={SENTIMENT_COLORS.negative} fillOpacity={0.8} name="Negative" isAnimationActive={false} />
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

function ContentPerformanceBody({ data }) {
  const rows = data?.rows || [];
  if (rows.length === 0) return <ChartEmptyState height={180} title="No posts in range" hint="Publish posts in the selected period to see top performers." />;
  const sortBy = data?.sortBy;

  return (
    <div className="overflow-auto h-full -mx-1">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-white border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
          <tr>
            <th className="px-2 py-2 text-left font-semibold">Post</th>
            <th className="px-2 py-2 text-right font-semibold">Reach</th>
            <th className="px-2 py-2 text-right font-semibold">Likes</th>
            <th className="px-2 py-2 text-right font-semibold">Comments</th>
            <th className="px-2 py-2 text-right font-semibold">ER</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const Icon = PLATFORM_ICON[r.platform];
            return (
              <tr key={r.postId} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2">
                  <div className="flex items-start gap-2">
                    {Icon ? <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-500" /> : null}
                    <div className="min-w-0">
                      <div className="text-slate-800 line-clamp-2">{r.content || '(no caption)'}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {r.accountName} · {r.publishedAt ? format(new Date(r.publishedAt), 'MMM d') : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-700">{r.reach.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-700">{r.likes.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-700">{r.comments.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-700">{r.engagementRate.toFixed(2)}%</td>
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
    network_comparison: 'Network comparison',
    breakdown: 'Breakdown',
    content_performance: 'Top content',
    sentiment_breakdown: 'Sentiment breakdown',
    sentiment_trend: 'Sentiment over time',
  };
  return map[widget.widgetType] || (widget.widgetType || '').replace(/_/g, ' ');
}
