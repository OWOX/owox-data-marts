import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { Report } from '../entities/report.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartService } from '../services/data-mart.service';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { SqlDefinition } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { CopyReportAsDataMartCommand } from '../dto/domain/copy-report-as-data-mart.command';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class CopyReportAsDataMartService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly reportSqlComposerService: ReportSqlComposerService,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: CopyReportAsDataMartCommand): Promise<DataMart> {
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
      const [canEditDataMart, canUseStorage] = await Promise.all([
        this.accessDecisionService.canAccess(
          command.userId,
          command.roles,
          EntityType.DATA_MART,
          report.dataMart.id,
          Action.EDIT,
          command.projectId
        ),
        this.accessDecisionService.canAccess(
          command.userId,
          command.roles,
          EntityType.STORAGE,
          report.dataMart.storage.id,
          Action.USE,
          command.projectId
        ),
      ]);
      if (!canEditDataMart) {
        throw new ForbiddenException(
          'You do not have permission to copy this report: edit access to the source data mart is required.'
        );
      }
      if (!canUseStorage) {
        throw new ForbiddenException(
          'You do not have permission to copy this report: use access to the source data storage is required.'
        );
      }
    }

    const { sql } = await this.reportSqlComposerService.compose(report);

    if (!sql.trim()) {
      throw new BusinessViolationException(
        'Unable to copy this report: generated SQL is empty. Ensure the report has a valid column configuration.',
        { reportId: command.reportId }
      );
    }

    const { dataMart: sourceDataMart } = report;

    const definition: SqlDefinition = { sqlQuery: sql };

    const newDataMart = this.dataMartService.create({
      title: `Copy of ${report.title}`,
      projectId: command.projectId,
      createdById: command.userId,
      technicalOwnerIds: [command.userId],
      storage: sourceDataMart.storage,
      definitionType: DataMartDefinitionType.SQL,
      definition,
      status: DataMartStatus.DRAFT,
    });

    return this.dataMartService.save(newDataMart);
  }
}
