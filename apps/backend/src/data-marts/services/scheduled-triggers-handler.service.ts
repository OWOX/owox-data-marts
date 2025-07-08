import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TimeBasedTriggerHandler } from '../../common/scheduler/shared/time-based-trigger-handler.interface';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerProcessorFacade } from '../scheduled-trigger-types/facades/scheduled-trigger-processor.facade';

@Injectable()
export class ScheduledTriggersHandlerService
  implements TimeBasedTriggerHandler<DataMartScheduledTrigger>, OnModuleInit
{
  private readonly logger = new Logger(ScheduledTriggersHandlerService.name);

  constructor(
    @InjectRepository(DataMartScheduledTrigger)
    private readonly repository: Repository<DataMartScheduledTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly processorFacade: ScheduledTriggerProcessorFacade
  ) {}

  async handleTrigger(trigger: DataMartScheduledTrigger): Promise<void> {
    try {
      this.logger.log(`Processing trigger ${trigger.type} ${trigger.id}`);
      await this.processorFacade.process(trigger);
      this.logger.log(`Trigger ${trigger.type} ${trigger.id} processed successfully`);
    } catch (error) {
      this.logger.error(`Error processing trigger ${trigger.type} ${trigger.id}`, error);
    }
  }

  getTriggerRepository(): Repository<DataMartScheduledTrigger> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '* * * * *'; // every minute
  }

  async onModuleInit(): Promise<void> {
    // Self-register with the scheduler facade
    await this.schedulerFacade.registerTimeBasedTriggerHandler(this);
  }
}
