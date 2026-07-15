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

export function getRelationshipWarningLabel(flags: RelationshipWarningFlags): string | null {
  if (flags.isCycleStub) return 'Loop';
  if (flags.isDraft) return 'Draft';
  if (flags.isJoinNotConfigured) return 'Join not configured';
  if (flags.isBlocked) return 'Blocked';
  if (flags.isMissingPrimaryKey) return 'No primary key';
  return null;
}

export function hasRelationshipWarning(flags: RelationshipWarningFlags): boolean {
  return getRelationshipWarningLabel(flags) !== null;
}

/** Edge/connection carries the same warning color as either endpoint node. */
export function hasConnectionWarning(
  source: RelationshipWarningFlags | undefined,
  target: RelationshipWarningFlags | undefined
): boolean {
  return hasRelationshipWarning(source ?? {}) || hasRelationshipWarning(target ?? {});
}

// The fan-out (double-count) risk only exists once a join is configured.
export function isMissingPrimaryKeyWarning(
  hasPrimaryKey: boolean | undefined,
  joinConditionsCount: number
): boolean {
  return hasPrimaryKey === false && joinConditionsCount > 0;
}
