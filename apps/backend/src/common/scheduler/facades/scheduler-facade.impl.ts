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
import { GracefulShutdownService } from '../services/graceful-shutdown.service';

/**
 * The SchedulerFacadeImpl class is a unified implementation of the SchedulerFacade interface,
 * providing adaptive functionality for scheduling and executing time-based triggers.
 *
 * This implementation automatically adapts its behavior based on the SCHEDULER_EXECUTION_ENABLED
 * environment variable:
 * - When true: Creates cron jobs and executes scheduled tasks (Worker mode)
 * - When false: Only logs registrations without creating jobs (Registration mode)
 *
 * This allows the same codebase to serve both API instances (registration only) and Worker
 * instances (full execution) without requiring separate implementations.
 */
@Injectable()
export class SchedulerFacadeImpl implements SchedulerFacade {
  private readonly logger = new Logger(SchedulerFacadeImpl.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly triggerFetcherFactory: TimeBasedTriggerFetcherFactory,
    private readonly triggerRunnerFactory: TriggerRunnerFactory,
    private readonly systemTimeService: SystemTimeService,
    private readonly gracefulShutdownService: GracefulShutdownService
  ) {}

  /**
   * Registers a time-based trigger handler to the scheduler system.
   *
   * Behavior depends on SCHEDULER_EXECUTION_ENABLED configuration:
   * - When true: Creates cron jobs and starts execution (Worker mode)
   * - When false: Only logs registration without creating jobs (Registration mode)
   *
   * @param triggerHandler The time-based trigger handler instance implementing the required processing logic and cron expression.
   * @return A promise that resolves when the handler is registered
   */
  async registerTimeBasedTriggerHandler(
    triggerHandler: TimeBasedTriggerHandler<TimeBasedTrigger>
  ): Promise<void> {
    const handlerName = triggerHandler.constructor.name;
    const handlerCronExp = triggerHandler.processingCronExpression();
    const isExecutionEnabled = this.configService.get<boolean>('SCHEDULER_EXECUTION_ENABLED');

    // Registration-only mode: just log and return early
    if (!isExecutionEnabled) {
      this.logger.log(`Handler '${handlerName}' registered but execution disabled.`);
      return;
    }

    // Worker mode: create cron jobs and full functionality
    const timezone = this.configService.get<string>('SCHEDULER_TIMEZONE');

    const runner = await this.triggerRunnerFactory.createRunner(
      triggerHandler,
      this.systemTimeService
    );

    const fetcher = this.triggerFetcherFactory.createFetcher(
      triggerHandler.getTriggerRepository(),
      this.systemTimeService
    );

    const job = new CronJob(
      handlerCronExp,
      () => {
        if (this.gracefulShutdownService.isInShutdownMode()) {
          this.logger.warn(`[${handlerName}] Fetching triggers skipped. Application is shutdown.`);
          return Promise.resolve();
        }

        return fetcher
          .fetchTriggersReadyForProcessing()
          .then(triggers => runner.runTriggers(triggers));
      },
      null,
      false,
      timezone
    );

    this.schedulerRegistry.addCronJob(handlerName, job);
    job.start();

    this.logger.log(
      `Time-based trigger handler '${handlerName}' initialized with cron '${handlerCronExp}' in timezone ${timezone}`
    );
  }
}
