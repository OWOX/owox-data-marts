import { TimeBasedTrigger } from '../../shared/entities/time-based-trigger.entity';
import { TimeBasedTriggerHandler } from '../../shared/time-based-trigger-handler.interface';
import { SystemTimeService } from '../system-time.service';
import { AbstractTriggerRunnerService } from './abstract-trigger-runner.service';
import { GracefulShutdownService } from '../graceful-shutdown.service';

/**
 * Service that runs triggers directly in the current process.
 *
 * This implementation processes triggers immediately in parallel using Promise.all.
 * It's suitable for scenarios where triggers need to be processed quickly and
 * don't require distributed processing.
 *
 * @typeParam T - The type of trigger this service processes, must extend TimeBasedTrigger
 */
export class DirectTriggerRunnerService<
  T extends TimeBasedTrigger,
> extends AbstractTriggerRunnerService<T> {
  /**
   * Creates a new instance of the DirectTriggerRunnerService.
   *
   * @param handler The trigger handler that defines how triggers are processed
   * @param systemClock The system time service used to get the current time
   * @param shutdownService The graceful shutdown service used to manage shutdown state
   */
  constructor(
    handler: TimeBasedTriggerHandler<T>,
    systemClock: SystemTimeService,
    shutdownService: GracefulShutdownService
  ) {
    super(handler, systemClock, shutdownService);
  }

  /**
   * Processes a batch of triggers in parallel.
   *
   * This implementation processes all triggers concurrently using Promise.all.
   * Each trigger is processed safely with error handling.
   *
   * @param triggers The triggers to process
   * @returns A promise that resolves when all triggers have been processed
   */
  protected async processTriggers(triggers: T[]): Promise<void> {
    await Promise.all(triggers.map(trigger => this.processTriggerSafely(trigger)));
  }
}
