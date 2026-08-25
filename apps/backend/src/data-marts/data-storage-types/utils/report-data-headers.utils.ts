import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';
import { StorageFieldType } from '../../dto/domain/storage-field-type';
import { PrepareReportDataOptions } from '../interfaces/data-storage-report-reader.interface';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { computeEffectiveType, integerTypeFor } from '../field-aggregation';
import { isCalculatedGroupingKey } from '../../calculated-fields/calculated-plan-grain';
import { isAggregateLevel } from '../../calculated-fields/formula-level';
import {
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
 *   aliases — each with its effective type and aggregate function set. A column may carry
 *   more than one function (each becomes its own output column). Readers map result rows to
 *   headers BY NAME, so the header name MUST equal the SQL alias. Header order does NOT have
 *   to equal SELECT column order, and on the blended path it does not: a metric-sleeve pull
 * (joined COUNT DISTINCT / SUM / AVG,) is appended after the non-sleeve select items, while the
 *   header for it sits at its own column's position.
 * - `uniqueCountSources` appends one header per joined source, after the main Data Mart's
 *   `Unique Count`. Its `name` is the SQL-safe `outputLabel` (`orders__unique_count`) the sleeve
 *   aliased, and its display alias is the free-form `displayLabel` (`Orders Unique Count`) — the
 *   same name/alias split every blended column header already uses. It is the SAME list the blended
 *   builder rendered its sleeves from, so a source dropped there has no header here either.
 * - `calculatedMetrics` appends one header per selected calculated metric, last. There is no
 *   warehouse column to derive its type from, so it carries the analyst's declared `type` — the
 *   same synthesis Unique Count and the aggregation aliases already use. One that the REPORT
 *   aggregates expands per function instead, exactly as an aggregated column does (#6732).
 */
export function resolveReportDataHeaders(
  nativeHeaders: ReportDataHeader[],
  options: PrepareReportDataOptions | undefined,
  storageType: DataStorageType
): ReportDataHeader[] {
  const filter = options?.columnFilter;
  const aggregations = options?.aggregationConfig ?? [];
  const uniqueCountSources = options?.uniqueCountSources ?? [];
  const calculatedMetrics = options?.calculatedMetrics ?? [];
  // The SAME predicate the SQL builder uses to emit `COUNT(DISTINCT pk)`: a primary key removed
  // after the report was saved drops the column, so it must drop the header too (F4).
  const mainUniqueCount =
    options?.uniqueCount === true && (options?.primaryKeyColumns?.length ?? 0) > 0;
  // A metrics-only query has no projected dimensions: the SELECT emits only the
  // synthetic metric / Unique Count / calculated-metric columns. This is the totals query, the
  // uniqueCount-only report, and a report selecting ONLY a calculated metric (its name was
  // already excluded from `columnFilter` by the caller, so `filter` alone cannot see it).
  // Without `calculatedMetrics` here, an empty `columnFilter` falls through to "every native
  // header" below — a header list the SELECT (which projects exactly the metric) does not match:
  // a silent null on BigQuery/Snowflake/Databricks, a hard `Column ... not found` on
  // Athena/Redshift. It reads the GATED `mainUniqueCount`, not the raw flag: with the key gone
  // the SQL emits no metric and falls back to a plain SELECT, so a metrics-only header list here
  // would leave the report with no columns at all for a result full of them.
  //
  // The calculated clause stays LEVEL-BLIND (#6732): `composePlainSelectBody` drops the wildcard
  // once any calculated item is present, so a ROW-LEVEL-only selection also projects that one
  // field and nothing else. Counting aggregating fields only would answer with every native
  // header for it.
  const metricsOnly =
    aggregations.length > 0 ||
    mainUniqueCount ||
    uniqueCountSources.length > 0 ||
    calculatedMetrics.length > 0;

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
    // Expand each aggregated column into one header per applied function, in rule order —
    // the same labels renderAggregatedSelect (and, for a sleeve metric, the blended builder)
    // emits as output aliases. Readers bind by name, so only the labels must agree, not the
    // positions.
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

  if (mainUniqueCount) {
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

  for (const source of uniqueCountSources) {
    headers = [
      ...headers,
      new ReportDataHeader(
        source.outputLabel,
        source.displayLabel,
        undefined,
        integerTypeFor(storageType),
        'COUNT_DISTINCT'
      ),
    ];
  }

  // A calculated metric has no warehouse column to derive a type from, so it is typed by the
  // analyst's own declaration instead — the same synthesis Unique Count and the aggregation
  // aliases already use above.
  //
  // `aggregateFunction` stays undefined because no single report function describes a formula, so
  // the header carries the field's LEVEL instead: a bare `undefined` there means "an ordinary
  // native column" to consumers, and Looker Studio reads that as METRIC + defaultAggregation SUM
  // + isReaggregatable — i.e. it would re-sum a ratio, the exact non-additive failure this
  // feature exists to remove (spec §8). The level travels rather than the mere fact of being
  // calculated because the destination's answer differs by it: a row-level formula is a DIMENSION
  // and must take the ordinary path (spec §4.5), and the mapper deliberately refuses to re-derive
  // that from the declared type.
  //
  // UNLESS the REPORT aggregates it (#6732 spec §2.1). A row-level field carrying an aggregation
  // rule is no longer a grouping key, and `renderAggregatedSelect` emits one aggregate per rule
  // under `aggregatedColumnLabel` instead of the bare name — so the headers expand the same way an
  // ordinary aggregated column does above, through the same label helper the alias came from.
  // Named `outputName` regardless, the reader binds to a column the SELECT never emitted. The
  // grain verdict is read off the PLAN (`isCalculatedGroupingKey`) and never re-derived from the
  // rules; the rules only say WHICH functions, exactly as they do for the renderer.
  //
  // The analyst's `alias`/`description` travel on the plan and are re-attached here, for the same
  // reason the type is: this list is the metric's ONLY header source. Skipping them left a metric
  // aliased "CTR, %" as the one column in its own report still labelled `ctr`, while every field
  // beside it showed its alias.
  for (const metric of options?.calculatedMetrics ?? []) {
    const fns =
      isCalculatedGroupingKey(metric) || isAggregateLevel(metric.level)
        ? []
        : aggregationFunctionsForColumn(aggregations, metric.outputName);
    if (fns.length === 0) {
      headers = [
        ...headers,
        new ReportDataHeader(
          metric.outputName,
          metric.alias,
          metric.description,
          metric.type as StorageFieldType,
          undefined,
          metric.level
        ),
      ];
      continue;
    }
    headers = [
      ...headers,
      ...fns.map(
        fn =>
          new ReportDataHeader(
            aggregatedColumnLabel(metric.outputName, fn),
            metric.alias ? aggregatedColumnAlias(metric.alias, fn) : undefined,
            metric.description,
            // The declared type describes the FORMULA's value, not the aggregate's: a
            // COUNT_DISTINCT over it is an integer count whatever the formula was declared.
            computeEffectiveType(metric.type as StorageFieldType, fn, storageType),
            fn,
            metric.level
          )
      ),
    ];
  }

  return headers;
}
