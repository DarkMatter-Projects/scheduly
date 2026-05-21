import { BarChart3 } from 'lucide-react';

// Goes inside a chart card body when there's no data to plot. Keeps the
// chart card's vertical space so the layout doesn't jump around, and tells
// the user exactly why it's empty + what to do.
export default function ChartEmptyState({ title, hint, icon: Icon = BarChart3, height = 240 }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center px-6"
      style={{ height }}
    >
      <Icon className="w-8 h-8 text-slate-300 mb-2" />
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {hint && <p className="text-xs text-slate-400 mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}
