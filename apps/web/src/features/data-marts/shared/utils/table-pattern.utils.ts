/**
 * Shared helpers for working with TABLE_PATTERN data mart definitions.
 */

/** Returns true if the FQN looks like a wildcard pattern (e.g. `events_*`). */
export function isPatternFqn(fqn: string): boolean {
  return fqn.includes('*');
}

/**
 * Convert a wildcard-rollup FQN (e.g. `project.dataset.events_*`) to the value stored in
 * the `definition.pattern` field of a TABLE_PATTERN data mart.
 *
 * The backend BigQuery query builder appends the trailing `*` at query time (see
 * `apps/backend/.../bigquery-query.builder.ts`: `definition.pattern + '*'`), so the
 * stored value MUST NOT include it. Stripping here avoids producing `events_**` later.
 */
export function patternFqnToStored(fqn: string): string {
  return fqn.endsWith('*') ? fqn.slice(0, -1) : fqn;
}
