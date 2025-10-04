import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Trigger } from '../../shared/entities/trigger.entity';
import { TriggerFetcherService } from './trigger-fetcher.service';
import { SystemTimeService } from '../system-time.service';
import { TriggerFetchStrategy } from './strategies/trigger-fetch-strategy.interface';
import { TimeBasedFetchStrategy } from './strategies/time-based-fetch.strategy';
import { ImmediateFetchStrategy } from './strategies/immediate-fetch.strategy';

/**
 * Factory for creating TriggerFetcherService instances.
 * This factory automatically detects the appropriate fetch strategy based on entity metadata.
 * Supports both time-based triggers (with nextRunTimestamp) and immediate triggers (without).
 */
@Injectable()
export class TriggerFetcherFactory {
  private readonly logger = new Logger(TriggerFetcherFactory.name);

  /**
   * Creates a new TimeBasedTriggerFetcherService instance with auto-detected strategy.
   * The strategy is determined by checking if the entity has a nextRunTimestamp column:
   * - If yes: uses TimeBasedFetchStrategy (fetches by time)
   * - If no: uses ImmediateFetchStrategy (fetches by status only)
   *
   * @param repository The TypeORM repository for the trigger entity
   * @param systemTimeService The system time service used to get the current time
   * @param stuckTriggerTimeoutSeconds The timeout in seconds after which a trigger is considered stuck
   * @returns A new TimeBasedTriggerFetcherService instance with appropriate strategy
   */
  createFetcher<T extends Trigger>(
    repository: Repository<T>,
    systemTimeService: SystemTimeService,
    stuckTriggerTimeoutSeconds: number
  ): TriggerFetcherService<T> {
    const strategy = this.detectFetchStrategy<T>(repository);
    const strategyName = strategy.constructor.name;

    this.logger.debug(
      `[${repository.metadata.name}] Creating TimeBasedTriggerFetcherService with ${strategyName}`
    );

    return new TriggerFetcherService<T>(
      repository,
      systemTimeService,
      stuckTriggerTimeoutSeconds,
      strategy
    );
  }

  /**
   * Detects the appropriate fetch strategy based on entity metadata.
   * Checks if the entity has a nextRunTimestamp column to determine the strategy.
   *
   * @param repository The TypeORM repository for the trigger entity
   * @returns The appropriate TriggerFetchStrategy instance
   */
  private detectFetchStrategy<T extends Trigger>(
    repository: Repository<T>
  ): TriggerFetchStrategy<T> {
    const metadata = repository.metadata;

    // Check if the entity has a nextRunTimestamp column
    const hasNextRunTimestamp = metadata.columns.some(
      column => column.propertyName === 'nextRunTimestamp'
    );

    if (hasNextRunTimestamp) {
      return new TimeBasedFetchStrategy() as TriggerFetchStrategy<T>;
    } else {
      return new ImmediateFetchStrategy<T>();
    }
  }
}
