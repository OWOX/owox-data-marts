import { BadRequestException, Injectable } from '@nestjs/common';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { BlendingDecision } from '../dto/domain/blending-decision.dto';
import {
  ReportLike,
  ReportLikeReadPlan,
  hasOutputControls,
  shouldIncludeRowCount,
} from '../dto/domain/report-like-read-plan';
import { BlendableSchemaAccessor, BlendableSchemaService } from './blendable-schema.service';
import { BlendedReportDataService } from './blended-report-data.service';
import { isQueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { SqlParameter } from '../data-storage-types/utils/sql-clause-renderer';
import { OutputControlsCapabilityService } from './output-controls-capability.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { inlineAthenaPositionalParams } from '../data-storage-types/athena/adapters/athena-execution-parameters.utils';
import { inlineBigQueryNamedParams } from '../data-storage-types/bigquery/adapters/bigquery-execution-parameters.utils';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import {
  collectSchemaFieldPathDescriptors,
  collectSchemaFieldPathTypes,
  getPrimaryKeyFields,
} from '../data-storage-types/data-mart-schema.utils';
import {
  resolveFieldGovernance,
  NON_SUMMARIZABLE_AGGREGATIONS,
  type AggregationRole,
} from '../dto/schemas/field-aggregation-governance';
import { categorizeFieldType } from '../dto/schemas/field-type-category';
import { AggregationRule } from '../dto/schemas/aggregation-config.schema';
import { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { BlendableSchemaDto } from '../dto/domain/blendable-schema.dto';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { StorageFieldType } from '../dto/domain/storage-field-type';

type SchemaFieldDescriptor = ReturnType<typeof collectSchemaFieldPathDescriptors>[number];

@Injectable()
export class ReportSqlComposerService {
  constructor(
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade,
    private readonly tableReferenceService: DataMartTableReferenceService,
    private readonly capabilityService: OutputControlsCapabilityService,
    private readonly blendableSchemaService: BlendableSchemaService
  ) {}

  async compose(
    report: ReportLike,
    accessor: BlendableSchemaAccessor,
    precomputedDecision?: BlendingDecision,
    // Reuse an already-resolved schema (totals path) so the decision isn't recomputed.
    precomputedBlendableSchema?: BlendableSchemaDto
  ): Promise<{ sql: string; params?: SqlParameter[] }> {
    const decision =
      precomputedDecision ??
      (await this.blendedReportDataService.resolveBlendingDecision(
        report,
        accessor,
        precomputedBlendableSchema
      ));

    // Post-join aggregation is built into the blended SQL by BlendedReportDataService,
    // so the blended path below already carries any aggregation / date-trunc / row-count.
    if (decision.needsBlending && decision.blendedSql) {
      return { sql: decision.blendedSql, params: decision.params };
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

    if (hasOutputControls(report) && !this.capabilityService.isSupported(dataMart.storage.type)) {
      throw new BadRequestException({
        message: 'Output controls not yet supported for this storage type',
        details: {
          errors: [{ code: 'OUTPUT_CONTROLS_NOT_SUPPORTED', storageType: dataMart.storage.type }],
        },
      });
    }

    let mainTableReference: string | undefined;
    if (hasOutputControls(report)) {
      mainTableReference = await this.tableReferenceService.resolveTableName(
        dataMart.id,
        dataMart.projectId
      );
    }

    // Column types let Athena cast date/time filter placeholders. Sourced from the
    // persisted schema (same native fields the validator types against).
    const schemaFields = dataMart.schema?.fields ?? [];
    const columnTypes: ReadonlyMap<string, string> | undefined = schemaFields.length
      ? new Map(collectSchemaFieldPathTypes(schemaFields).map(f => [f.name, f.type]))
      : undefined;

    const pkFields = getPrimaryKeyFields(schemaFields);
    const uniqueCount = report.uniqueCountConfig === true;

    const queryResult = await this.queryBuilderFacade.buildQuery(
      dataMart.storage.type,
      dataMart.definition,
      {
        columns: decision.columnFilter,
        filters: report.filterConfig ?? undefined,
        sort: report.sortConfig ?? undefined,
        aggregations: report.aggregationConfig ?? undefined,
        dateTruncs: report.dateTruncConfig ?? undefined,
        rowCount: shouldIncludeRowCount(report),
        uniqueCount,
        primaryKeyColumns: pkFields.map(f => f.name),
        limit: report.limitConfig ?? undefined,
        mainTableReference,
        columnTypes,
      }
    );

    if (isQueryBuildResult(queryResult)) {
      return { sql: queryResult.sql, params: queryResult.params };
    }
    return { sql: queryResult };
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
   * ⚠️ Joined NON-numeric totals are dedup-function-dependent: a joined column is first rolled
   * up per join key by its pre-join aggregate (default STRING_AGG for text), so a post-join
   * COUNT_DISTINCT counts distinct rolled-up values, NOT distinct raw rows. Treat such a total
   * as approximate — same accepted-limitation class as the unweighted blended AVG.
   *
   * Totals are otherwise INDEPENDENT of the report's own display aggregation functions — the
   * numeric auto-summary is computed even for a non-aggregated report. Row Count and Unique
   * Count are NOT part of totals. WHERE filters are respected; HAVING (function-carrying)
   * filters are dropped (a single grand-total group). The blending decision is resolved FRESH
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
  } | null> {
    const { columns, aggregations, blendableSchema } = await this.deriveTotalsAggregations(
      report,
      accessor
    );
    if (aggregations.length === 0) {
      return null;
    }

    // Keep only WHERE filters (dimension predicates). HAVING rules (those carrying a
    // `function`) filter per-GROUP, but the totals query has NO GROUP BY — a single
    // grand-total group — so a HAVING here would filter that one row. Totals respect the
    // same WHERE filters only.
    const whereFilters = (report.filterConfig ?? []).filter(rule => !rule.function);

    const totalsPlan: ReportLikeReadPlan = {
      dataMart: report.dataMart,
      columnConfig: columns,
      filterConfig: whereFilters.length > 0 ? whereFilters : null,
      aggregationConfig: aggregations,
      sortConfig: null,
      dateTruncConfig: null,
      limitConfig: null,
      // Totals are a metrics-only summary — no Unique Count, no Row Count.
      uniqueCountConfig: null,
      rowCount: false,
    };

    // Reuse the schema resolved while deriving the aggregations (when blended) so the decision
    // and the save-time validator don't recompute it.
    const { sql, params } = await this.compose(totalsPlan, accessor, undefined, blendableSchema);

    // A joined numeric column is absent from the native headers, so its base type must travel
    // with the totals plan; the header path widens it per aggregation function.
    const blendedDataHeaders = blendableSchema
      ? this.buildBlendedTotalsHeaders(columns, blendableSchema)
      : undefined;

    return { sql, params, aggregations, columns, blendedDataHeaders };
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
          `${field.outputPrefix} ${field.alias || field.originalFieldName}`,
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
   * run. Plain non-numeric dimensions (not aggregated by the report) and unresolved columns are
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
    // Present only when blended columns forced a schema resolution — reused downstream.
    blendableSchema?: BlendableSchemaDto;
  }> {
    const descriptors = collectSchemaFieldPathDescriptors(report.dataMart.schema?.fields ?? []);
    const byName = new Map(descriptors.map(d => [d.name, d]));
    // The columns the report aggregates — the metric signal for non-numeric fields (WI #6680
    // §D: totals are over the SELECTED metrics; §C: Unique-by-PK is a normal COUNT_DISTINCT
    // metric). A per-field dimension/metric role IS persisted (`aggregationRole`), but it is
    // type-derived in practice, so totals key off type + report aggregation rather than role.
    const aggregatedColumns = new Set((report.aggregationConfig ?? []).map(rule => rule.column));

    // Only consult the blendable schema when the selection references columns the main
    // schema doesn't own — otherwise a non-blended report pays no schema-resolution cost
    // and stays byte-identical.
    const projectedExplicit = report.columnConfig && report.columnConfig.length > 0;
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

    const projected = projectedExplicit ? report.columnConfig! : descriptors.map(d => d.name);

    const columns: string[] = [];
    const aggregations: AggregationRule[] = [];
    for (const name of projected) {
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
    return { columns, aggregations, blendableSchema };
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
  // Accepted limitations for JOINED metrics — the grand total is re-aggregated over per-join-key
  // roll-ups, not raw rows: blended AVG/percentiles are unweighted (avg-of-avgs — see TODO(#6680)
  // in abstract-blended-query-builder.ts); a joined NON-numeric COUNT_DISTINCT counts distinct
  // pre-join-rolled-up values (the default text roll-up is STRING_AGG concatenations), NOT
  // distinct raw rows. Treat such totals as approximate.
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
      result.set(blendedField.name, allowed);
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
    precomputedDecision?: BlendingDecision
  ): Promise<{ sql: string }> {
    const composed = await this.compose(report, accessor, precomputedDecision);
    return {
      sql: this.inlineStaticSql(report.dataMart.storage.type, composed.sql, composed.params),
    };
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
