import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CreateScheduledTriggerCommand } from '../dto/domain/create-scheduled-trigger.command';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { DataMartService } from '../services/data-mart.service';
import { ScheduledTriggerValidatorFacade } from '../scheduled-trigger-types/facades/scheduled-trigger-validator.facade';

@Injectable()
export class CreateScheduledTriggerService {
  constructor(
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepository: Repository<DataMartScheduledTrigger>,
    private readonly scheduledTriggerValidatorFacade: ScheduledTriggerValidatorFacade,
    private readonly dataMartService: DataMartService,
    private readonly mapper: ScheduledTriggerMapper
  ) {}

  async run(command: CreateScheduledTriggerCommand): Promise<ScheduledTriggerDto> {
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
      trigger.scheduleNextRun();
    }

    const newTrigger = await this.triggerRepository.save(trigger);

    return this.mapper.toDomainDto(newTrigger);
  }
}
