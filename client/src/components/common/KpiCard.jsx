import { ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import clsx from 'clsx';

// Compact "vs prior" delta string. Returns null when there's nothing meaningful
// to compare (no prior, or both sides zero — avoids "+Infinity%" noise).
export function computeDelta(current, prior) {
  if (current == null || prior == null) return null;
  if (current === 0 && prior === 0) return null;
  if (prior === 0) return { text: 'new', direction: 'up', pct: null };
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  const dir = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down';
  const sign = pct > 0 ? '+' : '';
  const text = `${sign}${pct.toFixed(pct >= 100 || pct <= -100 ? 0 : 1)}%`;
  return { text, direction: dir, pct };
}

// Wetility-style KPI card with delta pill, optional "Prev" row, optional
// sparkline, optional caption (per-platform breakdown etc).
//
// Props:
//   label           — uppercase label
//   value           — pre-formatted current value (string)
//   current/prior   — raw numbers used to compute the delta
//   priorValue      — pre-formatted prior value to show under the headline
//   compareEnabled  — when false, delta + prev row are hidden
//   invertDelta     — flip "up = good" for cost-style metrics (CPC, CPM)
//   sparkData       — array of { date, value } for the inline area chart
//   sparkColor      — sparkline stroke/fill colour (any CSS colour)
//   caption         — small text below the sparkline (e.g. breakdown)
export default function KpiCard({
  label,
  value,
  current,
  prior,
  priorValue,
  compareEnabled = true,
  invertDelta = false,
  sparkData,
  sparkColor = '#3b82f6',
  caption,
  className,
}) {
  const delta = compareEnabled ? computeDelta(current, prior) : null;

  let tone = 'muted';
  if (delta) {
    if (delta.direction === 'flat') tone = 'muted';
    else if (delta.direction === 'up') tone = invertDelta ? 'negative' : 'positive';
    else tone = invertDelta ? 'positive' : 'negative';
  }
  const toneClass =
    tone === 'positive' ? 'text-emerald-700 bg-emerald-50'
    : tone === 'negative' ? 'text-rose-700 bg-rose-50'
    : 'text-slate-500 bg-slate-100';

  const showPrior = compareEnabled && priorValue !== undefined && priorValue !== null && priorValue !== '';
  const showSpark = Array.isArray(sparkData) && sparkData.length > 1;

  return (
    <div className={clsx('flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:p-5', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide leading-tight text-slate-500 break-words">
          {label}
        </span>
        {delta && (
          <span className={clsx(
            'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap',
            toneClass,
          )}>
            {delta.direction === 'up' ? <ArrowUp className="h-2.5 w-2.5" />
              : delta.direction === 'down' ? <ArrowDown className="h-2.5 w-2.5" />
              : <ArrowRight className="h-2.5 w-2.5" />}
            {delta.text}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {value}
        </span>
      </div>

      {showPrior && (
        <div className="-mt-1 flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
          <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">Prev</span>
          <span>{priorValue}</span>
        </div>
      )}

      {showSpark && (
        <div className="-mx-1 -mb-1 h-9">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <Area
                type="monotone"
                dataKey="value"
                stroke={sparkColor}
                fill={sparkColor}
                fillOpacity={0.22}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {caption && (
        <div className="text-xs text-slate-500 leading-snug">{caption}</div>
      )}
    </div>
  );
}
