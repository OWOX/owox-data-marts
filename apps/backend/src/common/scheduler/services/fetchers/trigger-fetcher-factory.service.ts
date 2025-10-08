import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Trigger } from '../../shared/entities/trigger.entity';
import { TimeBasedTrigger } from '../../shared/entities/time-based-trigger.entity';
import { TriggerFetcherService } from './trigger-fetcher.service';
import { SystemTimeService } from '../system-time.service';
import { TriggerFetchStrategy } from './strategies/trigger-fetch-strategy.interface';
import { TimeBasedFetchStrategy } from './strategies/time-based-fetch.strategy';
import { ImmediateFetchStrategy } from './strategies/immediate-fetch.strategy';

/**
 * Factory for creating TriggerFetcherService instances.
 * This factory automatically detects the appropriate fetch strategy based on entity class inheritance.
 * Supports both time-based triggers (extending TimeBasedTrigger) and immediate triggers (extending Trigger directly).
 */
@Injectable()
export class TriggerFetcherFactory {
  private readonly logger = new Logger(TriggerFetcherFactory.name);

  /**
   * Creates a new TriggerFetcherService instance with an auto-detected strategy.
   * The strategy is determined by checking if the entity extends TimeBasedTrigger:
   * - If yes: uses TimeBasedFetchStrategy (fetches by time)
   * - If no: uses ImmediateFetchStrategy (fetches by status only)
   *
   * @param repository The TypeORM repository for the trigger entity
   * @param systemTimeService The system time service used to get the current time
   * @param stuckTriggerTimeoutSeconds The timeout in seconds after which a trigger is considered stuck
   * @returns A new TriggerFetcherService instance with an appropriate strategy
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
   * Detects the appropriate fetch strategy based on entity class inheritance.
   * Checks if the entity extends TimeBasedTrigger to determine the strategy.
   *
   * @param repository The TypeORM repository for the trigger entity
   * @returns The appropriate TriggerFetchStrategy instance
   */
  private detectFetchStrategy<T extends Trigger>(
    repository: Repository<T>
  ): TriggerFetchStrategy<T> {
    const entityClass = repository.metadata.target;

    const strategy =
      typeof entityClass === 'string'
        ? new ImmediateFetchStrategy<T>()
        : this.getStrategyForEntityClass<T>(entityClass);

    this.logger.debug(
      `[${repository.metadata.name}] Detected fetch strategy: ${strategy.constructor.name}`
    );

    return strategy;
  }

  /**
   * Determines and retrieves the appropriate fetch strategy for a given entity class.
   *
   * @param {Function} entityClass - The class of the entity for which the fetch strategy is to be determined.
   * @return {TriggerFetchStrategy<T>} The fetch strategy determined for the provided entity class.
   */
  private getStrategyForEntityClass<T extends Trigger>(
    entityClass: Function // eslint-disable-line @typescript-eslint/no-unsafe-function-type
  ): TriggerFetchStrategy<T> {
    const isTimeBasedTrigger =
      entityClass.prototype instanceof TimeBasedTrigger || entityClass === TimeBasedTrigger;

    return isTimeBasedTrigger
      ? (new TimeBasedFetchStrategy() as TriggerFetchStrategy<T>)
      : new ImmediateFetchStrategy<T>();
  }
}
