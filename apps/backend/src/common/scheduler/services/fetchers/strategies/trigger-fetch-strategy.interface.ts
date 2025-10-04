import { FindManyOptions } from 'typeorm';
import { Trigger } from '../../../shared/entities/trigger.entity';

/**
 * Strategy interface for defining how triggers should be fetched.
 * Different implementations can provide different criteria for selecting triggers
 * ready for processing (e.g., time-based vs immediate).
 */
export interface TriggerFetchStrategy<T extends Trigger> {
  /**
   * Returns the TypeORM find options for fetching triggers ready for processing.
   *
   * @param currentTime The current time to use for time-based comparisons
   * @returns FindManyOptions that specify the criteria for selecting triggers
   */
  getFindOptions(currentTime: Date): FindManyOptions<T>;
}
