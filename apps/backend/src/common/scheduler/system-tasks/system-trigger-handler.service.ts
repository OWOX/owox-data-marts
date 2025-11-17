import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { SystemTrigger } from '../shared/entities/system-trigger.entity';
import { SCHEDULER_FACADE, SchedulerFacade } from '../shared/scheduler.facade';
import { TriggerHandler } from '../shared/trigger-handler.interface';
import { BaseSystemTaskProcessor } from './base-system-task.processor';
import { SystemTriggerType } from './system-trigger-type';

@Injectable()
export class SystemTriggerHandlerService implements TriggerHandler<SystemTrigger>, OnModuleInit {
  private readonly logger = new Logger(SystemTriggerHandlerService.name);
  private readonly processorByType: Map<SystemTriggerType, BaseSystemTaskProcessor> = new Map();

  constructor(
    @InjectRepository(SystemTrigger)
    private readonly repository: Repository<SystemTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly configService: ConfigService,
    private readonly discovery: DiscoveryService
  ) {}

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
    await this.discoverProcessors();
    await this.ensureTriggersFromProcessors();
    await this.schedulerFacade.registerTriggerHandler(this);
  }

  private async discoverProcessors(): Promise<void> {
    this.processorByType.clear();
    const providers = this.discovery.getProviders();
    for (const wrapper of providers) {
      const instance = wrapper.instance as unknown;
      const mtUnknown = wrapper.metatype as unknown;
      if (typeof mtUnknown !== 'function' || !instance) continue;
      const isProcessor =
        (mtUnknown as { prototype?: unknown }).prototype instanceof BaseSystemTaskProcessor;
      if (!isProcessor) continue;
      try {
        const processor = instance as BaseSystemTaskProcessor;
        const type = processor.getType();
        this.processorByType.set(type as SystemTriggerType, processor);
        this.logger.log(`Discovered system task processor for type ${String(type)}`);
      } catch {
        continue;
      }
    }
  }

  private async ensureTriggersFromProcessors(): Promise<void> {
    const timezone = this.configService.get<string>('SCHEDULER_TIMEZONE') ?? 'UTC';
    for (const [type, processor] of this.processorByType.entries()) {
      const cron = processor.getDefaultCron();
      const where: FindOptionsWhere<SystemTrigger> = { type: type as unknown as string };
      let trigger = await this.repository.findOne({ where });
      if (!trigger) {
        trigger = this.repository.create({
          type,
          cronExpression: cron,
          timeZone: timezone,
          isActive: true,
        } as SystemTrigger);
        trigger.scheduleNextRun(new Date());
        await this.repository.save(trigger);
        this.logger.log(`Created system trigger '${type}' with cron '${cron}'`);
        continue;
      }

      let changed = false;
      if (trigger.cronExpression !== cron) {
        trigger.cronExpression = cron;
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
        this.logger.log(`Updated system trigger '${type}' to cron '${cron}'`);
      }
    }
  }
}
