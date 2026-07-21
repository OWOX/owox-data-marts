import type { Payload } from '../types/models.js';

/**
 * HTTP methods that are safe to allow in view-only sessions.
 * Matches RFC 9110 safe methods used by the ODM API surface.
 */
export const VIEW_ONLY_SAFE_HTTP_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;

/**
 * Resolves whether token claims represent a view-only session.
 *
 * Only the protocol contract field `viewOnly` is considered. Provider-specific
 * flags (for example API-key `readOnly`) must be normalized into `viewOnly` by
 * the identity provider / token issuer — they are not interpreted here.
 */
export function resolveViewOnlyFromClaims(
  claims: Record<string, unknown> | null | undefined
): boolean {
  if (!claims) {
    return false;
  }

  return claims.viewOnly === true;
}

/**
 * Whether the authenticated payload is a view-only session.
 */
export function isViewOnlyPayload(payload: Payload | null | undefined): boolean {
  if (!payload) {
    return false;
  }

  return payload.viewOnly === true;
}

/**
 * Whether the HTTP method is allowed for view-only sessions.
 */
export function isSafeHttpMethodForViewOnly(method: string | undefined | null): boolean {
  if (!method) {
    return false;
  }

  return (VIEW_ONLY_SAFE_HTTP_METHODS as readonly string[]).includes(method.toUpperCase());
}
