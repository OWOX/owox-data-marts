import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CopyReportAsDataMartCommand } from '../dto/domain/copy-report-as-data-mart.command';
import { CreateDataMartCommand } from '../dto/domain/create-data-mart.command';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { SqlDefinition } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { Report } from '../entities/report.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { CreateDataMartService } from './create-data-mart.service';
import { UpdateDataMartDefinitionService } from './update-data-mart-definition.service';

@Injectable()
export class CopyReportAsDataMartService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly reportSqlComposerService: ReportSqlComposerService,
    private readonly createDataMartService: CreateDataMartService,
    private readonly updateDataMartDefinitionService: UpdateDataMartDefinitionService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: CopyReportAsDataMartCommand): Promise<DataMartDto> {
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

    const { sql } = await this.reportSqlComposerService.composeStatic(report, {
      userId: command.userId,
      roles: command.roles,
    });

    if (!sql.trim()) {
      throw new BusinessViolationException(
        'Unable to copy this report: generated SQL is empty. Ensure the report has a valid column configuration.',
        { reportId: command.reportId }
      );
    }

    const createdDataMart = await this.createDataMartService.run(
      new CreateDataMartCommand(
        command.projectId,
        command.userId,
        `Copy of ${report.title}`,
        report.dataMart.storage.id,
        command.roles
      )
    );

    return this.updateDataMartDefinitionService.run(
      new UpdateDataMartDefinitionCommand(
        createdDataMart.id,
        command.projectId,
        DataMartDefinitionType.SQL,
        { sqlQuery: sql } as SqlDefinition,
        undefined,
        undefined,
        command.userId,
        command.roles
      )
    );
  }
}
