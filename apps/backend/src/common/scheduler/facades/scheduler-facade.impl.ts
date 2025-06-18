import { Injectable, Logger } from '@nestjs/common';
import { SchedulerFacade } from '../shared/scheduler.facade';
import { TimeBasedTriggerHandler } from '../shared/time-based-trigger-handler.interface';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SystemTimeService } from '../services/system-time.service';
import { ConfigService } from '@nestjs/config';
import { TimeBasedTrigger } from '../shared/entities/time-based-trigger.entity';
import { TriggerRunnerFactory } from '../services/runners/trigger-runner.factory';
import { TimeBasedTriggerFetcherFactory } from '../services/fetchers/time-based-trigger-fetcher.factory';

/**
 * The SchedulerFacadeImpl class is an implementation of the SchedulerFacade interface, providing
 * functionality to manage and register time-based trigger handlers in a scheduling system. It utilizes
 * the SchedulerRegistry to maintain and manage cron jobs and integrates configuration for customizable
 * scheduling behavior.
 */
@Injectable()
export class SchedulerFacadeImpl implements SchedulerFacade {
  private readonly logger = new Logger(SchedulerFacadeImpl.name);
  private readonly defaultTimezone = 'UTC';

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly triggerFetcherFactory: TimeBasedTriggerFetcherFactory,
    private readonly triggerRunnerFactory: TriggerRunnerFactory,
    private readonly systemTimeService: SystemTimeService
  ) {}

  /**
   * Registers a time-based trigger handler to the scheduler system. This method initializes the trigger,
   * associates it with a cron job, and starts the job with the specified processing expression and timezone settings.
   *
   * @param triggerHandler The time-based trigger handler instance implementing the required processing logic and cron expression.
   * @return A promise that resolves when the handler is registered
   */
  async registerTimeBasedTriggerHandler(
    triggerHandler: TimeBasedTriggerHandler<TimeBasedTrigger>
  ): Promise<void> {
    const runner = await this.triggerRunnerFactory.createRunner(
      triggerHandler,
      this.systemTimeService
    );
    const fetcher = this.triggerFetcherFactory.createFetcher(
      triggerHandler.getTriggerRepository(),
      this.systemTimeService
    );
    const timezone = this.configService.get<string>('SCHEDULER_TIMEZONE', this.defaultTimezone);
    const job = new CronJob(
      triggerHandler.processingCronExpression(),
      () =>
        fetcher.fetchTriggersReadyForProcessing().then(triggers => runner.runTriggers(triggers)),
      null,
      false,
      timezone
    );

    this.schedulerRegistry.addCronJob(triggerHandler.constructor.name, job);

    job.start();

    this.logger.log(
      `Time-based trigger handler '${triggerHandler.constructor.name}' initialized '${triggerHandler.processingCronExpression()}' ${timezone}`
    );
  }
}
