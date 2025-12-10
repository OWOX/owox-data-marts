/**
 * Formats milliseconds into human-readable string.
 * Automatically chooses ms, seconds, minutes, hours, days.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }

  const sec = ms / 1000;
  if (sec < 60) {
    return `${sec.toFixed(2)}s`;
  }

  const min = sec / 60;
  if (min < 60) {
    return `${min.toFixed(2)}min`;
  }

  const hours = min / 60;
  if (hours < 24) {
    return `${hours.toFixed(2)}h`;
  }

  const days = hours / 24;
  return `${days.toFixed(2)}d`;
}
