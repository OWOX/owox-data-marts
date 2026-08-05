/**
 * Builds the toast text for drafts that could not be published.
 *
 * `failedCount` comes from the server rather than `reasons.length`: the API
 * returns deduplicated reasons and no per-draft identifiers, because editing a
 * storage does not imply visibility of every Data Mart inside it.
 */
export function buildPublishFailureMessage(failedCount: number, reasons: string[]): string {
  const plural = failedCount !== 1 ? 's' : '';
  const reason = reasons.length === 1 ? `: ${reasons[0]}` : ' due to different errors';

  return `Failed to publish ${String(failedCount)} Data Mart draft${plural}${reason}. Review them in the Data Marts list and try again.`;
}
