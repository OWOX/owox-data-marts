import { BadRequestException, Injectable } from '@nestjs/common';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { DataMart } from '../entities/data-mart.entity';
import { BlendingDecision } from '../dto/domain/blending-decision.dto';
import {
  ReportLike,
  ReportLikeReadPlan,
  hasOutputControls,
  isMetricsOnlyProjection,
} from '../dto/domain/report-like-read-plan';
import { hasMainUniqueCount } from '../dto/schemas/unique-count-sources';
import { BlendableSchemaAccessor, BlendableSchemaService } from './blendable-schema.service';
import { BlendedReportDataService } from './blended-report-data.service';
import { formatBlendedFieldDisplayName } from './blended-field-display-name';
import { isQueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import {
  DataMartTableReferenceService,
  type TableReferenceMemo,
} from './data-mart-table-reference.service';
import {
  CalculatedMetricPlan,
  SqlParameter,
} from '../data-storage-types/utils/sql-clause-renderer';
import {
  calculatedDependencyPlans,
  calculatedFieldLevelOf,
  calculatedFieldsOf,
  excludeCalculatedMetricNames,
  isCalculatedField,
} from '../calculated-fields/calculated-field.utils';
import { isAggregateLevel } from '../calculated-fields/formula-level';
import { hasLiveJoinedReference } from '../calculated-fields/formula-live-reference';
import {
  isCalculatedGroupingKey,
  partitionCalculatedPlans,
} from '../calculated-fields/calculated-plan-grain';
import { routeFilterClauses } from '../calculated-fields/filter-clause-routing';
import { isHavingFilterRule, isWhereFilterRule } from '../dto/domain/filter-clause';
import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import { OutputControlsCapabilityService } from './output-controls-capability.service';
import { OutputControlsValidatorService } from './output-controls-validator.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { inlineAthenaPositionalParams } from '../data-storage-types/athena/adapters/athena-execution-parameters.utils';
import { inlineBigQueryNamedParams } from '../data-storage-types/bigquery/adapters/bigquery-execution-parameters.utils';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import {
  collectSchemaFieldPathDescriptors,
  collectSchemaFieldPathTypes,
  getMainUniqueCountKeyFields,
} from '../data-storage-types/data-mart-schema.utils';
import {
  resolveFieldGovernance,
  withoutCountBesideSleevedCountDistinct,
  NON_SUMMARIZABLE_AGGREGATIONS,
  type AggregationRole,
} from '../dto/schemas/field-aggregation-governance';
import { UNIQUE_COUNT_LABEL } from '../dto/schemas/aggregation-labels';
import { categorizeFieldType } from '../dto/schemas/field-type-category';
import { AggregationRule } from '../dto/schemas/aggregation-config.schema';
import { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { BlendableSchemaDto } from '../dto/domain/blendable-schema.dto';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { StorageFieldType } from '../dto/domain/storage-field-type';
import { JoinedUniqueCountSource } from '../data-storage-types/interfaces/blended-query-builder.interface';

type SchemaFieldDescriptor = ReturnType<typeof collectSchemaFieldPathDescriptors>[number];

@Injectable()
export class ReportSqlComposerService {
  constructor(
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade,
    private readonly tableReferenceService: DataMartTableReferenceService,
    private readonly capabilityService: OutputControlsCapabilityService,
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly outputControlsValidator: OutputControlsValidatorService
  ) {}

  async compose(
    report: ReportLike,
    accessor: BlendableSchemaAccessor,
    precomputedDecision?: BlendingDecision,
    // Reuse an already-resolved schema (totals path) so the decision isn't recomputed.
    precomputedBlendableSchema?: BlendableSchemaDto,
    // Shared across the several compositions one save-time dry run makes — see TableReferenceMemo.
    tableReferences?: TableReferenceMemo
  ): Promise<{
    sql: string;
    params?: SqlParameter[];
    needsBlending: boolean;
    /** Types for the JOINED columns, which the reader cannot resolve from the native schema. */
    blendedDataHeaders?: ReportDataHeader[];
    /** Set when a joined COUNT was dropped beside a COUNT_DISTINCT — headers must follow it. */
    aggregations?: AggregationRule[];
    /** The main Data Mart's CURRENT primary key — gates the `Unique Count` header on the same
     * predicate the SQL gates its column on. */
    primaryKeyColumns?: string[];
    /** The joined sources whose `<source>__unique_count` sleeve this SQL actually renders. Callers
     * that resolve headers themselves MUST forward it, or the column is computed and then dropped. */
    uniqueCountSources?: JoinedUniqueCountSource[];
    /** Calculated metrics this SQL actually projects (main-owner only — spec §5.1). Callers that
     * resolve headers themselves MUST forward it to `resolveReportDataHeaders`, and MUST strip
     * these names out of any `columnFilter` they pass alongside it — the metric already has its
     * own header source, and leaving its name in `columnFilter` too double-emits it. */
    calculatedMetrics?: CalculatedMetricPlan[];
  }> {
    const decision =
      precomputedDecision ??
      (await this.blendedReportDataService.resolveBlendingDecision(
        report,
        accessor,
        precomputedBlendableSchema,
        tableReferences
      ));

    // Post-join aggregation is built into the blended SQL by BlendedReportDataService,
    // so the blended path below already carries any aggregation / date-trunc / row-count.
    if (decision.needsBlending && decision.blendedSql) {
      return {
        sql: decision.blendedSql,
        params: decision.params,
        needsBlending: true,
        blendedDataHeaders: decision.blendedDataHeaders,
        aggregations: decision.aggregations,
        primaryKeyColumns: decision.primaryKeyColumns,
        uniqueCountSources: decision.uniqueCountSources,
        calculatedMetrics: decision.calculatedMetrics,
      };
    }

    if (decision.needsBlending && !decision.blendedSql) {
      throw new BadRequestException({
        message: 'Joined query builder did not produce SQL for this data mart',
        details: {
          errors: [
            {
              code: 'BLENDED_SQL_UNAVAILABLE',
              storageType: report.dataMart.storage.type,
            },
          ],
        },
      });
    }

    // Pre-join filters on a non-blended data mart are nonsensical (no joined CTE
    // to filter); BlendedReportDataService promotes the report to blended path
    // whenever any pre-join filter is present, so this branch only sees a
    // truly non-blended report.
    if (
      !decision.needsBlending &&
      (report.filterConfig ?? []).some(r => r.placement === 'pre-join')
    ) {
      throw new BadRequestException({
        message: 'Pre-join filters are only applicable to joined data marts',
        details: { errors: [{ code: 'PRE_JOIN_FILTERS_REQUIRE_JOINED_DATA_MART' }] },
      });
    }

    const { dataMart } = report;
    if (!dataMart.definition) {
      throw new Error('Data Mart definition is not set.');
    }

    // Column types let Athena cast date/time filter placeholders. Sourced from the
    // persisted schema (same native fields the validator types against).
    const schemaFields = dataMart.schema?.fields ?? [];

    // A calculated metric IS an aggregate (spec §2.3), so selecting one makes the query
    // aggregated even when the report carries no aggregationConfig — the remaining selected
    // columns become its grouping keys (spec §8 states this for HTTP Data's ad-hoc path, and it
    // holds for every surface). Explicit selection only (decision 10): a metric absent from the
    // projection is not composed, so a wildcard caller's output cannot change the day an analyst
    // adds a formula.
    const selectedColumns = decision.columnFilter ?? [];
    const calculatedMetrics = this.buildCalculatedMetricPlans(
      schemaFields,
      selectedColumns,
      report.aggregationConfig ?? undefined
    );
    // A metric renders through its own `calculatedMetrics` channel, never as a plain projected
    // column — leaving its name in `columns` too would double-emit it (once via the formula
    // substitution, once as a bare reference to a column the warehouse does not have).
    const calculatedMetricNames = new Set(calculatedMetrics.map(m => m.outputName));
    const nonMetricColumns =
      excludeCalculatedMetricNames(selectedColumns, calculatedMetricNames) ?? [];

    const needsOutputControlsHandling = hasOutputControls(report) || calculatedMetrics.length > 0;

    if (needsOutputControlsHandling && !this.capabilityService.isSupported(dataMart.storage.type)) {
      throw new BadRequestException({
        message: 'Output controls not yet supported for this storage type',
        details: {
          errors: [{ code: 'OUTPUT_CONTROLS_NOT_SUPPORTED', storageType: dataMart.storage.type }],
        },
      });
    }

    let mainTableReference: string | undefined;
    if (needsOutputControlsHandling) {
      mainTableReference = await this.tableReferenceService.resolveTableName(
        dataMart.id,
        dataMart.projectId,
        tableReferences
      );
    }

    const columnTypes: ReadonlyMap<string, string> | undefined = schemaFields.length
      ? new Map(collectSchemaFieldPathTypes(schemaFields).map(f => [f.name, f.type]))
      : undefined;

    // The clause each predicate belongs in is decided here, from the rule and the field's level,
    // and carried on the rule (D21) — the builders read it and never re-derive it.
    const routed = routeFilterClauses(report.filterConfig ?? undefined, schemaFields);
    const routedFilters = routed.length > 0 ? routed : undefined;

    // A predicate on a Calculated Field compares its FORMULA (#6732 spec §2), so the plan has to
    // reach the builder even when the report does not SELECT the field — the projection channel
    // above is selection-only by design. The restriction's HAVING counts: on the Totals path the
    // report's metric filters are lifted out of `filterConfig` and travel there instead.
    const restriction = 'groupRestriction' in report ? report.groupRestriction : undefined;
    const filterMetrics = this.buildCalculatedMetricPlans(
      schemaFields,
      [
        ...(report.filterConfig ?? []).map(rule => rule.column),
        ...(restriction?.having ?? []).map(rule => rule.column),
      ],
      report.aggregationConfig ?? undefined
    );

    const pkFields = getMainUniqueCountKeyFields(schemaFields);
    const uniqueCount = hasMainUniqueCount(report.uniqueCountConfig);

    // `primaryKeyColumns` comes from the CURRENT schema while `uniqueCountConfig` comes from the
    // STORED report, so removing the mart's PK after saving leaves them disagreeing. The renderer
    // then silently omits the Unique Count metric (no PK to COUNT DISTINCT), but a stored sort on
    // that label would still render `ORDER BY "Unique Count"` against a SELECT that no longer has
    // it — a hard warehouse error on every run, scheduled run, and Generated SQL preview. Drop
    // those sort rules alongside the metric so the report degrades the same way the SELECT does.
    // The editor prunes this on open, but scheduled runs never load the editor.
    const sortConfig =
      uniqueCount && pkFields.length === 0
        ? (report.sortConfig ?? []).filter(rule => rule.column !== UNIQUE_COUNT_LABEL)
        : report.sortConfig;

    const queryResult = await this.queryBuilderFacade.buildQuery(
      dataMart.storage.type,
      dataMart.definition,
      {
        columns: nonMetricColumns,
        filters: routedFilters,
        sort: sortConfig ?? undefined,
        aggregations: report.aggregationConfig ?? undefined,
        dateTruncs: report.dateTruncConfig ?? undefined,
        uniqueCount,
        primaryKeyColumns: pkFields.map(f => f.name),
        limit: report.limitConfig ?? undefined,
        mainTableReference,
        columnTypes,
        // Totals only — a report itself groups, so its HAVING applies directly there.
        groupRestriction: restriction,
        calculatedMetrics: calculatedMetrics.length > 0 ? calculatedMetrics : undefined,
        calculatedFilterMetrics: filterMetrics.length > 0 ? filterMetrics : undefined,
      }
    );

    const primaryKeyColumns = pkFields.map(f => f.name);
    const calculatedMetricsResult = calculatedMetrics.length > 0 ? calculatedMetrics : undefined;
    if (isQueryBuildResult(queryResult)) {
      return {
        sql: queryResult.sql,
        params: queryResult.params,
        needsBlending: false,
        primaryKeyColumns,
        calculatedMetrics: calculatedMetricsResult,
      };
    }
    return {
      sql: queryResult,
      needsBlending: false,
      primaryKeyColumns,
      calculatedMetrics: calculatedMetricsResult,
    };
  }

  /**
   * Composes the report's "Totals" query: a per-column summary computed as a SEPARATE
   * query with NO grouping. A selected column is a totals metric when it is NUMERIC (an auto
   * per-column summary, computed even if the report does not aggregate it) OR the report
   * aggregates it as a metric (the only non-numeric metric signal). Each metric contributes
   * ALL of its governance-allowed aggregations (per-field override, else the type-default) —
   * so a numeric `costs` yields SUM/AVG/MIN/MAX and a text `country` the report aggregates
   * yields COUNT/COUNT_DISTINCT. `ANY_VALUE` and `STRING_AGG` are always excluded (see
   * {@link NON_SUMMARIZABLE_AGGREGATIONS}), so a value can be a number OR a string (MIN/MAX of
   * a text metric). Selected JOINED (blended) fields follow the same rule; a blended metric
   * drives `compose` onto the blended path (still NO GROUP BY). Returns `null` (totals skipped)
   * when no selected column is a totals metric with a summarizable function.
   *
   * Joined `COUNT_DISTINCT`, `SUM`, and `AVG` totals are each computed CORRECTLY at the
   * grand-total grain by a dedicated metric sleeve — `COUNT_DISTINCT` re-joins the raw path
   * and counts distinct across ALL rows; `SUM`/`AVG` carry `DISTINCT (owner, value)` across
   * ALL rows before aggregating (the value-carrying sleeve,) — neither is the
   * pre-join roll-up.
   *
   * (deliberately NOT calling this "EXACT"): a symmetric aggregate is
   * NON-ADDITIVE across the report's own GROUP BY — an entity reachable under two DIFFERENT
   * dimension values is counted once in EACH of those grouped rows (correctly, per-group) but
   * only once in the grand total (also correctly, at the total's own grain). The displayed
   * per-row values summing to something other than the Totals value is therefore EXPECTED for
   * a joined/blended metric with fan-out, not a discrepancy to chase — rows and Totals are each
   * independently correct at their own grain, they just don't add up to each other. A
   * non-blended (main-native) aggregate has no fan-out and stays additive as before. Joined
   * percentile totals go through the same value sleeve, so they are computed over the
   * de-duplicated distribution rather than the fanned one.
   *
   * Totals are otherwise INDEPENDENT of the report's own display aggregation functions — the
   * numeric auto-summary is computed even for a non-aggregated report. Unique
   * Count is NOT part of totals. WHERE filters are respected. HAVING (function-carrying) filters
   * are HONOURED, not dropped: they cannot apply directly to a query with no GROUP BY, so they
   * travel as a `GroupRestriction` and the builder restricts Totals to the ROWS of the groups
   * that survive them (restricting rows, rather than adding up per-group values, is what keeps a
   * symmetric aggregate right). The blending decision is resolved FRESH
   * from this metrics-only plan — never inherited from the full report (which carries dimension
   * columns / the grouped main SQL and would emit GROUP BY, collapsing the grand total to the
   * first group's row). The returned `aggregations`/`columns` let the totals reader resolve
   * headers that match the SQL output columns. The input `report` is never mutated.
   */
  async composeTotals(
    report: ReportLike,
    accessor: BlendableSchemaAccessor
  ): Promise<{
    sql: string;
    params?: SqlParameter[];
    aggregations: AggregationRule[];
    columns: string[];
    blendedDataHeaders?: ReportDataHeader[];
    /** Calculated metrics this SQL actually projects (main-owner only — spec §5.1). Callers MUST
     * strip these names out of `columns` before using it as a reader's `columnFilter`, and MUST
     * forward this alongside it — the metric already has its own header source (this list) and
     * its own SQL channel; `deriveTotalsAggregations` never invents a SUM/AVG/MIN/MAX rule for it
     * (it is already an aggregate), so a bare, unqualified reference to its name is the only
     * double-handling left to guard against. */
    calculatedMetrics?: CalculatedMetricPlan[];
  } | null> {
    const { columns, aggregations, calculatedMetricColumns, blendableSchema } =
      await this.deriveTotalsAggregations(report, accessor);
    // A calculated metric carries NO aggregation rule by design — it already IS an aggregate — so
    // `aggregations.length === 0` does not mean "nothing to total" once one is selected. Reading
    // it that way cost a "CTR by country" report its Totals block outright, and a consumer handed
    // `not_available` falls back to computing the overall ratio itself: the average of the
    // per-country ratios, i.e. precisely the non-additive re-aggregation this feature removes.
    if (aggregations.length === 0 && calculatedMetricColumns.length === 0) {
      return null;
    }

    // HAVING rules filter per-GROUP, and a Totals query has no GROUP BY — one grand-total
    // group — so they cannot apply here directly. Dropping them would make Totals summarise
    // rows the report itself hides, so they travel as a `groupRestriction` instead: the builder
    // recomputes the surviving groups and restricts Totals to THEIR ROWS. Restricting rows (not
    // adding up per-group values) is what keeps a symmetric aggregate right — an entity in two
    // surviving groups still counts once in a joined COUNT DISTINCT.
    // Split on the clause each rule CARRIES, never on `rule.function` (D21): an aggregate-level
    // Calculated Field's rule has none and never can, so a `function` split leaves it in the Totals
    // plan's WHERE — where the query has no GROUP BY at all — and builds no restriction, so Totals
    // summarise rows the report hides. Both failures are quiet, and Totals errors are swallowed.
    const allFilters = routeFilterClauses(
      report.filterConfig ?? undefined,
      report.dataMart.schema?.fields ?? []
    );
    const whereFilters = allFilters.filter(isWhereFilterRule);
    const havingFilters = allFilters.filter(isHavingFilterRule);

    // A restriction is only as sound as the HAVING it is derived from, and this method derives it
    // from the REPORT's rules — which are validated on the report's own path, not on this one
    // (they are lifted out of `filterConfig` here, so the totals plan's own validation never sees
    // them). Today that holds by call order alone: `compose` always runs before `computeTotals`.
    // But `ReportTotalsService.computeTotals` is public with no such precondition declared, and a
    // report saved before the HAVING-on-sleeve gate existed would otherwise have its metric filter
    // rendered from the dedup CTE — the OLD, wrong value — with nothing to say so. Validate the
    // report's own config against the schema already resolved above: no extra I/O, and a failure
    // costs the caller its totals with a reason rather than handing back a plausible wrong number.
    if (havingFilters.length > 0) {
      await this.outputControlsValidator.validateForReport({
        storageType: report.dataMart.storage.type,
        dataMartId: report.dataMart.id,
        projectId: report.dataMart.projectId,
        columnConfig: report.columnConfig ?? null,
        filterConfig: report.filterConfig ?? null,
        sortConfig: report.sortConfig ?? null,
        limitConfig: report.limitConfig ?? null,
        aggregationConfig: report.aggregationConfig ?? null,
        dateTruncConfig: report.dateTruncConfig ?? null,
        uniqueCountConfig: report.uniqueCountConfig ?? null,
        accessor,
        dataMartSchemaFields: report.dataMart.schema?.fields,
        precomputedBlendableSchema: blendableSchema,
      });
    }
    // NOT "every selected column without an aggregation of its own is a dimension" — an
    // AGGREGATE-level calculated metric always satisfies that (it can never legally appear in
    // `aggregationConfig`, see AGGREGATION_ON_CALCULATED_METRIC) without ever being a real GROUP BY
    // key, and left in it reaches `renderKeptGroupsJoin` as a bare, nonexistent `ctr` column
    // reference — an `Unrecognized name` on every dialect. A calculated field the report GROUPS BY
    // is the opposite case (#6732): the report groups by its expression, so a restriction
    // reproducing the plain dimensions alone is coarser than the report and the metric filter keeps
    // a different row set than the report shows. So the filter keeps exactly the grouping keys, and
    // those plans travel with the restriction for the renderer to substitute their formulas.
    const reportSchemaFields = report.dataMart.schema?.fields ?? [];
    const reportColumns = report.columnConfig ?? [];
    const calculatedNames = new Set(calculatedFieldsOf(reportSchemaFields).map(f => f.name));
    const columnDimensions = reportColumns.filter(
      column =>
        !calculatedNames.has(column) &&
        !(report.aggregationConfig ?? []).some(rule => rule.column === column)
    );
    // The REPORT's rules, never the Totals ones derived above: this restriction reproduces the
    // report's own grouping, and a Totals plan makes every selected numeric column a metric. Those
    // same rules also decide the grain, so a row-level field the report AGGREGATES is dropped here
    // exactly as an aggregate-level one is — the report stopped grouping by it, and a restriction
    // one key finer keeps a different row set than the report shows.
    const calculatedDimensions = this.buildCalculatedMetricPlans(
      reportSchemaFields,
      reportColumns,
      report.aggregationConfig ?? undefined
    ).filter(isCalculatedGroupingKey);
    // Column keys first, calculated ones last — the order `renderAggregatedSelect` emits its
    // grouping keys in, which `buildKeptGroupsJoinPairs` then pairs against positionally.
    const reportDimensions = [
      ...columnDimensions,
      ...calculatedDimensions.map(plan => plan.outputName),
    ];
    // The plans behind the metric filters themselves, which the keys above deliberately exclude:
    // a row-level field the report AGGREGATES is no longer a dimension, yet the restriction's
    // HAVING still compares its aggregate and needs the formula and the declared type to build the
    // same argument the report's projection was given (#6732, D18).
    const calculatedHavingMetrics = this.buildCalculatedMetricPlans(
      reportSchemaFields,
      havingFilters.map(rule => rule.column),
      report.aggregationConfig ?? undefined
    );

    const totalsPlan: ReportLikeReadPlan = {
      dataMart: report.dataMart,
      columnConfig: columns,
      filterConfig: whereFilters.length > 0 ? whereFilters : null,
      aggregationConfig: aggregations,
      sortConfig: null,
      dateTruncConfig: null,
      limitConfig: null,
      // Totals are a metrics-only summary — no Unique Count.
      uniqueCountConfig: null,
      groupRestriction:
        havingFilters.length > 0
          ? {
              dimensions: reportDimensions,
              calculatedDimensions:
                calculatedDimensions.length > 0 ? calculatedDimensions : undefined,
              having: havingFilters,
              calculatedHavingMetrics:
                calculatedHavingMetrics.length > 0 ? calculatedHavingMetrics : undefined,
              // The report's own buckets travel WITH the restriction — `dateTruncConfig` above
              // is null (Totals have no GROUP BY of their own), so without this the surviving
              // groups would be recomputed by raw date where the report grouped by month.
              dateTruncs: (report.dateTruncConfig ?? []).filter(rule =>
                reportDimensions.includes(rule.column)
              ),
            }
          : undefined,
    };

    // Reuse the schema resolved while deriving the aggregations (when blended) so the decision
    // and the save-time validator don't recompute it.
    const { sql, params, calculatedMetrics } = await this.compose(
      totalsPlan,
      accessor,
      undefined,
      blendableSchema
    );

    // A joined numeric column is absent from the native headers, so its base type must travel
    // with the totals plan; the header path widens it per aggregation function.
    const blendedDataHeaders = blendableSchema
      ? this.buildBlendedTotalsHeaders(columns, blendableSchema)
      : undefined;

    return { sql, params, aggregations, columns, blendedDataHeaders, calculatedMetrics };
  }

  /**
   * The `CalculatedMetricPlan` for each calculated field `names` mentions, in schema order.
   *
   * Shared by three callers that need the same plans for different halves of one query — the
   * report projection (explicitly SELECTED names), the Totals group restriction, and the predicate
   * channel (the names a FILTER carries, selected or not, #6732 spec §2). A second construction
   * would be a second place for the level fallback to be spelled, and those paths differ by a
   * GROUP BY.
   *
   * `aggregations` are the REPORT's own rules, and this is one of the two seats allowed to read
   * them for the grain question (`partitionCalculatedPlans`, decision D9) — a row-level field the
   * report aggregates stops being a grouping key, and every site downstream reads that off the
   * plan instead of re-deriving it.
   */
  private buildCalculatedMetricPlans(
    schemaFields: readonly DataMartSchemaField[],
    names: readonly string[],
    aggregations: AggregationRule[] | undefined
  ): CalculatedMetricPlan[] {
    const plans = calculatedFieldsOf(schemaFields)
      .filter(f => names.includes(f.name))
      .map(f => ({
        outputName: f.name,
        type: String(f.type),
        formula: f.calculated.formula,
        level: calculatedFieldLevelOf(f, schemaFields),
        // The formulas this one reads (#6732), carried so the renderer can substitute them — and
        // `undefined` rather than `[]` when there are none, so a plan is byte-identical to what it
        // was before this feature for every formula that reads only columns.
        dependencies: calculatedDependencyPlans(f, schemaFields),
        // The metric's own header source — see CalculatedMetricPlan. Empty strings normalize to
        // undefined so `alias || name` fallbacks downstream behave as they do for every other field.
        alias: f.alias?.trim() || undefined,
        description: f.description?.trim() || undefined,
      }));
    return partitionCalculatedPlans(plans, aggregations).all;
  }

  // One base-typed header per selected JOINED column, so the totals reader can resolve a
  // storageFieldType for joined-numeric metrics (native columns are reader-resolved).
  private buildBlendedTotalsHeaders(
    columns: string[],
    blendableSchema: BlendableSchemaDto
  ): ReportDataHeader[] | undefined {
    const blendedByName = new Map(blendableSchema.blendedFields.map(f => [f.name, f]));
    const headers: ReportDataHeader[] = [];
    for (const col of columns) {
      const field = blendedByName.get(col);
      if (!field) continue;
      headers.push(
        new ReportDataHeader(
          field.name,
          formatBlendedFieldDisplayName(field),
          field.description || undefined,
          field.type as StorageFieldType
        )
      );
    }
    return headers.length > 0 ? headers : undefined;
  }

  /**
   * For each TOTALS-METRIC field among the report's selected columns, emit one aggregation rule
   * per governance-allowed function (see {@link isTotalsEligible} for the metric rule). Field
   * order follows the selection; function order follows the field's allowed set. The function
   * set comes from the field's governance (per-field allowed set else the type-default) with
   * {@link NON_SUMMARIZABLE_AGGREGATIONS} removed, so a STRING metric contributes
   * COUNT/COUNT_DISTINCT and a numeric one SUM/AVG/MIN/MAX — never a function the type cannot
   * run. Plain non-numeric dimensions (not aggregated by the report), ROW-LEVEL calculated fields
   * (spec §3.2 — a dimension, whatever its declared type, and out of Totals even once the report
   * aggregates it: D11) and unresolved columns are
   * skipped. Selected JOINED (blended) fields follow the same rule via
   * {@link collectBlendedAllowedSets}; a blended metric drives `compose` onto the blended path,
   * whose metrics-only SELECT carries no GROUP BY (every column is an aggregated metric).
   */
  private async deriveTotalsAggregations(
    report: ReportLike,
    accessor: BlendableSchemaAccessor
  ): Promise<{
    columns: string[];
    aggregations: AggregationRule[];
    /**
     * The subset of `columns` that are calculated metrics — the ones deliberately carrying NO
     * aggregation rule of their own. Returned separately because `aggregations.length === 0` is
     * otherwise indistinguishable from "nothing to total", and a report whose ONLY aggregate is a
     * calculated metric would then lose its Totals block entirely — the exact re-aggregation this
     * feature exists to remove, since a consumer told `totals: not_available` computes the overall
     * ratio itself, as the AVERAGE of the per-group ratios.
     */
    calculatedMetricColumns: string[];
    // Present only when blended columns forced a schema resolution — reused downstream.
    blendableSchema?: BlendableSchemaDto;
  }> {
    const totalsSchemaFields = report.dataMart.schema?.fields ?? [];
    const descriptors = collectSchemaFieldPathDescriptors(totalsSchemaFields);
    const byName = new Map(descriptors.map(d => [d.name, d]));
    // The columns the report aggregates — the metric signal for non-numeric fields (WI
    // §D: totals are over the SELECTED metrics; §C: Unique-by-PK is a normal COUNT_DISTINCT
    // metric). A per-field dimension/metric role IS persisted (`aggregationRole`), but it is
    // type-derived in practice, so totals key off type + report aggregation rather than role.
    const aggregatedColumns = new Set((report.aggregationConfig ?? []).map(rule => rule.column));

    // Only consult the blendable schema when the selection references columns the main
    // schema doesn't own — otherwise a non-blended report pays no schema-resolution cost
    // and stays byte-identical.
    // An EMPTY projection is "the caller selected no dimensions" (a Unique-Count-only MCP
    // request), NOT "project everything" — totalling every numeric column would bill a second
    // warehouse query for numbers nobody asked for. That reading holds only for a METRICS-ONLY
    // plan, exactly as in resolveReportDataHeaders: `[]` is also what PERSISTED legacy rows carry
    // (report-column-config.schema.ts). Such a row predates both aggregations and Unique Count, so
    // it is NOT metrics-only and keeps projecting every native column — a report that has been
    // totalling those for months does not lose its Totals to this. A metrics-only `[]` emits no
    // dimension columns at all, so an empty Totals block there is the report's own shape.
    const metricsOnly = isMetricsOnlyProjection(report.aggregationConfig, report.uniqueCountConfig);
    const projectedExplicit =
      report.columnConfig != null && (report.columnConfig.length > 0 || metricsOnly);
    const hasUnknownColumns =
      projectedExplicit && report.columnConfig!.some(name => !byName.has(name));
    const blendableSchema = hasUnknownColumns
      ? await this.blendableSchemaService.computeBlendableSchema(
          report.dataMart.id,
          report.dataMart.projectId,
          accessor
        )
      : undefined;
    const blendedByName = blendableSchema
      ? this.collectBlendedAllowedSets(blendableSchema, aggregatedColumns)
      : new Map<string, ReportAggregateFunction[]>();

    // A calculated metric is excluded from the legacy (no explicit columnConfig) fallback the
    // same way `HttpDataColumnResolver`'s implicit-all resolution excludes it (decision 10):
    // composed only when asked for by name, so a pre-existing legacy report's Totals block cannot
    // change shape the day an analyst adds a formula to the schema.
    const projected = projectedExplicit
      ? report.columnConfig!
      : descriptors.filter(d => !isCalculatedField(d.field)).map(d => d.name);

    const columns: string[] = [];
    const aggregations: AggregationRule[] = [];
    const calculatedMetricColumns: string[] = [];
    for (const name of projected) {
      const descriptor = byName.get(name);
      if (
        descriptor &&
        isCalculatedField(descriptor.field) &&
        // Through the seat, never `isRowLevelCalculatedField`: the persisted level is a cache, and
        // reading it here would drop `roas = revenue / cost` from Totals as if it were a dimension
        // — silently absent, with the report's own SQL treating it as the metric it is (D13).
        !isAggregateLevel(calculatedFieldLevelOf(descriptor.field, totalsSchemaFields))
      ) {
        // DECISION D11 — a Calculated Field is never given a Totals aggregation of its own making,
        // whatever the report does with it. Keyed on the LEVEL and never on the declared type,
        // which is the analyst's free choice: a row-level formula declared FLOAT passes
        // `isTotalsEligible`. The skip covers BOTH shapes a row-level field can be in, and it is
        // the decision in each:
        //
        // NOT aggregated by the report — a row-level formula is a DIMENSION (spec §3.2), skipped
        // exactly as a plain non-numeric dimension is. Admitted, it lands in `columns`, returns
        // through `compose` as a plan with `level: 'column'`, and the aggregated renderer GROUPS BY
        // its expression — so the Totals query returns one row per row-level group and
        // `ReportTotalsService.computeTotals` publishes `dataRows[0]`, an arbitrary group's value,
        // as the report-wide total. No exception, no log line, and MCP labels it
        // `calculated_by_owox`.
        //
        // AGGREGATED by the report (slice 3) — it is a metric OF THAT REPORT, and `isTotalsEligible`
        // reads "the report aggregates it" as exactly that signal, so this skip firing FIRST is the
        // only thing keeping it out. That is D11 and not an oversight: the aggregation belongs to
        // the report, not to the field, so the Totals cell is deliberately EMPTY — a visible absence
        // rather than a number computed at a grain nobody asked for. Pinned by the spec's own name
        // in report-sql-composer.aggregation.spec.ts ('D11: an aggregation rule on it still does not
        // make it a totals metric'); a slice that wants that total has to change D11, not this line.
        continue;
      }
      if (descriptor && isCalculatedField(descriptor.field)) {
        // Already an aggregate (spec §2.3): Totals renders it through the SAME formula-
        // substitution channel as the main report (`compose()`'s `calculatedMetrics`, keyed off
        // this very `columns` list), never through an invented SUM/AVG/MIN/MAX — that would both
        // double-count an already-aggregated value and desync the header list from the SQL (one
        // output column expanding into four). It reaches `projected` only via EXPLICIT selection;
        // the legacy fallback just above already leaves it out.
        columns.push(name);
        calculatedMetricColumns.push(name);
        continue;
      }
      const allowed = this.resolveTotalsAllowedForColumn(
        name,
        byName,
        blendedByName,
        aggregatedColumns
      );
      if (allowed.length === 0) {
        continue;
      }
      columns.push(name);
      for (const fn of allowed) {
        aggregations.push({ column: name, function: fn });
      }
    }
    return { columns, aggregations, calculatedMetricColumns, blendableSchema };
  }

  // The load-bearing totals metric rule, shared by the native and joined paths so they cannot
  // silently diverge (the symmetry the totals tests guard): a field is a totals metric when it
  // is NUMERIC (an auto per-column summary) OR the report aggregates it (`aggregationConfig`) —
  // the only non-numeric metric signal, since the persisted `aggregationRole` is type-derived
  // in practice.
  private isTotalsEligible(
    type: string,
    name: string,
    aggregatedColumns: ReadonlySet<string>
  ): boolean {
    return categorizeFieldType(type) === 'number' || aggregatedColumns.has(name);
  }

  private resolveTotalsAllowedForColumn(
    name: string,
    mainByName: ReadonlyMap<string, SchemaFieldDescriptor>,
    blendedByName: ReadonlyMap<string, ReportAggregateFunction[]>,
    aggregatedColumns: ReadonlySet<string>
  ): ReportAggregateFunction[] {
    const descriptor = mainByName.get(name);
    let allowed: ReportAggregateFunction[];
    if (descriptor) {
      if (!this.isTotalsEligible(descriptor.type, name, aggregatedColumns)) {
        return [];
      }
      // Governance decides which functions are valid for the type, so a STRING metric yields
      // COUNT/COUNT_DISTINCT rather than a SUM/AVG it can't run.
      allowed = resolveFieldGovernance(descriptor.type, {
        aggregationRole: descriptor.field.aggregationRole as AggregationRole | undefined,
        allowedAggregations: descriptor.field.allowedAggregations as
          | ReportAggregateFunction[]
          | undefined,
      }).allowedAggregations;
    } else {
      // Joined (blended) field: eligibility + clamping already applied in collectBlendedAllowedSets.
      allowed = blendedByName.get(name) ?? [];
    }
    return allowed.filter(fn => !NON_SUMMARIZABLE_AGGREGATIONS.has(fn));
  }

  // Joined fields that are totals metrics (same rule as the native path — see isTotalsEligible),
  // mapped to their post-join allowed set. The per-field `postJoinAggregations` override (else
  // the type-default) is CLAMPED through resolveFieldGovernance to the functions the type
  // actually supports — mirroring the native path — so a stale override (e.g. a SUM saved before
  // the field became STRING) cannot inject SQL the warehouse rejects and silently null the whole
  // totals block. ANY_VALUE / STRING_AGG are stripped later in resolveTotalsAllowedForColumn.
  //
  // A joined COUNT_DISTINCT, SUM, or AVG total is computed CORRECTLY at the grand-total grain
  // by a dedicated metric sleeve (COUNT_DISTINCT re-joins the raw path and counts distinct
  // across all rows; SUM/AVG carry DISTINCT (owner, value) across all rows first,),
  // not by the pre-join roll-up. this is NOT "exact" in the sense of summing
  // to the report's own per-group row values — a symmetric aggregate is non-additive across
  // GROUP BY (see composeTotals' doc comment).
  private collectBlendedAllowedSets(
    blendableSchema: BlendableSchemaDto,
    aggregatedColumns: ReadonlySet<string>
  ): Map<string, ReportAggregateFunction[]> {
    const result = new Map<string, ReportAggregateFunction[]>();
    for (const blendedField of blendableSchema.blendedFields) {
      if (blendedField.isHidden) {
        continue;
      }
      if (!this.isTotalsEligible(blendedField.type, blendedField.name, aggregatedColumns)) {
        continue;
      }
      const allowed = resolveFieldGovernance(blendedField.type, {
        allowedAggregations: blendedField.postJoinAggregations,
      }).allowedAggregations;
      result.set(blendedField.name, withoutCountBesideSleevedCountDistinct(allowed));
    }
    return result;
  }

  /**
   * Like {@link compose}, but returns a STATIC, self-contained SQL string with no
   * runtime parameters — for paths that have no parameter-binding channel: a copied
   * data-mart SQL definition (persisted) and the "generated SQL" preview (shown +
   * dry-run-validated). Returning the bound SQL with bare `?`/`@p` there would
   * persist / preview SQL that cannot run.
   *
   * Both supported dialects render value placeholders inside a CAST for date/time
   * columns, so inlining a string literal yields runnable SQL: Athena's positional
   * `?` becomes a literal, BigQuery's named `@p` becomes a literal. Reports without
   * output-control params (sort/limit-only, relative_date, or no controls) pass
   * through unchanged.
   */
  async composeStatic(
    report: ReportLike,
    accessor: BlendableSchemaAccessor,
    precomputedDecision?: BlendingDecision,
    precomputedBlendableSchema?: BlendableSchemaDto,
    tableReferences?: TableReferenceMemo
  ): Promise<{ sql: string }> {
    const composed = await this.compose(
      report,
      accessor,
      precomputedDecision,
      precomputedBlendableSchema,
      tableReferences
    );
    return {
      sql: this.inlineStaticSql(report.dataMart.storage.type, composed.sql, composed.params),
    };
  }

  /**
   * A metrics-only plan for the warehouse dry run at schema-save time (Task 10): the given
   * metric names, no dimensions, this Data Mart as main.
   *
   * Which builder it composes through depends on what the formulas actually read, and it MUST:
   * dry-running a joined formula on the flat path renders `{{ref path="orders" field="amount"}}`
   * as `main."amount"`, which is wrong in two ways and silent in one of them — an "Unrecognized
   * name" when main has no such column, and a valid read of a DIFFERENT column when it happens to
   * have one, which stamps `warehouseValidation: 'passed'` for a query the warehouse never saw.
   *
   * - **No live joined reference** (the ordinary case): `columnFilter` set to exactly `metricNames`
   *   is a complete, self-contained `BlendingDecision` — it carries a projection and nothing else
   *   needs deciding — so it is passed in precomputed. `resolveBlendingDecision` is skipped
   *   entirely, and with it every accessor consumer on this path, so the composition is
   *   byte-identical to before and costs no schema resolution.
   * - **A live joined reference**: the decision is RESOLVED, exactly as for a report, so the dry
   *   run validates the same blended SQL a report run will build. This needs the SAVING user's
   *   identity: `computeBlendableSchema` runs a per-user access pass whose `getRoleScope` UPSERTS a
   *   default role scope for whatever user id it is handed, so a fabricated `{ userId: '' }` would
   *   WRITE rows for a user that does not exist. With no identity there is nothing safe to read the
   *   join tree with, so the dry run is refused rather than quietly falling back to the flat path —
   *   which would render a reference the warehouse cannot resolve on every run, instead of once at
   *   save time. (Unreachable from the save path: `CalculatedFieldValidatorService` already refuses
   *   a joined reference it had no identity to verify, and never reaches its dry run.)
   *
   * `precomputedBlendableSchema` lets the caller hand over the join tree it already resolved for
   * validation, so a joined save reads it once rather than three times (here, and again inside
   * `validateForReport`).
   *
   * PRECONDITION the caller must uphold, silently: `dataMart.schema` is read AS GIVEN to find
   * each metric's formula (`calculatedFieldsOf(dataMart.schema.fields)` inside `compose`), so the
   * `dataMart` passed in MUST already carry the schema being validated — e.g. the just-parsed
   * schema about to be saved — never a stale, still-persisted one. Composing from the wrong schema
   * fails quietly and wrongly in both directions: a brand-new metric absent from a stale schema is
   * rejected as an unknown column, and a just-edited formula's OLD text is what actually gets
   * dry-run while the new (possibly broken) one is saved as `warehouseValidation: 'passed'`.
   */
  async composeMetricsOnly(
    dataMart: DataMart,
    metricNames: string[],
    accessor?: BlendableSchemaAccessor,
    precomputedBlendableSchema?: BlendableSchemaDto,
    tableReferences?: TableReferenceMemo
  ): Promise<{ sql: string }> {
    const plan: ReportLikeReadPlan = {
      dataMart,
      columnConfig: metricNames,
    };

    const joinedMetrics = calculatedFieldsOf(dataMart.schema?.fields ?? []).filter(
      f => metricNames.includes(f.name) && hasLiveJoinedReference(f.calculated.formula)
    );

    if (joinedMetrics.length === 0) {
      const flatDecision: BlendingDecision = {
        needsBlending: false,
        columnFilter: metricNames,
      };
      // The fallback is never actually consulted — resolveBlendingDecision is skipped whenever a
      // decision is precomputed, and that is the accessor's only consumer on this branch — but a
      // real accessor is preferred over it so that inertness stops being a property of another
      // file's control flow.
      return this.composeStatic(
        plan,
        accessor ?? { userId: '', roles: [] },
        flatDecision,
        undefined,
        tableReferences
      );
    }

    if (!accessor?.userId) {
      throw new BusinessViolationException(
        `The calculated field${joinedMetrics.length > 1 ? 's' : ''} ` +
          `[${joinedMetrics.map(f => f.name).join(', ')}] read from a joined Data Mart, which ` +
          `cannot be validated without the saving user's identity`,
        { calculatedFields: joinedMetrics.map(f => f.name) }
      );
    }

    return this.composeStatic(
      plan,
      accessor,
      undefined,
      precomputedBlendableSchema,
      tableReferences
    );
  }

  /**
   * Inlines bound parameters into a self-contained, runnable SQL string for paths
   * with no parameter-binding channel: copied/persisted SQL, the generated-SQL
   * preview, and the run-history record. Athena positional `?` and BigQuery named
   * `@p` become literals (both dialects wrap value placeholders in a CAST so
   * date/time literals stay valid). No params — sort/limit-only, relative_date, no
   * controls, or literal-inlining dialects (Redshift/Snowflake/Databricks) — returns
   * the SQL unchanged.
   */
  inlineStaticSql(storageType: DataStorageType, sql: string, params?: SqlParameter[]): string {
    if (!params?.length) return sql;
    switch (storageType) {
      case DataStorageType.AWS_ATHENA:
        return inlineAthenaPositionalParams(sql, params);
      case DataStorageType.GOOGLE_BIGQUERY:
      case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
        return inlineBigQueryNamedParams(sql, params);
      default:
        throw new BusinessViolationException(
          'Generating static SQL for a report with value filters is not supported for this storage type.',
          { storageType }
        );
    }
  }
}
