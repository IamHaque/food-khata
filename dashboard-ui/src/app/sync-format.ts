const pad = (value: number) => String(value).padStart(2, '0');

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Exact local timestamp used in tooltips and the sync panel, e.g. 2026-11-08 14:05:09. */
export function formatExactTimestamp(value: string | null | undefined): string {
  const date = parse(value);
  if (!date) return 'Unknown';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Human relative sync label for the header chip, e.g. "Synced 2h ago" or "Synced today". */
export function formatRelativeSync(value: string | null | undefined, now: Date = new Date()): string {
  const date = parse(value);
  if (!date) return 'Sync time unknown';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return 'Synced just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `Synced ${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 12) return `Synced ${hours}h ago`;
  if (sameLocalDay(date, now)) return 'Synced today';
  if (sameLocalDay(date, new Date(now.getTime() - 86_400_000))) return 'Synced yesterday';

  return `Synced ${Math.floor(hours / 24)}d ago`;
}
