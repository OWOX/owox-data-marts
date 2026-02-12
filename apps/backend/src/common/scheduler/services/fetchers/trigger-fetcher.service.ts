import { Injectable, Logger } from '@nestjs/common';
import { FindManyOptions, FindOptionsWhere, In, LessThanOrEqual, Repository } from 'typeorm';
import { Trigger } from '../../shared/entities/trigger.entity';
import { TriggerStatus } from '../../shared/entities/trigger-status';
import { SystemTimeService } from '../system-time.service';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { TriggerFetchStrategy } from './strategies/trigger-fetch-strategy.interface';

/**
 * Generic service responsible for fetching triggers that are ready for processing.
 *
 * This service queries the database for triggers using a configurable strategy,
 * and marks them as ready for processing. It handles optimistic locking
 * to ensure triggers are not processed multiple times in distributed environments.
 * Supports both time-based and immediate triggers through strategy pattern.
 *
 * @typeParam T - The type of trigger this service fetches, must extend Trigger
 */
@Injectable()
export class TriggerFetcherService<T extends Trigger> {
  private readonly logger = new Logger(TriggerFetcherService.name);
  private readonly entityName: string;

  private static readonly DEFAULT_PROCESSING_BATCH_LIMIT = 100;

  /**
   * Creates a new instance of the TimeBasedTriggerFetcherService.
   *
   * @param repository The TypeORM repository for the trigger entity
   * @param systemClock The system time service used to get the current time
   * @param stuckTriggerTimeoutSeconds The timeout in seconds after which a trigger is considered stuck
   * @param triggerTtlSeconds The TTL in seconds for triggers
   * @param fetchStrategy The strategy for determining which triggers are ready for processing
   * @param processingBatchLimit The maximum number of triggers to fetch in a single batch.
   * Defaults to 100 if not specified.
   */
  constructor(
    private readonly repository: Repository<T>,
    private readonly systemClock: SystemTimeService,
    private readonly stuckTriggerTimeoutSeconds: number | undefined,
    private readonly triggerTtlSeconds: number | undefined,
    private readonly fetchStrategy: TriggerFetchStrategy<T>,
    private readonly processingBatchLimit: number | undefined
  ) {
    this.entityName = this.repository.metadata.name;
  }

  /**
   * Fetches triggers that are ready for processing.
   *
   * This method finds triggers that are due for execution based on their next run timestamp,
   * and marks them as ready for processing. It handles optimistic locking conflicts by skipping
   * triggers that are likely being processed by another instance.
   *
   * @returns A promise that resolves to an array of triggers ready for processing
   */
  async fetchTriggersReadyForProcessing(): Promise<T[]> {
    this.logger.debug(`[${this.entityName}] Fetching triggers ready for processing.`);

    const startTime = this.systemClock.now();

    try {
      await this.deleteTriggersByTtl();
      await this.recoverStuckTriggers();
      return await this.fetchAndClaimTriggers(startTime);
    } catch (error) {
      this.logCriticalFailure(error);
    }
    return [];
  }

  /**
   * Fetches a list of triggers that are in the "CANCELLING" status.
   *
   * @return {Promise<T[]>} A promise that resolves to an array of triggers with the status set to "CANCELLING".
   */
  async fetchTriggersForRunCancellation(): Promise<T[]> {
    return this.repository.find({
      where: {
        status: TriggerStatus.CANCELLING,
      },
    } as FindManyOptions<T>);
  }

