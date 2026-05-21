// Compact relative time — Twitter/Gmail style.
// 30s → "now", 5m → "5m", 3h → "3h", 2d → "2d", else absolute date.
import { format } from 'date-fns';

export function formatRelative(dateLike) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return 'now';
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  // Older than a week — show the date instead.
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? 'MMM d' : 'MMM d, yyyy');
}
