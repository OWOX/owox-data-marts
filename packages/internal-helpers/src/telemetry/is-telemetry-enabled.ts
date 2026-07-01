/** Values that count as "true" for opt-out env flags. */
function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false';
}

/**
 * Telemetry is ON by default (opt-out). It is disabled when any of:
 * - OWOX_TELEMETRY_DISABLED is truthy,
 * - DO_NOT_TRACK is truthy (https://consoledonottrack.com standard), or
 * - CI is truthy (keeps OWOX's own CI runs out of the stats).
 */
export function isTelemetryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isTruthy(env.OWOX_TELEMETRY_DISABLED)) return false;
  if (isTruthy(env.DO_NOT_TRACK)) return false;
  if (isTruthy(env.CI)) return false;
  return true;
}
