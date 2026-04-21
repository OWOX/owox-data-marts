/**
 * Minimal Express-compatible interface so this module stays
 * framework-agnostic (mirrors the pattern in `utils/disableConditionalCaching.ts`).
 */
interface ResponseLike {
  send(body: string): unknown;
  setHeader(name: string, value: number | string | readonly string[]): unknown;
}

/**
 * Five security headers that match the owox security DoD.
 *
 * Kept as a frozen list so callers can iterate, inspect, or reference specific
 * entries in tests. Values are pinned to the exact strings required — do not
 * tweak them here without updating the DoD and integrators.
 */
export const SECURITY_HEADERS: readonly (readonly [string, string])[] = Object.freeze([
  ['Strict-Transport-Security', 'max-age=31536000'],
  ['Content-Security-Policy', "frame-ancestors 'none'"],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-XSS-Protection', '1; mode=block'],
  ['Referrer-Policy', 'no-referrer-when-downgrade'],
] as const);

/**
 * Writes all five security headers to the response.
 *
 * Does NOT read environment variables — the caller decides when to apply
 * (so tests and custom integrations can bypass env lookup).
 */
export function applySecurityHeaders(res: ResponseLike): void {
  for (const [name, value] of SECURITY_HEADERS) {
    res.setHeader(name, value);
  }
}

/**
 * Parses the `SECURITY_HEADERS_ENABLED` environment variable.
 *
 * Accepts `'true'` or `'1'` (case-insensitive) as truthy. Anything else —
 * including unset, empty string, `'false'`, `'0'` — resolves to `false`. This
 * makes the default behavior backward-compatible for existing self-hosted
 * deployments that did not previously opt into strict headers.
 *
 * @param env - Optional environment source (defaults to `process.env`). Useful
 *   for unit tests that want to exercise both branches without mutating the
 *   global process state.
 */
export function isSecurityHeadersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.SECURITY_HEADERS_ENABLED;
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

/**
 * Sends an HTML string response with security headers applied when the
 * `SECURITY_HEADERS_ENABLED` env flag is truthy.
 *
 * Use this at every IDP callsite that renders server-side HTML (sign-in
 * pages, magic-link confirmation, password setup, admin dashboard, etc.) so
 * that security headers land *only* on HTML responses — not on adjacent JSON
 * endpoints under the same `/auth/*` prefix.
 *
 * The env flag is read per call. That's cheap (one property lookup + short
 * string compare) and lets integration tests flip the flag without restarting
 * the process.
 */
export function sendSecureHtml(res: ResponseLike, html: string): void {
  if (isSecurityHeadersEnabled()) {
    applySecurityHeaders(res);
  }

  res.send(html);
}
