import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../entities/report.entity';
import { BlendedReportDataService } from '../services/blended-report-data.service';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { GetReportGeneratedSqlCommand } from '../dto/domain/get-report-generated-sql.command';
import { AccessDecisionService, Action } from '../services/access-decision';

@Injectable()
export class GetReportGeneratedSqlService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetReportGeneratedSqlCommand): Promise<{ sql: string }> {
    const report = await this.reportRepository.findOne({
      where: {
        id: command.reportId,
        dataMart: { projectId: command.projectId },
      },
      relations: ['dataMart', 'dataMart.storage', 'dataMart.storage.credential', 'dataDestination'],
    });

    if (!report) {
      throw new NotFoundException(`Report with ID ${command.reportId} not found`);
    }

    if (command.userId) {
      const canSee = await this.accessDecisionService.canAccessReport(
        command.userId,
        command.roles,
        command.reportId,
        report.dataMart.id,
        Action.SEE,
        command.projectId
      );
      if (!canSee) {
        throw new ForbiddenException('You do not have access to this report');
      }
    }

    return this.buildForReport(report);
  }

  async buildForReport(report: Report): Promise<{ sql: string }> {
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
