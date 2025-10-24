import { Injectable, Logger } from '@nestjs/common';
import { TriggerFetcherService } from '../services/fetchers/trigger-fetcher.service';
import { TriggerRunnerService } from '../services/runners/trigger-runner.interface';
import { Trigger } from '../shared/entities/trigger.entity';
import { SchedulerFacade } from '../shared/scheduler.facade';
import { TriggerHandler } from '../shared/trigger-handler.interface';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SystemTimeService } from '../services/system-time.service';
import { ConfigService } from '@nestjs/config';
import { TriggerRunnerFactory } from '../services/runners/trigger-runner.factory';
import { TriggerFetcherFactory } from '../services/fetchers/trigger-fetcher-factory.service';
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

  /**
   * Static variable for abort run check frequency configuration
   */
  private static readonly ABORT_RUN_CHECK_CRON_EXPRESSION = '*/5 * * * * *';

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly triggerFetcherFactory: TriggerFetcherFactory,
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
  async registerTriggerHandler<T extends Trigger>(
    triggerHandler: TriggerHandler<T>
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
      this.systemTimeService,
      triggerHandler.stuckTriggerTimeoutSeconds?.(),
      triggerHandler.triggerTtlSeconds?.()
    );

    // Create and start processing job
    const processingJob = this.createProcessingCronJob(
      handlerName,
      handlerCronExp,
      timezone,
      fetcher,
      runner
    );
    this.startCronJob(handlerName, processingJob);

    // Create and start abort run job
    const abortRunJob = this.createAbortRunCronJob(handlerName, timezone, fetcher, runner);
    this.startCronJob(`${handlerName} [abort-run-check]`, abortRunJob);

    this.logger.log(
      `Time-based trigger handler '${handlerName}' initialized with cron '${handlerCronExp}' in timezone ${timezone}`
    );
  }

  /**
   * Creates a cron job for processing triggers
   *
   * @param handlerName The name of the trigger handler
   * @param cronExpression The cron expression for scheduling
   * @param timezone The timezone for cron execution
   * @param fetcher The trigger fetcher instance
   * @param runner The trigger runner instance
   * @returns The created CronJob instance
   */
  private createProcessingCronJob<T extends Trigger>(
    handlerName: string,
    cronExpression: string,
    timezone: string | undefined,
    fetcher: TriggerFetcherService<T>,
    runner: TriggerRunnerService<T>
  ): CronJob {
    return new CronJob(
      cronExpression,
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
  }

  /**
   * Creates a cron job for aborting running triggers
   *
   * @param handlerName The name of the trigger handler
   * @param timezone The timezone for cron execution
   * @param fetcher The trigger fetcher instance
   * @param runner The trigger runner instance
   * @returns The created CronJob instance
   */
  private createAbortRunCronJob<T extends Trigger>(
    handlerName: string,
    timezone: string | undefined,
    fetcher: TriggerFetcherService<T>,
    runner: TriggerRunnerService<T>
  ): CronJob {
    return new CronJob(
      SchedulerFacadeImpl.ABORT_RUN_CHECK_CRON_EXPRESSION,
      () => {
        if (this.gracefulShutdownService.isInShutdownMode()) {
          this.logger.warn(`[${handlerName}] Canceling triggers skipped. Application is shutdown.`);
          return Promise.resolve();
        }

        return fetcher
          .fetchTriggersForRunCancellation()
          .then(triggers => runner.abortTriggerRuns(triggers));
      },
      null,
      false,
      timezone
    );
  }

  /**
   * Registers and starts a cron job
   *
   * @param jobName The name to register the job under
   * @param cronJob The CronJob instance to register and start
   */
  private startCronJob(jobName: string, cronJob: CronJob): void {
    this.schedulerRegistry.addCronJob(jobName, cronJob);
    cronJob.start();
  }
}
