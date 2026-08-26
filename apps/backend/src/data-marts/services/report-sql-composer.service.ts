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
import { CalculatedFieldPlan, SqlParameter } from '../data-storage-types/utils/sql-clause-renderer';
import {
  calculatedDependencyPlans,
  calculatedFieldLevelOf,
  calculatedFieldsOf,
  excludeCalculatedFieldNames,
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
    /** Calculated fields this SQL actually projects (main-owner only). Callers that
     * resolve headers themselves MUST forward it to `resolveReportDataHeaders`, and MUST strip
     * these names out of any `columnFilter` they pass alongside it — the metric already has its
     * own header source, and leaving its name in `columnFilter` too double-emits it. */
    calculatedFields?: CalculatedFieldPlan[];
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
        calculatedFields: decision.calculatedFields,
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

    // An AGGREGATE-LEVEL calculated field is already an aggregate, so selecting one makes the
    // query aggregated even when the report carries no aggregationConfig — the remaining selected
    // columns become its grouping keys. Explicit selection only: a metric absent from the
    // projection is not composed, so a wildcard caller's output cannot change the day an analyst
    // adds a formula.
    const selectedColumns = decision.columnFilter ?? [];
    const calculatedFields = this.buildCalculatedFieldPlans(
      schemaFields,
      selectedColumns,
      report.aggregationConfig ?? undefined
    );
    // A metric renders through its own `calculatedFields` channel, never as a plain projected
    // column — leaving its name in `columns` too would double-emit it (once via the formula
    // substitution, once as a bare reference to a column the warehouse does not have).
    const calculatedFieldNames = new Set(calculatedFields.map(m => m.outputName));
    const nonMetricColumns =
      excludeCalculatedFieldNames(selectedColumns, calculatedFieldNames) ?? [];

    const needsOutputControlsHandling = hasOutputControls(report) || calculatedFields.length > 0;

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
    // and carried on the rule — the builders read it and never re-derive it.
    const routed = routeFilterClauses(report.filterConfig ?? undefined, schemaFields);
    const routedFilters = routed.length > 0 ? routed : undefined;

    // A predicate on a Calculated Field compares its FORMULA, so the plan has to
    // reach the builder even when the report does not SELECT the field — the projection channel
    // above is selection-only by design. The restriction's HAVING counts: on the Totals path the
    // report's metric filters are lifted out of `filterConfig` and travel there instead.
    const restriction = 'groupRestriction' in report ? report.groupRestriction : undefined;
    const filterMetrics = this.buildCalculatedFieldPlans(
      schemaFields,
      [
        ...(report.filterConfig ?? []).map(rule => rule.column),
        ...(restriction?.having ?? []).map(rule => rule.column),
      ],
      report.aggregationConfig ?? undefined
    );

    const pkFields = getMainUniqueCountKeyFields(schemaFields);
    const uniqueCount = hasMainUniqueCount(report.uniqueCountConfig);

    // `primaryKeyColumns` comes from the CURRENT schema and `uniqueCountConfig` from the STORED
    // report, so removing the mart's PK after saving leaves them disagreeing: the renderer omits
    // the Unique Count metric, while a stored sort on that label still emits
    // `ORDER BY "Unique Count"` against a SELECT that no longer has it. Dropped together — the
    // editor prunes this on open, but scheduled runs never load the editor.
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
        calculatedFields: calculatedFields.length > 0 ? calculatedFields : undefined,
        calculatedFilterMetrics: filterMetrics.length > 0 ? filterMetrics : undefined,
      }
    );

    const primaryKeyColumns = pkFields.map(f => f.name);
    const calculatedFieldsResult = calculatedFields.length > 0 ? calculatedFields : undefined;
    if (isQueryBuildResult(queryResult)) {
      return {
        sql: queryResult.sql,
        params: queryResult.params,
        needsBlending: false,
        primaryKeyColumns,
        calculatedFields: calculatedFieldsResult,
      };
    }
    return {
      sql: queryResult,
      needsBlending: false,
      primaryKeyColumns,
      calculatedFields: calculatedFieldsResult,
    };
  }

  /**
   * Composes the report's "Totals" query: a per-column summary computed as a SEPARATE query with NO
   * grouping. Returns `null` when no selected column qualifies.
   *
   * A symmetric aggregate is NON-ADDITIVE across the report's GROUP BY: an entity reachable under
   * two dimension values counts once in each grouped row and once in the grand total, both
   * correctly. Per-row values not summing to Totals is EXPECTED, not a discrepancy.
   *
   * HAVING filters cannot apply to a query with no GROUP BY, so they travel as a `GroupRestriction`
   * and the builder restricts Totals to the ROWS of the surviving groups — restricting rows rather
   * than adding up per-group values is what keeps a symmetric aggregate right.
   *
   * The blending decision is resolved FRESH; inheriting the report's would carry dimension columns
   * and emit a GROUP BY that collapses the grand total to the first group's row.
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
    /** Calculated fields this SQL actually projects (main-owner only). Callers MUST
     * strip these names out of `columns` before using it as a reader's `columnFilter`, and MUST
     * forward this alongside it — the metric already has its own header source (this list) and
     * its own SQL channel; `deriveTotalsAggregations` never invents a SUM/AVG/MIN/MAX rule for it
     * (it is already an aggregate), so a bare, unqualified reference to its name is the only
     * double-handling left to guard against. */
    calculatedFields?: CalculatedFieldPlan[];
  } | null> {
    const { columns, aggregations, calculatedFieldColumns, blendableSchema } =
      await this.deriveTotalsAggregations(report, accessor);
    // A calculated field carries NO aggregation rule by design — it already IS an aggregate — so
    // `aggregations.length === 0` does not mean "nothing to total" once one is selected. Reading
    // it that way cost a "CTR by country" report its Totals block outright, and a consumer handed
    // `not_available` falls back to computing the overall ratio itself: the average of the
    // per-country ratios, i.e. precisely the non-additive re-aggregation this feature removes.
    if (aggregations.length === 0 && calculatedFieldColumns.length === 0) {
      return null;
    }

    // Split on the clause each rule CARRIES, never on `rule.function`: an aggregate-level
    // Calculated Field's rule has none and never can, so a `function` split leaves it in the Totals
    // plan's WHERE and builds no restriction — Totals then summarise rows the report hides. Quiet
    // either way, since Totals errors are swallowed.
    const allFilters = routeFilterClauses(
      report.filterConfig ?? undefined,
      report.dataMart.schema?.fields ?? []
    );
    const whereFilters = allFilters.filter(isWhereFilterRule);
    const havingFilters = allFilters.filter(isHavingFilterRule);

    // The restriction is derived from the REPORT's rules, which are validated on the report's path
    // and not on this one — they are lifted out of `filterConfig` here, so the totals plan's own
    // validation never sees them. `computeTotals` is public with no precondition declared, so a
    // report saved before the HAVING-on-sleeve gate would render its metric filter from the dedup
    // CTE, the wrong value, with nothing to say so. Validated here against the schema already
    // resolved above: no extra I/O.
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
    // NOT "every selected column without an aggregation of its own is a dimension": an
    // AGGREGATE-level metric always satisfies that without being a GROUP BY key, and reaches
    // `renderKeptGroupsJoin` as a bare nonexistent column. A calculated field the report GROUPS BY
    // is the opposite case — the report groups by its expression, so a restriction reproducing the
    // plain dimensions alone is coarser and keeps a different row set.
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
    const calculatedDimensions = this.buildCalculatedFieldPlans(
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
    // same argument the report's projection was given.
    const calculatedHavingMetrics = this.buildCalculatedFieldPlans(
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
    const { sql, params, calculatedFields } = await this.compose(
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

    return { sql, params, aggregations, columns, blendedDataHeaders, calculatedFields };
  }

  /**
   * The `CalculatedFieldPlan` for each calculated field `names` mentions, in schema order.
   *
   * Shared by three callers — the report projection, the Totals group restriction and the predicate
   * channel — because a second construction would be a second place for the level fallback to be
   * spelled, and those paths differ by a GROUP BY.
   *
   * `aggregations` are the REPORT's own rules, and this is one of the two seats allowed to read
   * them for the grain question: a row-level field the report aggregates stops being a grouping
   * key, and every site downstream reads that off the plan.
   */
  private buildCalculatedFieldPlans(
    schemaFields: readonly DataMartSchemaField[],
    names: readonly string[],
    aggregations: AggregationRule[] | undefined
  ): CalculatedFieldPlan[] {
    const plans = calculatedFieldsOf(schemaFields)
      .filter(f => names.includes(f.name))
      .map(f => ({
        outputName: f.name,
        type: String(f.type),
        formula: f.calculated.formula,
        level: calculatedFieldLevelOf(f, schemaFields),
        // The formulas this one reads, carried so the renderer can substitute them — and
        // `undefined` rather than `[]` when there are none, so a plan is byte-identical to what it
        // was before this feature for every formula that reads only columns.
        dependencies: calculatedDependencyPlans(f, schemaFields),
        // The metric's own header source — see CalculatedFieldPlan. Empty strings normalize to
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
   * For each TOTALS-METRIC field among the report's selected columns, one aggregation rule per
   * governance-allowed function, minus {@link NON_SUMMARIZABLE_AGGREGATIONS} — so a STRING metric
   * contributes COUNT/COUNT_DISTINCT and a numeric one SUM/AVG/MIN/MAX, never a function the type
   * cannot run.
   *
   * Skipped: plain non-numeric dimensions, unresolved columns, and ROW-LEVEL calculated fields —
   * a dimension whatever its declared type, and out of Totals even once the report aggregates it.
   */
  private async deriveTotalsAggregations(
    report: ReportLike,
    accessor: BlendableSchemaAccessor
  ): Promise<{
    columns: string[];
    aggregations: AggregationRule[];
    /**
     * The subset of `columns` that are calculated fields — the ones deliberately carrying NO
     * aggregation rule. Returned separately because `aggregations.length === 0` is otherwise
     * indistinguishable from "nothing to total", and a report whose only aggregate is a calculated
     * metric would lose its Totals block — leaving the consumer to average the per-group ratios,
     * which is the re-aggregation this feature exists to remove.
     */
    calculatedFieldColumns: string[];
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
    // An EMPTY projection means "the caller selected no dimensions", NOT "project everything" —
    // totalling every numeric column would bill a second warehouse query for numbers nobody asked
    // for. Only for a METRICS-ONLY plan, though: `[]` is also what PERSISTED legacy rows carry, and
    // those predate aggregations, so they keep projecting every native column.
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

    // A calculated field is excluded from the legacy (no explicit columnConfig) fallback the
    // same way `HttpDataColumnResolver`'s implicit-all resolution excludes it:
    // composed only when asked for by name, so a pre-existing legacy report's Totals block cannot
    // change shape the day an analyst adds a formula to the schema.
    const projected = projectedExplicit
      ? report.columnConfig!
      : descriptors.filter(d => !isCalculatedField(d.field)).map(d => d.name);

    const columns: string[] = [];
    const aggregations: AggregationRule[] = [];
    const calculatedFieldColumns: string[] = [];
    for (const name of projected) {
      const descriptor = byName.get(name);
      if (
        descriptor &&
        isCalculatedField(descriptor.field) &&
        // Through the seat, never `isRowLevelCalculatedField`: the persisted level is a cache, and
        // reading it here would drop `roas = revenue / cost` from Totals as if it were a dimension
        // — silently absent, with the report's own SQL treating it as the metric it is.
        !isAggregateLevel(calculatedFieldLevelOf(descriptor.field, totalsSchemaFields))
      ) {
        // A ROW-LEVEL Calculated Field never gets a Totals aggregation, whatever the report does
        // with it. Keyed on the LEVEL, never on the declared type, which is the analyst's free
        // choice.
        //
        // Left in while NOT aggregated, it lands in `columns` and the aggregated renderer GROUPS BY
        // its expression, so the Totals query returns one row per group and `computeTotals`
        // publishes `dataRows[0]` — an arbitrary group's value — as the report-wide total, with no
        // exception and no log line.
        //
        // AGGREGATED by the report it is a metric of THAT REPORT, so the Totals cell is
        // deliberately EMPTY: a visible absence rather than a number at a grain nobody asked for.
        continue;
      }
      if (descriptor && isCalculatedField(descriptor.field)) {
        // Already an aggregate: Totals renders it through the SAME formula-
        // substitution channel as the main report (`compose()`'s `calculatedFields`, keyed off
        // this very `columns` list), never through an invented SUM/AVG/MIN/MAX — that would both
        // double-count an already-aggregated value and desync the header list from the SQL (one
        // output column expanding into four). It reaches `projected` only via EXPLICIT selection;
        // the legacy fallback just above already leaves it out.
        columns.push(name);
        calculatedFieldColumns.push(name);
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
    return { columns, aggregations, calculatedFieldColumns, blendableSchema };
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

  // Joined fields that are totals metrics, mapped to their post-join allowed set. The per-field
  // override is CLAMPED to the functions the type supports, so a stale one — a SUM saved before the
  // field became STRING — cannot inject SQL the warehouse rejects and silently null the whole
  // totals block.
  //
  // A joined COUNT_DISTINCT, SUM or AVG total is computed at the grand-total grain by a metric
  // sleeve, not by the pre-join roll-up. That is not "exact" in the sense of summing to the
  // report's own per-group values — see `composeTotals`.
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
   * A metrics-only plan for the warehouse dry run at schema-save time: the given metric names, no
   * dimensions, this Data Mart as main.
   *
   * Which builder it composes through depends on what the formulas READ, and it must: dry-running a
   * joined formula on the flat path renders the reference as `main."amount"` — "Unrecognized name"
   * when main has no such column, a read of a DIFFERENT column when it does, stamping
   * `warehouseValidation: 'passed'` for a query nobody ran.
   *
   * A live joined reference makes the decision resolve as for a report, which needs the SAVING
   * user's identity: `computeBlendableSchema` UPSERTS a default role scope for whatever user id it
   * is handed. Without an identity the dry run is refused rather than falling back to the flat path.
   *
   * PRECONDITION, silent: `dataMart.schema` is read AS GIVEN — from a stale one, an edited formula's
   * OLD text is dry-run while the new one is saved as `passed`.
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
