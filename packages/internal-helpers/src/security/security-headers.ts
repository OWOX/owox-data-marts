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
 */
export function applySecurityHeaders(res: ResponseLike): void {
  for (const [name, value] of SECURITY_HEADERS) {
    res.setHeader(name, value);
  }
}

/**
 * Sends an HTML string response with the five DoD security headers attached.
 *
 * Use this at every IDP / SSR callsite that renders server-side HTML (sign-in
 * pages, magic-link confirmation, password setup, admin dashboard, etc.) so
 * that security headers land *only* on HTML responses — not on adjacent JSON
 * endpoints under the same `/auth/*` prefix.
 */
export function sendSecureHtml(res: ResponseLike, html: string): void {
  applySecurityHeaders(res);
  res.send(html);
}
