import { FindManyOptions } from 'typeorm';
import { Trigger } from '../../../shared/entities/trigger.entity';
import { TriggerStatus } from '../../../shared/entities/trigger-status';
import { TriggerFetchStrategy } from './trigger-fetch-strategy.interface';

/**
 * Strategy for fetching immediate triggers.
 * Selects triggers that should be processed immediately without time-based scheduling.
 */
export class ImmediateFetchStrategy<T extends Trigger> implements TriggerFetchStrategy<T> {
  /**
   * Returns find options for immediate triggers.
   * Selects active triggers in IDLE status, ordered by creation time.
   *
   * @param _currentTime The current time (not used for immediate triggers)
   * @returns FindManyOptions for selecting immediate triggers ready for processing
   */
  getFindOptions(_currentTime: Date): FindManyOptions<T> {
    return {
      where: {
        isActive: true,
        status: TriggerStatus.IDLE,
      },
      order: {
        createdAt: 'ASC',
      },
    } as FindManyOptions<T>;
  }
}
