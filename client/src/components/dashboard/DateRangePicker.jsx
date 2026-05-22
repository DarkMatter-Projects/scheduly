import { useEffect, useMemo, useRef, useState } from 'react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isBefore, isAfter, isWithinInterval,
  startOfDay, subDays, startOfWeek as startISOWeek, endOfWeek as endISOWeek,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
} from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

// Date range picker for the dashboard builder, matching the screenshot:
// two-month calendar on the left, preset buttons on the right, trigger
// button shows the current range summary.
//
// Value shape (matches what we persist on the dashboard):
//   { defaultRange?: '7d'|'14d'|'30d'|'90d'|null,
//     rangeStart?: 'YYYY-MM-DD'|null,
//     rangeEnd?: 'YYYY-MM-DD'|null }
//
// If defaultRange is set, rangeStart/rangeEnd are NULL (server computes the
// rolling window). If a custom range is picked, defaultRange is NULL and
// rangeStart/rangeEnd hold ISO dates.
export default function DateRangePicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [leftMonth, setLeftMonth] = useState(() => startOfMonth(subMonths(new Date(), 1)));
  const [picking, setPicking] = useState(null); // {start, end} while user is mid-selection
  const containerRef = useRef(null);

  // Close on click-outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    const onKey   = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerLabel = useMemo(() => labelFor(value), [value]);

  const applyPreset = (preset) => {
    onChange?.(preset.toServerValue());
    setPicking(null);
    setOpen(false);
  };

  const onDayClick = (d) => {
    if (!picking || (picking.start && picking.end)) {
      // First click — start a new selection.
      setPicking({ start: d, end: null });
      return;
    }
    // Second click — finalize. Order start/end so end >= start.
    const start = isBefore(d, picking.start) ? d : picking.start;
    const end   = isBefore(d, picking.start) ? picking.start : d;
    setPicking({ start, end });
    onChange?.({
      defaultRange: null,
      rangeStart: format(start, 'yyyy-MM-dd'),
      rangeEnd:   format(end,   'yyyy-MM-dd'),
    });
    setOpen(false);
  };

  // Decide which interval to highlight in the grid: the in-progress selection
  // takes precedence over the saved value so the user sees their picks live.
  const highlight = useMemo(() => {
    if (picking?.start && picking?.end) return { start: picking.start, end: picking.end };
    if (picking?.start) return { start: picking.start, end: picking.start };
    if (value?.rangeStart && value?.rangeEnd) {
      return { start: new Date(value.rangeStart), end: new Date(value.rangeEnd) };
    }
    if (value?.defaultRange) {
      const days = ({ '7d': 7, '14d': 14, '30d': 30, '90d': 90 })[value.defaultRange] || 30;
      const end = startOfDay(new Date());
      const start = subDays(end, days - 1);
      return { start, end };
    }
    return null;
  }, [picking, value]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
      >
        <Calendar className="w-3.5 h-3.5 text-slate-500" />
        {triggerLabel}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl flex">
          {/* Two months */}
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setLeftMonth(m => subMonths(m, 1))}
                className="p-1 rounded hover:bg-slate-100 text-slate-500"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setLeftMonth(m => addMonths(m, 1))}
                className="p-1 rounded hover:bg-slate-100 text-slate-500"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-6">
              <Month month={leftMonth} highlight={highlight} pickingStart={picking?.start} onDayClick={onDayClick} />
              <Month month={addMonths(leftMonth, 1)} highlight={highlight} pickingStart={picking?.start} onDayClick={onDayClick} />
            </div>
          </div>

          {/* Preset column */}
          <div className="border-l border-slate-200 p-3 space-y-1 min-w-[180px]">
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                className={clsx(
                  'w-full text-left px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wide border',
                  isPresetActive(p, value)
                    ? 'border-blue-500 text-blue-700 bg-blue-50'
                    : 'border-transparent text-slate-700 hover:bg-slate-50'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Month grid ──

function Month({ month, highlight, pickingStart, onDayClick }) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end   = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-700 text-center mb-2">{format(month, 'MMMM yyyy')}</p>
      <div className="grid grid-cols-7 gap-0.5 text-[10px] text-slate-400 mb-1">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="w-7 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const inMonth = isSameMonth(d, month);
          const inRange = highlight && isWithinInterval(d, { start: startOfDay(highlight.start), end: startOfDay(highlight.end) });
          const isStart = highlight && isSameDay(d, highlight.start);
          const isEnd   = highlight && isSameDay(d, highlight.end);
          const isPickingStart = pickingStart && isSameDay(d, pickingStart);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onDayClick(d)}
              className={clsx(
                'w-7 h-7 text-[11px] rounded flex items-center justify-center transition',
                !inMonth && 'text-slate-300',
                inMonth && !inRange && 'text-slate-700 hover:bg-slate-100',
                inRange && !isStart && !isEnd && 'bg-blue-50 text-blue-700',
                (isStart || isEnd || isPickingStart) && 'bg-blue-600 text-white font-semibold',
              )}
            >
              {format(d, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Presets ──

const PRESETS = [
  preset('previous_7',   'Previous 7 days',   () => relativeDays(7),    { defaultRange: '7d'  }),
  preset('previous_30',  'Previous 30 days',  () => relativeDays(30),   { defaultRange: '30d' }),
  preset('previous_90',  'Previous 90 days',  () => relativeDays(90),   { defaultRange: '90d' }),
  preset('previous_365', 'Previous 365 days', () => relativeDays(365),  { defaultRange: null, custom: 365 }),
  preset('last_week',    'Last week',         () => lastWeek()),
  preset('last_month',   'Last month',        () => lastMonth()),
  preset('last_quarter', 'Last quarter',      () => lastQuarter()),
  preset('this_month',   'This month',        () => thisMonth()),
  preset('this_quarter', 'This quarter',      () => thisQuarter()),
  preset('this_year',    'This year',         () => thisYear()),
];

function preset(key, label, computeRange, opts = {}) {
  return {
    key,
    label,
    computeRange,
    toServerValue: () => {
      if (opts.defaultRange) return { defaultRange: opts.defaultRange, rangeStart: null, rangeEnd: null };
      const { start, end } = computeRange();
      return {
        defaultRange: null,
        rangeStart: format(start, 'yyyy-MM-dd'),
        rangeEnd:   format(end,   'yyyy-MM-dd'),
      };
    },
    ...opts,
  };
}

function relativeDays(n) {
  const end = startOfDay(new Date());
  const start = subDays(end, n - 1);
  return { start, end };
}

function lastWeek() {
  const last = subDays(startISOWeek(new Date(), { weekStartsOn: 1 }), 1);
  return { start: startISOWeek(last, { weekStartsOn: 1 }), end: endISOWeek(last, { weekStartsOn: 1 }) };
}

function lastMonth() {
  const last = subMonths(new Date(), 1);
  return { start: startOfMonth(last), end: endOfMonth(last) };
}

function lastQuarter() {
  const last = subMonths(new Date(), 3);
  return { start: startOfQuarter(last), end: endOfQuarter(last) };
}

function thisMonth() {
  return { start: startOfMonth(new Date()), end: startOfDay(new Date()) };
}

function thisQuarter() {
  return { start: startOfQuarter(new Date()), end: startOfDay(new Date()) };
}

function thisYear() {
  return { start: startOfYear(new Date()), end: startOfDay(new Date()) };
}

// ── Label + active-preset logic ──

function labelFor(value) {
  if (!value) return 'Last 30 days';
  if (value.defaultRange) {
    return ({
      '7d':  'Previous 7 days',
      '14d': 'Previous 14 days',
      '30d': 'Previous 30 days',
      '90d': 'Previous 90 days',
    })[value.defaultRange] || `Previous ${value.defaultRange}`;
  }
  if (value.rangeStart && value.rangeEnd) {
    const s = new Date(value.rangeStart);
    const e = new Date(value.rangeEnd);
    if (s.getFullYear() === e.getFullYear()) {
      return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
    }
    return `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`;
  }
  return 'Last 30 days';
}

function isPresetActive(preset, value) {
  if (preset.defaultRange && value?.defaultRange === preset.defaultRange) return true;
  if (preset.defaultRange) return false;
  if (!value?.rangeStart || !value?.rangeEnd) return false;
  // Compare computed range against the saved range (day precision).
  try {
    const { start, end } = preset.computeRange();
    return format(start, 'yyyy-MM-dd') === value.rangeStart.slice(0, 10)
        && format(end,   'yyyy-MM-dd') === value.rangeEnd.slice(0, 10);
  } catch { return false; }
}
