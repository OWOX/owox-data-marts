const TRANSIENT_MARKERS = [
  'timeout',
  'econnreset',
  'econnrefused',
  'enotfound',
  'socket hang up',
  'network',
  '502',
  '503',
  '504',
  '429',
];

/**
 * True for an email send error that a retry can fix: a network failure, a timeout,
 * rate limiting or a provider outage. A rejected request (bad recipient, sender or
 * credentials) is not transient.
 */
export function isTransientEmailError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return TRANSIENT_MARKERS.some(marker => message.includes(marker));
}
