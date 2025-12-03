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

  /**
   * Creates a new instance of the TimeBasedTriggerFetcherService.
   *
   * @param repository The TypeORM repository for the trigger entity
   * @param systemClock The system time service used to get the current time
   * @param stuckTriggerTimeoutSeconds The timeout in seconds after which a trigger is considered stuck
   * @param triggerTtlSeconds The TTL in seconds for triggers
   * @param fetchStrategy The strategy for determining which triggers are ready for processing
   */
  constructor(
    private readonly repository: Repository<T>,
    private readonly systemClock: SystemTimeService,
    private readonly stuckTriggerTimeoutSeconds: number | undefined,
    private readonly triggerTtlSeconds: number | undefined,
    private readonly fetchStrategy: TriggerFetchStrategy<T>
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
    // this.logger.debug(`[${this.entityName}] Fetching triggers ready for processing.`);

    const startTime = this.systemClock.now();

    try {
      await this.deleteTriggersByTtl();
      await this.recoverStuckTriggers();
      const triggers = await this.findTriggersReadyForProcessing(startTime);
      return await this.markTriggersAsReady(triggers);
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
   * Marks triggers as ready for processing.
   *
   * This method updates the status of each trigger to READY and handles optimistic locking
   * conflicts by skipping triggers that are likely being processed by another instance.
   *
   * @param triggers The triggers to mark as ready
   * @returns A promise that resolves to an array of triggers that were successfully marked as ready
   */
  private async markTriggersAsReady(triggers: T[]): Promise<T[]> {
    const triggersToProcess: T[] = [];
    for (const trigger of triggers) {
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

      if (!affected) {
        this.logger.log(
          `[${this.entityName}] Optimistic lock conflict for trigger ${trigger.id}. Skipping as likely processed by another instance.`
        );
        continue;
      }

      trigger.status = TriggerStatus.READY;
      trigger.modifiedAt = timeNow;
      trigger.version += 1;
      triggersToProcess.push(trigger);
    }

    return triggersToProcess;
  }

  /**
   * Finds triggers that are ready for processing using the configured strategy.
   * The strategy determines the specific criteria for selecting triggers.
   *
   * @param currentTime The current time to use for time-based comparisons
   * @returns A promise that resolves to an array of triggers that are ready for processing
   */
  private async findTriggersReadyForProcessing(currentTime: Date): Promise<T[]> {
    const findOptions = this.fetchStrategy.getFindOptions(currentTime);
    return this.repository.find(findOptions);
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
