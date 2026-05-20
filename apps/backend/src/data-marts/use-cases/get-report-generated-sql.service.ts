import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GetReportGeneratedSqlCommand } from '../dto/domain/get-report-generated-sql.command';
import { Report } from '../entities/report.entity';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { BlendableSchemaService } from '../services/blendable-schema.service';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { createDataMartUseAccessFilter } from '../utils/create-dm-access-filter';

@Injectable()
export class GetReportGeneratedSqlService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly reportSqlComposerService: ReportSqlComposerService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly blendableSchemaService: BlendableSchemaService
  ) {}

  async run(command: GetReportGeneratedSqlCommand): Promise<{ sql: string }> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

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

    const canEditDataMart = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      report.dataMart.id,
      Action.EDIT,
      command.projectId
    );
    if (!canEditDataMart) {
      throw new ForbiddenException(
        'You do not have permission to view the generated SQL of this report: edit access to the source data mart is required.'
      );
    }

    const accessFilter = createDataMartUseAccessFilter(
      this.accessDecisionService,
      command.userId,
      command.roles,
      command.projectId
    );
    await this.blendableSchemaService.assertNoInaccessibleReportRefs(
      report,
      report.dataMart.id,
      command.projectId,
      accessFilter,
      'Cannot view SQL'
    );

    const { sql } = await this.reportSqlComposerService.compose(report);
    return { sql };
  }
}
