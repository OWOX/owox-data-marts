export const CYCLE_STUB_TOOLTIP =
  'This data mart is already joined earlier in this branch — stopping here to avoid a loop.';

export const INACCESSIBLE_TOOLTIP = "You don't have access to this data mart.";

interface RelationshipWarningFlags {
  isCycleStub?: boolean;
  isDraft?: boolean;
  isJoinNotConfigured?: boolean;
  isBlocked?: boolean;
  isInaccessible?: boolean;
}

export function getRelationshipWarningLabel(flags: RelationshipWarningFlags): string | null {
  if (flags.isCycleStub) return 'Loop';
  if (flags.isInaccessible) return 'No access';
  if (flags.isDraft) return 'Draft';
  if (flags.isJoinNotConfigured) return 'Join not configured';
  if (flags.isBlocked) return 'Blocked';
  return null;
}

export function hasRelationshipWarning(flags: RelationshipWarningFlags): boolean {
  return getRelationshipWarningLabel(flags) !== null;
}
