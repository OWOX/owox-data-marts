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
 * This module allows for the registration of trigger handlers that can be executed either directly
 * or through Google Cloud Pub/Sub, depending on the configuration. It provides a facade pattern
 * implementation for easy integration with other modules.
 *
 * To use this module, import it into your application module and inject the SCHEDULER_FACADE token
 * where you need to register trigger handlers.
 */
@Module({
  providers: [
    { provide: SCHEDULER_FACADE, useClass: SchedulerFacadeImpl },
    TimeBasedTriggerFetcherFactory,
    TriggerRunnerFactory,
    SystemTimeService,
    GracefulShutdownService,
  ],
  exports: [SCHEDULER_FACADE, GracefulShutdownService],
})
export class SchedulerModule {}
