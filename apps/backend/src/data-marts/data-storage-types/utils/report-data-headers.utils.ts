import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';
import { StorageFieldType } from '../../dto/domain/storage-field-type';
import { PrepareReportDataOptions } from '../interfaces/data-storage-report-reader.interface';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { computeEffectiveType, integerTypeFor } from '../field-aggregation';
import { isCalculatedGroupingKey } from '../../calculated-fields/calculated-plan-grain';
import { isAggregateLevel } from '../../calculated-fields/formula-level';
import type { CalculatedFieldPlan } from './sql-clause-renderer';
import type { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import {
  UNIQUE_COUNT_LABEL,
  aggregatedColumnAlias,
  aggregatedColumnLabel,
  aggregationFunctionsForColumn,
} from '../../dto/schemas/aggregation-labels';

/**
 * Resolves the final list of report data headers from the native schema headers and the optional
 * column filter `BlendedReportDataService.resolveBlendingDecision` produced.
 *
 * Readers map rows to headers BY NAME, so every name emitted here must match the SQL renderer's
 * output alias exactly; ORDER need not, and on the blended path does not.
 *
 * A filtered name present in neither the native nor the blended headers still gets a placeholder
 * header, so an SQL override returning unknown columns still emits them.
 *
 * `calculatedFields` headers carry the analyst's DECLARED type — there is no warehouse column to
 * derive one from.
 */
export function resolveReportDataHeaders(
  nativeHeaders: ReportDataHeader[],
  options: PrepareReportDataOptions | undefined,
  storageType: DataStorageType
): ReportDataHeader[] {
  const filter = options?.columnFilter;
  const aggregations = options?.aggregationConfig ?? [];
  const uniqueCountSources = options?.uniqueCountSources ?? [];
  const calculatedFields = options?.calculatedFields ?? [];
  // The SAME predicate the SQL builder uses to emit `COUNT(DISTINCT pk)`: a primary key removed
  // after the report was saved drops the column, so it must drop the header too (F4).
  const mainUniqueCount =
    options?.uniqueCount === true && (options?.primaryKeyColumns?.length ?? 0) > 0;
  // A metrics-only query has no projected dimensions: the SELECT emits only the
  // synthetic metric / Unique Count / calculated-metric columns. This is the totals query, the
  // uniqueCount-only report, and a report selecting ONLY a calculated field — whose name a caller
  // may have stripped from `columnFilter`, leaving it empty.
  // Without `calculatedFields` here, an empty `columnFilter` falls through to "every native
  // header" below — a header list the SELECT (which projects exactly the metric) does not match:
  // a silent null on BigQuery/Snowflake/Databricks, a hard `Column ... not found` on
  // Athena/Redshift. It reads the GATED `mainUniqueCount`, not the raw flag: with the key gone
  // the SQL emits no metric and falls back to a plain SELECT, so a metrics-only header list here
  // would leave the report with no columns at all for a result full of them.
  //
  // The calculated clause stays LEVEL-BLIND: `composePlainSelectBody` drops the wildcard
  // once any calculated item is present, so a ROW-LEVEL-only selection also projects that one
  // field and nothing else. Counting aggregating fields only would answer with every native
  // header for it.
  const metricsOnly =
    aggregations.length > 0 ||
    mainUniqueCount ||
    uniqueCountSources.length > 0 ||
    calculatedFields.length > 0;

  /**
   * A calculated field named by the filter is resolved HERE rather than by the caller.
   *
   * Its name must not reach the native/blended lookup below — there is no warehouse column behind
   * it, so it would fall through to the `(col, col)` placeholder and publish an untyped header the
   * SELECT never emits. Five producers of `PrepareReportDataOptions` strip it themselves to avoid
   * that, an invariant nothing enforces and a sixth would forget; doing it here makes it
   * unforgettable, and keeps the analyst's chosen POSITION, which a stripped filter has already
   * thrown away.
   */
  const calculatedByName = new Map(calculatedFields.map(metric => [metric.outputName, metric]));
  const placedCalculated = new Set<string>();

  let headers: ReportDataHeader[];
  if (filter && filter.length > 0) {
    const nativeByName = new Map(nativeHeaders.map(h => [h.name, h]));
    const blendedByName = new Map((options?.blendedDataHeaders ?? []).map(h => [h.name, h]));
    headers = filter.flatMap(col => {
      const metric = calculatedByName.get(col);
      if (metric) {
        placedCalculated.add(col);
        return calculatedFieldHeaders(metric, aggregations, storageType);
      }
      const native = nativeByName.get(col);
      if (native) return [native];
      const blended = blendedByName.get(col);
      if (blended) return [blended];
      return [new ReportDataHeader(col, col)];
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
      // A calculated field's headers are already final — `calculatedFieldHeaders` applied the
      // LEVEL rule, which withholds expansion from an aggregate-level formula even when a rule
      // names it. Expanding again here would undo exactly that.
      if (calculatedByName.has(header.name)) return [header];
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

  // A calculated field is typed by the analyst's declaration; there is no warehouse column.
  //
  // `aggregateFunction` stays undefined because no single report function describes a formula, so
  // the header carries the field's LEVEL instead. A bare `undefined` there reads as "ordinary
  // native column", which Looker Studio maps to a re-summable SUM — the non-additive failure this
  // feature exists to remove. The LEVEL travels rather than the fact of being calculated, because
  // a row-level formula is a DIMENSION and must take the ordinary path.
  //
  // UNLESS the REPORT aggregates it: a row-level field carrying a rule is no longer a grouping key,
  // and the renderer emits one aggregate per rule under `aggregatedColumnLabel`, so the headers
  // expand the same way. Named `outputName` regardless, the reader binds to a column the SELECT
  // never emitted. The grain verdict comes off the PLAN, never re-derived from the rules.
  //
  // `alias`/`description` are re-attached here for the same reason the type is: this list is the
  // metric's ONLY header source, and skipping them left a metric aliased "CTR, %" as the one column
  // in its own report still labelled `ctr`.
  // Only the ones the filter did not name: appended last, which is where a caller that stripped
  // the name itself — or a metrics-only query with no filter at all — leaves them.
  for (const metric of calculatedFields) {
    if (placedCalculated.has(metric.outputName)) continue;
    headers = [...headers, ...calculatedFieldHeaders(metric, aggregations, storageType)];
  }

  return headers;
}

/**
 * A calculated field is typed by the analyst's declaration; there is no warehouse column.
 *
 * `aggregateFunction` stays undefined because no single report function describes a formula, so the
 * header carries the field's LEVEL instead. A bare `undefined` there reads as "ordinary native
 * column", which Looker Studio maps to a re-summable SUM — the non-additive failure this feature
 * exists to remove. The LEVEL travels rather than the fact of being calculated, because a row-level
 * formula is a DIMENSION and must take the ordinary path.
 *
 * UNLESS the REPORT aggregates it: a row-level field carrying a rule is no longer a grouping key,
 * and the renderer emits one aggregate per rule under `aggregatedColumnLabel`, so the headers expand
 * the same way. Named `outputName` regardless, the reader binds to a column the SELECT never
 * emitted. The grain verdict comes off the PLAN, never re-derived from the rules.
 *
 * `alias`/`description` are re-attached for the same reason the type is: this is the metric's ONLY
 * header source, and skipping them left a metric aliased "CTR, %" as the one column in its own
 * report still labelled `ctr`.
 */
function calculatedFieldHeaders(
  metric: CalculatedFieldPlan,
  aggregations: AggregationRule[],
  storageType: DataStorageType
): ReportDataHeader[] {
  const fns =
    isCalculatedGroupingKey(metric) || isAggregateLevel(metric.level)
      ? []
      : aggregationFunctionsForColumn(aggregations, metric.outputName);

  if (fns.length === 0) {
    return [
      new ReportDataHeader(
        metric.outputName,
        metric.alias,
        metric.description,
        metric.type as StorageFieldType,
        undefined,
        metric.level
      ),
    ];
  }

  return fns.map(
    fn =>
      new ReportDataHeader(
        aggregatedColumnLabel(metric.outputName, fn),
        metric.alias ? aggregatedColumnAlias(metric.alias, fn) : undefined,
        metric.description,
        // The declared type describes the FORMULA's value, not the aggregate's: a COUNT_DISTINCT
        // over it is an integer count whatever the formula was declared.
        computeEffectiveType(metric.type as StorageFieldType, fn, storageType),
        fn,
        metric.level
      )
  );
}
