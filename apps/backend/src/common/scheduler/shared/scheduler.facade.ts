import { TimeBasedTriggerHandler } from './time-based-trigger-handler.interface';
import { InjectionToken } from '@nestjs/common';
import { TimeBasedTrigger } from './entities/time-based-trigger.entity';

/**
 * Injection token for the SchedulerFacade.
 * Use this token to inject the SchedulerFacade into your services.
 */
export const SCHEDULER_FACADE = 'SCHEDULER_FACADE' as InjectionToken<SchedulerFacade>;

/**
 * Facade interface for the scheduler module.
 *
 * This interface provides a simplified API for interacting with the scheduler module.
 * It allows for the registration of time-based trigger handlers that will be executed
 * according to their specified cron expressions.
 */
export interface SchedulerFacade {
  /**
   * Registers a time-based trigger handler with the scheduler.
   *
   * Once registered, the handler will be executed according to its processing cron expression.
   * The handler is responsible for defining how triggers are processed and when they should run.
   *
   * @param timeBasedTriggerHandler The trigger handler to register
   * @returns A promise that resolves when the handler is registered
   */
  registerTimeBasedTriggerHandler(
    timeBasedTriggerHandler: TimeBasedTriggerHandler<TimeBasedTrigger>
  ): Promise<void>;
}
