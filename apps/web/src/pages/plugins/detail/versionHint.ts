import { formatDateShort } from '../../../utils/date-formatters';

/**
 * The Version tooltip text on the plugin page: what the version is, plus how maintenance
 * moves it.
 *
 * A member never chose this version and cannot pin it, so the sentence has to say that a
 * check happens daily and that a newer one reaches everyone. The next-check clause drops
 * out for a plugin off daily maintenance rather than rendering "Next check: —". The time
 * is formatted in the member's own timezone.
 */
export function versionHint(nextCheckAt: Date | string | null | undefined): string {
  const nextCheck = nextCheckAt ? ` Next check: ${formatDateShort(nextCheckAt)}.` : '';
  return (
    'The highest eligible release. Versions cannot be pinned. Updates are checked daily.' +
    nextCheck +
    ' A newer valid version is applied automatically to everyone using this plugin.'
  );
}
