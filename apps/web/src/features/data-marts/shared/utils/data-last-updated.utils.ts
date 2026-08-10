import type {
  DataLastUpdatedCoverage,
  DataLastUpdatedDto,
} from '../types/api/response/data-mart-data-last-updated.dto';

const ABSOLUTE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

const RELATIVE_STEPS: { limitMs: number; divisorMs: number; unit: Intl.RelativeTimeFormatUnit }[] =
  [
    { limitMs: 60_000, divisorMs: 1_000, unit: 'second' },
    { limitMs: 3_600_000, divisorMs: 60_000, unit: 'minute' },
    { limitMs: 86_400_000, divisorMs: 3_600_000, unit: 'hour' },
    { limitMs: 30 * 86_400_000, divisorMs: 86_400_000, unit: 'day' },
    { limitMs: 365 * 86_400_000, divisorMs: 30 * 86_400_000, unit: 'month' },
    { limitMs: Number.POSITIVE_INFINITY, divisorMs: 365 * 86_400_000, unit: 'year' },
  ];

/** "5 minutes ago" / "2 days ago"; `now` is injectable for tests. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const elapsedMs = Math.max(0, now.getTime() - then);
  // The last step has an Infinity limit, so find() always matches.
  const step =
    RELATIVE_STEPS.find(s => elapsedMs < s.limitMs) ?? RELATIVE_STEPS[RELATIVE_STEPS.length - 1];
  return RELATIVE_FORMAT.format(-Math.round(elapsedMs / step.divisorMs), step.unit);
}

/** "Jul 25, 2026, 08:30 AM" — the exact-value companion to the relative label. */
export function formatAbsoluteTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : ABSOLUTE_FORMAT.format(date);
}

/**
 * The headline label for a snapshot. Semantics are deliberate:
 * - null block → the check never ran → "Unknown";
 * - null timestamp → the warehouse could not tell → "Unknown", never "stale";
 * - partial coverage → the true time can only be more recent, so the value is a floor.
 */
export function formatDataLastUpdatedLabel(block: DataLastUpdatedDto | null | undefined): string {
  if (!block?.dataLastUpdatedAt) return 'Unknown';
  const relative = formatRelativeTime(block.dataLastUpdatedAt);
  return block.coverage === 'partial' ? `≥ ${relative}` : relative;
}

/** One-line explanation of the coverage flag for tooltips. */
export function describeCoverage(coverage: DataLastUpdatedCoverage): string {
  switch (coverage) {
    case 'complete':
      return 'All source tables were checked.';
    case 'partial':
      return 'Some source tables could not be checked — the actual time can only be more recent.';
    case 'unavailable':
      return 'The storage did not report when the source tables last changed.';
  }
}
