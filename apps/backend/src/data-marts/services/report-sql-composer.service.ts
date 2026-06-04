import { BadRequestException, Injectable } from '@nestjs/common';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { BlendingDecision } from '../dto/domain/blending-decision.dto';
import { ReportLike } from '../dto/domain/report-like-read-plan';
import { BlendableSchemaAccessor } from './blendable-schema.service';
import { BlendedReportDataService } from './blended-report-data.service';
import { isQueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { SqlParameter } from '../data-storage-types/utils/sql-clause-renderer';
import { OutputControlsCapabilityService } from './output-controls-capability.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { inlineAthenaPositionalParams } from '../data-storage-types/athena/adapters/athena-execution-parameters.utils';
import { inlineBigQueryNamedParams } from '../data-storage-types/bigquery/adapters/bigquery-execution-parameters.utils';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

@Injectable()
export class ReportSqlComposerService {
  constructor(
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade,
    private readonly tableReferenceService: DataMartTableReferenceService,
    private readonly capabilityService: OutputControlsCapabilityService
  ) {}

  async compose(
    report: ReportLike,
    accessor: BlendableSchemaAccessor,
    precomputedDecision?: BlendingDecision
  ): Promise<{ sql: string; params?: SqlParameter[] }> {
    const decision =
      precomputedDecision ??
      (await this.blendedReportDataService.resolveBlendingDecision(report, accessor));

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

    const hasOutputControls =
      (report.filterConfig?.length ?? 0) > 0 ||
      (report.sortConfig?.length ?? 0) > 0 ||
      report.limitConfig != null;

    if (hasOutputControls && !this.capabilityService.isSupported(dataMart.storage.type)) {
      throw new BadRequestException({
        message: 'Output controls not yet supported for this storage type',
        details: {
          errors: [{ code: 'OUTPUT_CONTROLS_NOT_SUPPORTED', storageType: dataMart.storage.type }],
        },
      });
    }

    let mainTableReference: string | undefined;
    if (hasOutputControls) {
      mainTableReference = await this.tableReferenceService.resolveTableName(
        dataMart.id,
        dataMart.projectId
      );
    }

    // Column types let Athena cast date/time filter placeholders. Sourced from the
    // persisted schema (same native fields the validator types against).
    const schemaFields = dataMart.schema?.fields ?? [];
    const columnTypes: ReadonlyMap<string, string> | undefined = schemaFields.length
      ? new Map(schemaFields.map((f): [string, string] => [f.name, String(f.type)]))
      : undefined;

    const queryResult = await this.queryBuilderFacade.buildQuery(
      dataMart.storage.type,
      dataMart.definition,
      {
        columns: decision.columnFilter,
        filters: report.filterConfig ?? undefined,
        sort: report.sortConfig ?? undefined,
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
    if (!composed.params?.length) return { sql: composed.sql };
    switch (report.dataMart.storage.type) {
      case DataStorageType.AWS_ATHENA:
        return { sql: inlineAthenaPositionalParams(composed.sql, composed.params) };
      case DataStorageType.GOOGLE_BIGQUERY:
        return { sql: inlineBigQueryNamedParams(composed.sql, composed.params) };
      default:
        // Only Athena + BigQuery support output controls (so only they produce
        // params); guard the contract for any future dialect added before its
        // inliner exists, rather than emit SQL with unbound parameters.
        throw new BusinessViolationException(
          'Generating static SQL for a report with value filters is not supported for this storage type.',
          { storageType: report.dataMart.storage.type }
        );
    }
  }
}
