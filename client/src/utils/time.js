// Compact relative time — Twitter/Gmail style.
// Past:   30s → "now", 5m → "5m", 3h → "3h", 2d → "2d", else absolute date.
// Future: "in 3h", "in 2d", else absolute date. (Used for snooze countdowns.)
import { format } from 'date-fns';

export function formatRelative(dateLike) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';

  const diffMs = Date.now() - d.getTime();
  const isFuture = diffMs < 0;
  const absSec = Math.round(Math.abs(diffMs) / 1000);

  if (absSec < 5) return 'now';
  const prefix = isFuture ? 'in ' : '';
  if (absSec < 60) return `${prefix}${absSec}s`;
  const absMin = Math.round(absSec / 60);
  if (absMin < 60) return `${prefix}${absMin}m`;
  const absHr = Math.round(absMin / 60);
  if (absHr < 24) return `${prefix}${absHr}h`;
  const absDay = Math.round(absHr / 24);
  if (absDay < 7) return `${prefix}${absDay}d`;
  // Older / further than a week — show the date instead.
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? 'MMM d' : 'MMM d, yyyy');
}
