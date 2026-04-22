import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GetReportGeneratedSqlCommand } from '../dto/domain/get-report-generated-sql.command';
import { Report } from '../entities/report.entity';
import { AccessDecisionService, Action } from '../services/access-decision';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';

@Injectable()
export class GetReportGeneratedSqlService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly reportSqlComposerService: ReportSqlComposerService,
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

    return this.reportSqlComposerService.compose(report);
  }
}
