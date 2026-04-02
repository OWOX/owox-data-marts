import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../entities/report.entity';
import { BlendedReportDataService } from '../services/blended-report-data.service';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';

@Injectable()
export class GetReportGeneratedSqlService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade
  ) {}

  async run(reportId: string, projectId: string): Promise<{ sql: string }> {
    const report = await this.reportRepository.findOne({
      where: {
        id: reportId,
        dataMart: { projectId },
      },
      relations: ['dataMart', 'dataMart.storage', 'dataMart.storage.credential', 'dataDestination'],
    });

    if (!report) {
      throw new NotFoundException(`Report with ID ${reportId} not found`);
    }

    const decision = await this.blendedReportDataService.resolveBlendingDecision(report);

    if (decision.needsBlending && decision.blendedSql) {
      return { sql: decision.blendedSql };
    }

    // Build base query (column filter is informational — not yet applied at query-builder level)
    const { dataMart } = report;
    if (!dataMart.definition) {
      throw new Error('Data Mart definition is not set.');
    }

    const sql = await this.queryBuilderFacade.buildQuery(
      dataMart.storage.type,
      dataMart.definition
    );

    return { sql };
  }
}
