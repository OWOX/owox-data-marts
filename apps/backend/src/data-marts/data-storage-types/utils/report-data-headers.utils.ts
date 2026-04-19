import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';
import { PrepareReportDataOptions } from '../interfaces/data-storage-report-reader.interface';

/**
 * Resolves the final list of report data headers from the native schema
 * headers and an optional column filter produced by
 * `BlendedReportDataService.resolveBlendingDecision`.
 *
 * Behavior:
 * - When `options` is not provided or `columnFilter` is empty, returns the
 *   native headers unchanged (default: every column from the schema).
 * - When `columnFilter` is set, returns a new list containing only the
 *   headers whose `name` appears in the filter, preserving the filter order.
 * - Columns not found in native headers fall back to the blended headers
 *   supplied via `options.blendedDataHeaders`, and finally to a minimal
 *   `ReportDataHeader(name, name)` placeholder so the reader still emits a
 *   column (e.g. for SQL override results that contain unknown names).
 */
export function resolveReportDataHeaders(
  nativeHeaders: ReportDataHeader[],
  options?: PrepareReportDataOptions
): ReportDataHeader[] {
  const filter = options?.columnFilter;
  if (!filter || filter.length === 0) {
    return nativeHeaders;
  }

  const nativeByName = new Map(nativeHeaders.map(h => [h.name, h]));
  const blendedByName = new Map((options?.blendedDataHeaders ?? []).map(h => [h.name, h]));

  return filter.map(col => {
    const native = nativeByName.get(col);
    if (native) return native;
    const blended = blendedByName.get(col);
    if (blended) return blended;
    return new ReportDataHeader(col, col);
  });
}
