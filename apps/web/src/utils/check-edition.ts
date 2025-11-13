export function checkIsCommunityEdition(flags?: Record<string, unknown> | null): boolean {
  if (!flags || typeof flags !== 'object') {
    return true;
  }
  return flags.LICENSED_APP_EDITION === 'COMMUNITY';
}
