/**
 * Builds the toast text for drafts that could not be published.
 *
 * `failedCount` comes from the server rather than `reasons.length`: the API
 * returns deduplicated reasons and no per-draft identifiers, because editing a
 * storage does not imply visibility of every Data Mart inside it.
 */
export function buildPublishFailureMessage(failedCount: number, reasons: string[]): string {
  const plural = failedCount !== 1 ? 's' : '';
  const pronoun = failedCount !== 1 ? 'them' : 'it';

  // No reasons at all is not the same as differing reasons: during a rolling
  // deploy a trigger completed by the previous backend has no `failureReasons`
  // (they live up to the 1-hour TTL), so stay silent on the cause instead of
  // claiming the drafts failed for different ones.
  const reason =
    reasons.length === 0
      ? ''
      : reasons.length === 1
        ? `: ${reasons[0]}`
        : ' due to different errors';

  return `Failed to publish ${String(failedCount)} Data Mart draft${plural}${reason}. Review ${pronoun} in the Data Marts list and try again.`;
}
