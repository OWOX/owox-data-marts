import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';
import { PrepareReportDataOptions } from '../interfaces/data-storage-report-reader.interface';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { computeEffectiveType, integerTypeFor } from '../field-aggregation';
import {
  ROW_COUNT_LABEL,
  UNIQUE_COUNT_LABEL,
  aggregatedColumnAlias,
  aggregatedColumnLabel,
  aggregationFunctionsForColumn,
} from '../../dto/schemas/aggregation-labels';

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
 * - Aggregated columns are expanded to one header per applied function, named
 *   `aggregatedColumnLabel(col, fn)` — the SAME labels the SQL renderer emits as output
 *   aliases, in the SAME order — each with its effective type and aggregate function
 *   set. A column may carry more than one function (each becomes its own output column).
 *   Readers map result rows to headers by name, so the header name MUST equal the SQL
 *   alias.
 * - When `aggregationConfig` is non-empty, a synthetic `Row Count` header (matching the
 *   `COUNT(*) AS "Row Count"` output column) is appended last. Row Count is automatic
 *   for aggregated reports, unless `options.rowCount === false` (the Totals reader opts
 *   out — Row Count is a per-group column, not a grand total).
 */
export function resolveReportDataHeaders(
  nativeHeaders: ReportDataHeader[],
  options: PrepareReportDataOptions | undefined,
  storageType: DataStorageType
): ReportDataHeader[] {
  const filter = options?.columnFilter;
  const aggregations = options?.aggregationConfig ?? [];
  // A metrics-only query has no projected dimensions: the SELECT emits only the
  // synthetic metric / Row Count / Unique Count columns. This is the totals query and the
  // uniqueCount-only report.
  const metricsOnly = aggregations.length > 0 || options?.uniqueCount === true;

  let headers: ReportDataHeader[];
  if (filter && filter.length > 0) {
    const nativeByName = new Map(nativeHeaders.map(h => [h.name, h]));
    const blendedByName = new Map((options?.blendedDataHeaders ?? []).map(h => [h.name, h]));
    headers = filter.map(col => {
      const native = nativeByName.get(col);
      if (native) return native;
      const blended = blendedByName.get(col);
      if (blended) return blended;
      return new ReportDataHeader(col, col);
    });
  } else if (metricsOnly) {
    // No projection on a metrics-only query (empty/absent columnFilter) → emit NO dimension
    // headers. Falling back to all native headers would desync the header list from the
    // SELECT (null-filled rows on name-keyed readers, "column not found" on positional ones).
    headers = [];
  } else {
    // Plain report with no projection → every native column (SELECT *).
    headers = nativeHeaders;
  }

  if (aggregations.length > 0) {
    // Expand each aggregated column into one header per applied function, in rule
    // order — mirroring renderAggregatedSelect so header order == SELECT column order.
    headers = headers.flatMap(header => {
      const fns = aggregationFunctionsForColumn(aggregations, header.name);
      if (fns.length === 0) return [header];
      return fns.map(
        fn =>
          new ReportDataHeader(
            aggregatedColumnLabel(header.name, fn),
            // The display alias must carry the function suffix too, else the sheet writer's
            // `alias || name` renders a bare `<alias>` — dropping `| <FUNC>` and colliding
            // when one aliased column carries several functions.
            header.alias ? aggregatedColumnAlias(header.alias, fn) : undefined,
            header.description,
            // Type can only be derived when the base column type is known (it is for native
            // and blended headers; unknown SQL-override columns stay untyped).
            header.storageFieldType !== undefined
              ? computeEffectiveType(header.storageFieldType, fn, storageType)
              : undefined,
            fn
          )
      );
    });
  }

  // Row Count is automatic for aggregated reports, unless the caller opts out
  // (`rowCount: false`) — the Totals reader does, since Row Count is a per-group column.
  const includeRowCount = options?.rowCount ?? (options?.aggregationConfig?.length ?? 0) > 0;
  if (includeRowCount) {
    headers = [
      ...headers,
      new ReportDataHeader(
        ROW_COUNT_LABEL,
        undefined,
        undefined,
        integerTypeFor(storageType),
        'COUNT'
      ),
    ];
  }

  if (options?.uniqueCount) {
    headers = [
      ...headers,
      new ReportDataHeader(
        UNIQUE_COUNT_LABEL,
        undefined,
        undefined,
        integerTypeFor(storageType),
        'COUNT_DISTINCT'
      ),
    ];
  }

  return headers;
}
