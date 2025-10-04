import { FindManyOptions, LessThanOrEqual } from 'typeorm';
import { TimeBasedTrigger } from '../../../shared/entities/time-based-trigger.entity';
import { TriggerStatus } from '../../../shared/entities/trigger-status';
import { TriggerFetchStrategy } from './trigger-fetch-strategy.interface';

/**
 * Strategy for fetching time-based triggers.
 * Selects triggers that are due for execution based on their nextRunTimestamp.
 */
export class TimeBasedFetchStrategy<T extends TimeBasedTrigger> implements TriggerFetchStrategy<T> {
  /**
   * Returns find options for time-based triggers.
   * Selects active triggers in IDLE status where nextRunTimestamp is less than or equal to current time.
   *
   * @param currentTime The current time to compare against nextRunTimestamp
   * @returns FindManyOptions for selecting time-based triggers ready for processing
   */
  getFindOptions(currentTime: Date): FindManyOptions<T> {
    return {
      where: {
        nextRunTimestamp: LessThanOrEqual(currentTime),
        isActive: true,
        status: TriggerStatus.IDLE,
      },
      order: {
        nextRunTimestamp: 'ASC',
      },
    } as FindManyOptions<T>;
  }
}
