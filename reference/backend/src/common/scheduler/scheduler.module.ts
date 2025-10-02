import { Module } from '@nestjs/common';
import { SchedulerFacadeImpl } from './facades/scheduler-facade.impl';
import { SCHEDULER_FACADE } from './shared/scheduler.facade';
import { TriggerRunnerFactory } from './services/runners/trigger-runner.factory';
import { SystemTimeService } from './services/system-time.service';
import { TimeBasedTriggerFetcherFactory } from './services/fetchers/time-based-trigger-fetcher.factory';
import { GracefulShutdownService } from './services/graceful-shutdown.service';

/**
 * The SchedulerModule provides functionality for scheduling and executing time-based triggers.
 *
 * The SchedulerFacadeImpl automatically adapts its behavior based on the
 * SCHEDULER_EXECUTION_ENABLED environment variable:
 * - When true: Creates cron jobs and executes scheduled tasks (Worker mode)
 * - When false: Only logs registrations without creating jobs (Registration mode)
 *
 * This allows for clean separation between API instances and Worker instances while
 * maintaining the same interface for dependency injection.
 *
 * To use this module, import it into your application module and inject the SCHEDULER_FACADE token
 * where you need to register trigger handlers.
 */
@Module({
  providers: [
    SystemTimeService,
    GracefulShutdownService,
    TimeBasedTriggerFetcherFactory,
    TriggerRunnerFactory,
    {
      provide: SCHEDULER_FACADE,
      useClass: SchedulerFacadeImpl,
    },
  ],
  exports: [SCHEDULER_FACADE, GracefulShutdownService],
})
export class SchedulerModule {}
