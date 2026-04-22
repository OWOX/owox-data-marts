import { Injectable } from '@nestjs/common';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { Report } from '../entities/report.entity';
import { BlendedReportDataService } from './blended-report-data.service';

@Injectable()
export class ReportSqlComposerService {
  constructor(
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade
  ) {}

  async compose(report: Report): Promise<{ sql: string }> {
    const decision = await this.blendedReportDataService.resolveBlendingDecision(report);

    if (decision.needsBlending && decision.blendedSql) {
      return { sql: decision.blendedSql };
    }

    const { dataMart } = report;
    if (!dataMart.definition) {
      throw new Error('Data Mart definition is not set.');
    }

    const sql = await this.queryBuilderFacade.buildQuery(
      dataMart.storage.type,
      dataMart.definition,
      { columns: decision.columnFilter }
    );

    return { sql };
  }
}
