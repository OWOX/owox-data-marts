import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { UpdateScheduledTriggerCommand } from '../dto/domain/update-scheduled-trigger.command';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { ReportAccessService } from '../services/report-access.service';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { isScheduledReportRunConfig } from '../scheduled-trigger-types/scheduled-trigger-config.guards';

@Injectable()
export class UpdateScheduledTriggerService {
  constructor(
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepository: Repository<DataMartScheduledTrigger>,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly mapper: ScheduledTriggerMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly reportAccessService: ReportAccessService
  ) {}

  async run(command: UpdateScheduledTriggerCommand): Promise<ScheduledTriggerDto> {
    const trigger = await this.scheduledTriggerService.getByIdAndDataMartIdAndProjectId(
      command.id,
      command.dataMartId,
      command.projectId
    );

    await this.checkAccess(command, trigger);

    if (trigger.dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new BusinessViolationException(
        'Cannot update a trigger for a data mart that is not published'
      );
    }

    trigger.cronExpression = command.cronExpression;
    trigger.timeZone = command.timeZone;
    if (command.isActive) {
      try {
        trigger.scheduleNextRun();
      } catch {
        throw new BusinessViolationException('Invalid cron expression', {
          cronExpression: command.cronExpression,
        });
      }
    } else {
      trigger.discardNextRun();
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

      const canMutate = await this.reportAccessService.canMutate(
        command.userId,
        command.roles,
        trigger.triggerConfig.reportId,
        command.projectId
      );

      if (!canMutate) {
        throw new ForbiddenException(
          'You do not have permission to update triggers for this report. Only report owners can manage report triggers.'
        );
      }
    } else {
      if (!this.reportAccessService.isTechnicalUser(command.roles)) {
        throw new ForbiddenException('Only Technical Users can update connector run triggers.');
      }
    }
  }
}
