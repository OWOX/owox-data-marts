import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TimeBasedTrigger } from '../../shared/entities/time-based-trigger.entity';
import { TimeBasedTriggerFetcherService } from './time-based-trigger-fetcher.service';
import { SystemTimeService } from '../system-time.service';

/**
 * Factory for creating TimeBasedTriggerFetcherService instances.
 * This factory allows for the creation of fetcher services with runtime parameters.
 */
@Injectable()
export class TimeBasedTriggerFetcherFactory {
  private readonly logger = new Logger(TimeBasedTriggerFetcherFactory.name);

  /**
   * Creates a new TimeBasedTriggerFetcherService instance.
   *
   * @param repository The TypeORM repository for the trigger entity
   * @param systemTimeService The system time service used to get the current time
   * @returns A new TimeBasedTriggerFetcherService instance
   */
  createFetcher<T extends TimeBasedTrigger>(
    repository: Repository<T>,
    systemTimeService: SystemTimeService
  ): TimeBasedTriggerFetcherService<T> {
    this.logger.log(`[${repository.metadata.name}] Creating TimeBasedTriggerFetcherService`);
    return new TimeBasedTriggerFetcherService<T>(repository, systemTimeService);
  }
}
