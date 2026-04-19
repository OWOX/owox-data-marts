import type { DataMartReport } from '../model/types/data-mart-report';

/**
 * Returns true when at least one column in the report's columnConfig is
 * a valid blended field (i.e. present in the provided set of blended
 * field names).
 *
 * Used by reports list action cells to decide whether to render the
 * "View SQL" icon — it is shown only when the report actually produces
 * blended output.
 */
export function reportHasBlending(
  report: DataMartReport,
  validBlendedFieldNames: Set<string>
): boolean {
  if (validBlendedFieldNames.size === 0 || !report.columnConfig) return false;
  return report.columnConfig.some(name => validBlendedFieldNames.has(name));
}
