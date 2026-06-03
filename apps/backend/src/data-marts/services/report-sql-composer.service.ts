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
}
