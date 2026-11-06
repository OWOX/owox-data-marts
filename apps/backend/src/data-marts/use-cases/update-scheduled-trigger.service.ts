import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronTime } from 'cron';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { UpdateScheduledTriggerCommand } from '../dto/domain/update-scheduled-trigger.command';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { ReportAccessService } from '../services/report-access.service';
import { ReportService } from '../services/report.service';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { isScheduledReportRunConfig } from '../scheduled-trigger-types/scheduled-trigger-config.guards';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DATA_MART_ERROR_MESSAGES } from '../errors/data-mart-error-messages';

@Injectable()
export class UpdateScheduledTriggerService {
  constructor(
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepository: Repository<DataMartScheduledTrigger>,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly mapper: ScheduledTriggerMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly reportAccessService: ReportAccessService,
    private readonly reportService: ReportService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: UpdateScheduledTriggerCommand): Promise<ScheduledTriggerDto> {
    if (
      !command.userId ||
      !(await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.dataMartId,
        Action.SEE,
        command.projectId
      ))
    )
      throw new ForbiddenException('You do not have access to this DataMart');

    const trigger = await this.scheduledTriggerService.getByIdAndDataMartIdAndProjectId(
      command.id,
      command.dataMartId,
      command.projectId
    );

    if (command.expectedType !== undefined && trigger.type !== command.expectedType) {
      throw new NotFoundException('Scheduled trigger was not found');
    }

    await this.checkAccess(command, trigger);

    if (trigger.dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new BusinessViolationException(
        DATA_MART_ERROR_MESSAGES.UPDATE_TRIGGER_REQUIRES_PUBLISHED
      );
    }

    const timeZone = command.timeZone ?? trigger.timeZone;
    const isActive = command.isActive ?? trigger.isActive;
    try {
      new CronTime(command.cronExpression, timeZone).getNextDateFrom(new Date(), timeZone);
      trigger.cronExpression = command.cronExpression;
      trigger.timeZone = timeZone;
      if (isActive) {
        trigger.scheduleNextRun();
      } else {
        trigger.discardNextRun();
      }
    } catch {
      throw new BusinessViolationException(DATA_MART_ERROR_MESSAGES.INVALID_SCHEDULE);
    }

    const updatedTrigger = await this.triggerRepository.save(trigger);

    const createdByUser =
      await this.userProjectionsFetcherService.fetchCreatedByUser(updatedTrigger);

    return this.mapper.toDomainDto(updatedTrigger, createdByUser);
  }

  private async checkAccess(
    command: UpdateScheduledTriggerCommand,
    trigger: DataMartScheduledTrigger
  ): Promise<void> {
    if (trigger.type === ScheduledTriggerType.REPORT_RUN) {
      if (!isScheduledReportRunConfig(trigger.triggerConfig)) {
        throw new BadRequestException('Report ID is required for REPORT_RUN triggers');
      }

      await this.reportService.getByIdAndDataMartIdAndProjectId(
        trigger.triggerConfig.reportId,
        command.dataMartId,
        command.projectId
      );

      await this.reportAccessService.checkOperateAccess(
        command.userId,
        command.roles,
        trigger.triggerConfig.reportId,
        command.projectId
      );
    } else {
      const canManageTriggers = await this.accessDecisionService.canAccessDmTrigger(
        command.userId,
        command.roles,
        trigger.id,
        command.dataMartId,
        Action.MANAGE_TRIGGERS,
        command.projectId
      );

      if (!canManageTriggers) {
        throw new ForbiddenException(
          'You do not have permission to manage triggers for this DataMart.'
        );
      }
    }
  }
}
