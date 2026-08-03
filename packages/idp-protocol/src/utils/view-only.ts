import type { Payload } from '../types/models.js';

/**
 * Resolves whether token claims represent a view-only session.
 *
 * Only the protocol contract field `viewOnly` is considered. Provider-specific
 * flags (for example API-key `readOnly`) must be normalized into `viewOnly` by
 * the identity provider / token issuer — they are not interpreted here.
 *
 * Accepts any object (including Zod passthrough issuer payloads) so callers do
 * not need casts when `viewOnly` is not in the declared schema shape.
 * `isViewOnlyPayload` delegates here so issuer mapping and guard enforcement
 * cannot drift.
 */
export function resolveViewOnlyFromClaims(claims: object | null | undefined): boolean {
  if (claims == null) {
    return false;
  }

  return (claims as { viewOnly?: unknown }).viewOnly === true;
}

/**
 * Whether the authenticated payload is a view-only session.
 */
export function isViewOnlyPayload(payload: Payload | null | undefined): boolean {
  return resolveViewOnlyFromClaims(payload);
}
