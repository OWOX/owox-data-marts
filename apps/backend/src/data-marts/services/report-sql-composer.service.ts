import { Injectable } from '@nestjs/common';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { Report } from '../entities/report.entity';
import { BlendedReportDataService } from './blended-report-data.service';
import { isQueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { SqlParameter } from '../data-storage-types/utils/sql-clause-renderer';

@Injectable()
export class ReportSqlComposerService {
  constructor(
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade,
    private readonly tableReferenceService: DataMartTableReferenceService
  ) {}

  async compose(report: Report): Promise<{ sql: string; params?: SqlParameter[] }> {
    const decision = await this.blendedReportDataService.resolveBlendingDecision(report);

    if (decision.needsBlending && decision.blendedSql) {
      return { sql: decision.blendedSql, params: decision.params };
    }

    const { dataMart } = report;
    if (!dataMart.definition) {
      throw new Error('Data Mart definition is not set.');
    }

    const hasOutputControls =
      (report.filterConfig?.length ?? 0) > 0 ||
      (report.sortConfig?.length ?? 0) > 0 ||
      report.limitConfig != null;

    let mainTableReference: string | undefined;
    if (hasOutputControls) {
      mainTableReference = await this.tableReferenceService.resolveTableName(
        dataMart.id,
        dataMart.projectId
      );
    }

    const queryResult = await this.queryBuilderFacade.buildQuery(
      dataMart.storage.type,
      dataMart.definition,
      {
        columns: decision.columnFilter,
        filters: report.filterConfig ?? undefined,
        sort: report.sortConfig ?? undefined,
        limit: report.limitConfig ?? undefined,
        mainTableReference,
      }
    );

    if (isQueryBuildResult(queryResult)) {
      return { sql: queryResult.sql, params: queryResult.params };
    }
    return { sql: queryResult };
  }
}