  /**
   * Fetches and claims triggers in chunks until batch is full or no triggers remain.
   *
   * Each iteration fetches up to `remaining` triggers (how many more are needed to fill
   * the batch), then tries to claim each one via UPDATE with optimistic lock.
   * On success: trigger is claimed (READY), added to batch.
   * On failure: another instance claimed it, skip and try next from the chunk.
   * When chunk is exhausted — fetch next chunk with updated `remaining`.
   *
   * This approach naturally distributes work across multiple instances,
   * enforces processingBatchLimit, and minimizes DB round-trips by fetching
   * as many triggers as needed in a single SELECT.
   *
   * @param currentTime The current time to use for time-based comparisons
   * @returns A promise that resolves to an array of triggers that were successfully claimed
   */
  private async fetchAndClaimTriggers(currentTime: Date): Promise<T[]> {
    const result: T[] = [];
    const limit = this.processingBatchLimit ?? TriggerFetcherService.DEFAULT_PROCESSING_BATCH_LIMIT;
    const maxIterations = limit * 3; // Safeguard against infinite loop
    let iterations = 0;

    while (result.length < limit) {
      if (++iterations > maxIterations) {
        this.logger.warn(
          `[${this.entityName}] Reached max iterations safeguard (${maxIterations}), stopping. ` +
            `Claimed ${result.length}/${limit} triggers.`
        );
        break;
      }

      const remaining = limit - result.length;
      const findOptions = this.fetchStrategy.getFindOptions(currentTime);
      findOptions.take = remaining;

      const triggers = await this.repository.find(findOptions);
      if (triggers.length === 0) {
        break;
      }

      for (const trigger of triggers) {
        if (result.length >= limit) {
          break;
        }

        const timeNow = this.systemClock.now();
        const { affected } = await this.repository.update(
          {
            id: trigger.id,
            version: trigger.version,
            status: TriggerStatus.IDLE,
          } as FindOptionsWhere<T>,
          {
            status: TriggerStatus.READY,
            modifiedAt: timeNow,
            version: () => 'version + 1',
          } as QueryDeepPartialEntity<T>
        );

        if (affected) {
          trigger.status = TriggerStatus.READY;
          trigger.modifiedAt = timeNow;
          trigger.version += 1;
          result.push(trigger);
        } else {
          this.logger.log(
            `[${this.entityName}] Trigger ${trigger.id} claimed by another instance, trying next.`
          );
        }
      }

      // If DB returned fewer triggers than requested — no more available
      if (triggers.length < remaining) {
        break;
      }
    }

    return result;
  }

  /**
   * Recovers stuck triggers by identifying triggers that are in processing, cancelling, or ready states
   * and have surpassed the timeout threshold. Updates their status to idle and increments their version.
   *
   * @return {Promise<void>} A promise that resolves when the recovery process is complete.
   */
  private async recoverStuckTriggers(): Promise<void> {
    if (!this.stuckTriggerTimeoutSeconds) {
      this.logger.debug('[TriggerFetcherService] Stuck trigger timeout is not configured.');
      return;
    }

    const stuckStartTime = new Date(
      this.systemClock.now().getTime() - this.stuckTriggerTimeoutSeconds * 1000
    );
    const recoveryStatus = TriggerStatus.IDLE;
    const { affected } = await this.repository.update(
      {
        status: In([TriggerStatus.PROCESSING, TriggerStatus.CANCELLING, TriggerStatus.READY]),
        modifiedAt: LessThanOrEqual(stuckStartTime),
      } as FindOptionsWhere<T>,
      {
        status: recoveryStatus,
        version: () => 'version + 1',
      } as QueryDeepPartialEntity<T>
    );

    if (affected) {
      this.logger.warn(
        `[${this.entityName}] ${affected} stuck triggers returned to ${recoveryStatus} status.`
      );
    }
  }

  /**
   * Deletes expired triggers from the database based on the configured TTL (time-to-live) value.
   *
   * The method calculates the expiration based on the current system clock and the TTL value,
   * then removes any triggers with a creation date that falls before the TTL start time.
   *
   * @return {Promise<void>} A promise that resolves when the deletion operation is complete.
   */
  private async deleteTriggersByTtl(): Promise<void> {
    if (!this.triggerTtlSeconds) {
      this.logger.debug('[TriggerFetcherService] Trigger TTL is not configured.');
      return;
    }

    const ttlStartTime = new Date(this.systemClock.now().getTime() - this.triggerTtlSeconds * 1000);
    const { affected } = await this.repository.delete({
      createdAt: LessThanOrEqual(ttlStartTime),
    } as FindOptionsWhere<T>);

    if (affected) {
      this.logger.log(`[${this.entityName}] ${affected} triggers deleted due to TTL.`);
    }
  }

  /**
   * Logs a critical failure that occurred during the entire dispatcher run.
   *
   * @param error The error that occurred
   */
  private logCriticalFailure(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    this.logger.error(
      `[${this.entityName}] Critical failure in dispatcher: ${errorMessage}`,
      errorStack
    );
  }
}
