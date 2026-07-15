export const CYCLE_STUB_TOOLTIP =
  'This data mart is already joined earlier in this branch — stopping here to avoid a loop.';

export const MISSING_PRIMARY_KEY_TOOLTIP =
  'This data mart has no primary key, so the join cannot deduplicate rows reliably — metrics from it can be double-counted (fan-out).';

interface RelationshipWarningFlags {
  isCycleStub?: boolean;
  isDraft?: boolean;
  isJoinNotConfigured?: boolean;
  isBlocked?: boolean;
  isMissingPrimaryKey?: boolean;
}

/**
 * 'warning' = non-functional (Loop / Draft / Join not configured / Blocked).
 * 'attention' = functional, heads-up only (e.g. missing primary key). Extensible for future
 * attention-only flags — just return kind: 'attention' for them below.
 */
export type RelationshipIndicatorKind = 'warning' | 'attention';

export interface RelationshipIndicator {
  label: string;
  kind: RelationshipIndicatorKind;
}

export function getRelationshipIndicator(
  flags: RelationshipWarningFlags
): RelationshipIndicator | null {
  if (flags.isCycleStub) return { label: 'Loop', kind: 'warning' };
  if (flags.isDraft) return { label: 'Draft', kind: 'warning' };
  if (flags.isJoinNotConfigured) return { label: 'Join not configured', kind: 'warning' };
  if (flags.isBlocked) return { label: 'Blocked', kind: 'warning' };
  if (flags.isMissingPrimaryKey) return { label: 'No primary key', kind: 'attention' };
  return null;
}

/** True only when the endpoint carries a WARNING-kind indicator (non-functional). Drives the node border. */
export function hasNodeWarning(flags: RelationshipWarningFlags): boolean {
  return getRelationshipIndicator(flags)?.kind === 'warning';
}

/** Edge/connection carries the warning color only for WARNING-kind endpoints — attention-kind (e.g. missing-PK) stays unstyled since the join still works. */
export function hasConnectionWarning(
  source: RelationshipWarningFlags | undefined,
  target: RelationshipWarningFlags | undefined
): boolean {
  return hasNodeWarning(source ?? {}) || hasNodeWarning(target ?? {});
}

// The fan-out (double-count) risk only exists once a join is configured.
export function isMissingPrimaryKeyWarning(
  hasPrimaryKey: boolean | undefined,
  joinConditionsCount: number
): boolean {
  return hasPrimaryKey === false && joinConditionsCount > 0;
}
