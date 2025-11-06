import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemTrigger } from '../shared/entities/system-trigger.entity';
import { SCHEDULER_FACADE, SchedulerFacade } from '../shared/scheduler.facade';
import { TriggerHandler } from '../shared/trigger-handler.interface';
import { SystemTaskProcessor } from './system-task-processor.interface';
import { SystemTriggerType } from './system-trigger-type';

export const SYSTEM_TASK_PROCESSORS = 'SYSTEM_TASK_PROCESSORS';

@Injectable()
export class SystemTriggerHandlerService implements TriggerHandler<SystemTrigger>, OnModuleInit {
  private readonly logger = new Logger(SystemTriggerHandlerService.name);
  private readonly processorByType: Map<SystemTriggerType, SystemTaskProcessor> = new Map();

  constructor(
    @InjectRepository(SystemTrigger)
    private readonly repository: Repository<SystemTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly configService: ConfigService,
    @Inject(SYSTEM_TASK_PROCESSORS)
    processors: SystemTaskProcessor[]
  ) {
    processors.forEach(p => this.processorByType.set(p.type, p));
  }

  async handleTrigger(trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    const now = new Date();
    try {
      const processor = this.processorByType.get(trigger.type as SystemTriggerType);
      if (!processor) {
        this.logger.warn(`No processor registered for system trigger type ${trigger.type}`);
        trigger.onSuccess(now);
        await this.repository.save(trigger);
        return;
      }

      await processor.process(trigger, options);
      trigger.onSuccess(now);
      await this.repository.save(trigger);
    } catch (error) {
      this.logger.error(`Failed to execute system trigger ${trigger.type}`, error);
      trigger.onError(now);
      await this.repository.save(trigger);
    }
  }

  getTriggerRepository(): Repository<SystemTrigger> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '* * * * *'; // every minute
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultSystemTriggers();
    await this.schedulerFacade.registerTriggerHandler(this);
  }

  private async ensureDefaultSystemTriggers(): Promise<void> {
    const timezone = this.configService.get<string>('SCHEDULER_TIMEZONE') ?? 'UTC';

    const defaults: Array<{ type: SystemTriggerType; cron: string }> = [
      { type: SystemTriggerType.RETRY_INTERRUPTED_CONNECTOR_RUNS, cron: '0 */15 * * * *' },
    ];

    for (const def of defaults) {
      let trigger = await this.repository.findOne({ where: { type: def.type } });
      if (!trigger) {
        trigger = this.repository.create({
          type: def.type,
          cronExpression: def.cron,
          timeZone: timezone,
          isActive: true,
        } as SystemTrigger);
        trigger.scheduleNextRun(new Date());
        await this.repository.save(trigger);
        this.logger.log(`Created system trigger '${def.type}' with cron '${def.cron}'`);
        continue;
      }

      let changed = false;
      if (trigger.cronExpression !== def.cron) {
        trigger.cronExpression = def.cron;
        changed = true;
      }
      if (trigger.timeZone !== timezone) {
        trigger.timeZone = timezone;
        changed = true;
      }
      if (!trigger.isActive) {
        trigger.isActive = true;
        changed = true;
      }
      if (changed) {
        trigger.scheduleNextRun(new Date());
        await this.repository.save(trigger);
        this.logger.log(`Updated system trigger '${def.type}' to cron '${def.cron}'`);
      }
    }
  }
}
