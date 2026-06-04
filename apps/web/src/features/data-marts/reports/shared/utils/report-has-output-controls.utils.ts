import type { DataMartReport } from '../model/types/data-mart-report';

/**
 * Returns true when the report has any output controls applied:
 * at least one filter rule, sort rule, or a row limit.
 *
 * Used together with reportHasBlending to decide whether to show the SQL
 * dialog (has controls) or an informational tooltip (no controls).
 */
export function reportHasOutputControls(report: DataMartReport): boolean {
  return (
    (report.filterConfig !== null && report.filterConfig.length > 0) ||
    (report.sortConfig !== null && report.sortConfig.length > 0) ||
    report.limitConfig !== null
  );
}
