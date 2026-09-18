import {
  BadRequestException,
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
import { applyAutoCollapse } from '../services/auto-collapse.resolver';
import { collapsesOnDelivery } from '../data-destination-types/enums/data-destination-type.enum';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

@Injectable()
export class GetReportGeneratedSqlService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly reportSqlComposerService: ReportSqlComposerService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(
    command: GetReportGeneratedSqlCommand
  ): Promise<{ sql: string; canModifySource: boolean }> {
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

    // Reading SQL is transparency, not a maintenance privilege: anyone who can see the
    // report (i.e. sees its source data mart) may read it. Access to the joined sources
    // is enforced separately by the composer — see BlendedReportDataService.
    const [canSeeDataMart, canModifySource] = await Promise.all([
      this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        report.dataMart.id,
        Action.SEE,
        command.projectId
      ),
      this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        report.dataMart.id,
        Action.EDIT,
        command.projectId
      ),
    ]);
    if (!canSeeDataMart) {
      throw new ForbiddenException(
        'You do not have permission to view the generated SQL of this report: access to the source data mart is required.'
      );
    }

    if (report.dataMart.definitionType === DataMartDefinitionType.TABLE_PATTERN) {
      const storageType = report.dataMart.storage.type;
      if (storageType !== DataStorageType.GOOGLE_BIGQUERY) {
        throw new BadRequestException({
          message:
            'Generated SQL preview is not supported for table pattern definitions on this storage',
          details: {
            errors: [{ code: 'GENERATED_SQL_NOT_SUPPORTED', storageType }],
          },
        });
      }
    }

    // The preview shows the query the report will actually be delivered by, so a stored report
    // with no analyst-chosen aggregation is collapsed here exactly as it is on delivery. Keyed on
    // whether the destination collapses, NOT on whether it pulls: Excel pulls and still collapses,
    // because the add-in's fetch IS its delivery. Looker Studio reads raw, so a preview there
    // would predict something that never happens.
    // `?.` because `DataDestination` is soft-deletable: a row the relation can no longer load
    // leaves this undefined, and an unknown destination must not be treated as one we deliver to.
    const destinationType = report.dataDestination?.type;
    const { report: effectiveReport } =
      destinationType === undefined || !collapsesOnDelivery(destinationType)
        ? { report }
        : applyAutoCollapse(report);

    const { sql } = await this.reportSqlComposerService.composeStatic(effectiveReport, {
      userId: command.userId,
      roles: command.roles,
    });
    return { sql, canModifySource };
  }
}
