export const CYCLE_STUB_TOOLTIP =
  'This data mart is already joined earlier in this branch — stopping here to avoid a loop.';

interface RelationshipWarningFlags {
  isCycleStub?: boolean;
  isDraft?: boolean;
  isJoinNotConfigured?: boolean;
  isBlocked?: boolean;
}

export function getRelationshipWarningLabel(flags: RelationshipWarningFlags): string | null {
  if (flags.isCycleStub) return 'Loop';
  if (flags.isDraft) return 'Draft';
  if (flags.isJoinNotConfigured) return 'Join not configured';
  if (flags.isBlocked) return 'Blocked';
  return null;
}

export function hasRelationshipWarning(flags: RelationshipWarningFlags): boolean {
  return getRelationshipWarningLabel(flags) !== null;
}
