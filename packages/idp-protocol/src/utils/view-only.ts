import type { Payload } from '../types/models.js';

/**
 * Resolves whether token claims represent a view-only session.
 *
 * Only the protocol contract field `viewOnly` is considered. Provider-specific
 * flags (for example API-key `readOnly`) must be normalized into `viewOnly` by
 * the identity provider / token issuer — they are not interpreted here.
 *
 * Single source of truth for claim detection; `isViewOnlyPayload` delegates here
 * so issuer mapping and guard enforcement cannot drift.
 */
export function resolveViewOnlyFromClaims(
  claims: { viewOnly?: unknown } | null | undefined
): boolean {
  return claims?.viewOnly === true;
}

/**
 * Whether the authenticated payload is a view-only session.
 */
export function isViewOnlyPayload(payload: Payload | null | undefined): boolean {
  return resolveViewOnlyFromClaims(payload);
}
