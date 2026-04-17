import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { CreateScheduledTriggerCommand } from '../dto/domain/create-scheduled-trigger.command';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { TriggerCreatedEvent } from '../events/trigger-created.event';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { DataMartService } from '../services/data-mart.service';
import { ScheduledTriggerValidatorFacade } from '../scheduled-trigger-types/facades/scheduled-trigger-validator.facade';
import { ReportAccessService } from '../services/report-access.service';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { isScheduledReportRunConfig } from '../scheduled-trigger-types/scheduled-trigger-config.guards';

@Injectable()
export class CreateScheduledTriggerService {
  constructor(
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepository: Repository<DataMartScheduledTrigger>,
    private readonly scheduledTriggerValidatorFacade: ScheduledTriggerValidatorFacade,
    private readonly dataMartService: DataMartService,
    private readonly mapper: ScheduledTriggerMapper,
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly reportAccessService: ReportAccessService
  ) {}

  async run(command: CreateScheduledTriggerCommand): Promise<ScheduledTriggerDto> {
    await this.checkAccess(command);

    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new BusinessViolationException(
        'Cannot create a trigger for a data mart that is not published'
      );
    }

    const trigger = this.triggerRepository.create({
      type: command.type,
      cronExpression: command.cronExpression,
      timeZone: command.timeZone,
      isActive: command.isActive,
      dataMart: dataMart,
      createdById: command.userId,
      triggerConfig: command.triggerConfig,
    });

    await this.scheduledTriggerValidatorFacade.validate(trigger);

    // Schedule the next run based on the cron expression
    if (trigger.isActive) {
      try {
        trigger.scheduleNextRun();
      } catch {
        throw new BusinessViolationException('Invalid cron expression', {
          cronExpression: command.cronExpression,
        });
      }
    }

    const newTrigger = await this.triggerRepository.save(trigger);

    await this.eventDispatcher.publishExternal(
      new TriggerCreatedEvent(
        newTrigger.id,
        dataMart.id,
        command.projectId,
        command.type,
        command.userId
      )
    );

    return this.mapper.toDomainDto(newTrigger);
  }

  private async checkAccess(command: CreateScheduledTriggerCommand): Promise<void> {
    if (command.type === ScheduledTriggerType.REPORT_RUN) {
      if (!command.triggerConfig || !isScheduledReportRunConfig(command.triggerConfig)) {
        throw new BadRequestException(
          'Valid report run config with reportId is required for REPORT_RUN triggers'
        );
      }
      const reportId = command.triggerConfig.reportId;

      const canMutate = await this.reportAccessService.canMutate(
        command.userId,
        command.roles,
        reportId,
        command.projectId
      );

      if (!canMutate) {
        throw new ForbiddenException(
          'You do not have permission to create triggers for this report. Only report owners can manage report triggers.'
        );
      }
    } else {
      // CONNECTOR_RUN requires editor role
      if (!this.reportAccessService.isTechnicalUser(command.roles)) {
        throw new ForbiddenException('Only Technical Users can create connector run triggers.');
      }
    }
  }
}
