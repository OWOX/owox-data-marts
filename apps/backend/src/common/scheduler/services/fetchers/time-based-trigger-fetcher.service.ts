import { Injectable, Logger } from '@nestjs/common';
import { TimeBasedTrigger, TriggerStatus } from '../../shared/entities/time-based-trigger.entity';
import { SystemTimeService } from '../system-time.service';
import { OptimisticLockVersionMismatchError, Repository } from 'typeorm';

/**
 * Service responsible for fetching time-based triggers that are ready for processing.
 *
 * This service queries the database for triggers that are due for execution based on their
 * next run timestamp, and marks them as ready for processing. It handles optimistic locking
 * to ensure triggers are not processed multiple times in distributed environments.
 *
 * @typeParam T - The type of trigger this service fetches, must extend TimeBasedTrigger
 */
@Injectable()
export class TimeBasedTriggerFetcherService<T extends TimeBasedTrigger> {
  private readonly logger = new Logger(TimeBasedTriggerFetcherService.name);
  private readonly entityName: string;

  /**
   * Creates a new instance of the TimeBasedTriggerFetcherService.
   *
   * @param repository The TypeORM repository for the trigger entity
   * @param systemClock The system time service used to get the current time
   */
  constructor(
    private readonly repository: Repository<T>,
    private readonly systemClock: SystemTimeService
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
      const triggers = await this.findTriggersReadyForProcessing(startTime);
      return await this.markTriggersAsReady(triggers);
    } catch (error) {
      this.logCriticalFailure(error);
    }
    return [];
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
    for (let i = 0; i < triggers.length; i++) {
      const trigger = triggers[i];
      try {
        trigger.status = TriggerStatus.READY;
        await this.repository.save(trigger);
        triggersToProcess.push(trigger);
      } catch (error) {
        if (error instanceof OptimisticLockVersionMismatchError) {
          this.logger.log(
            `[${this.entityName}] Optimistic lock conflict for trigger ${trigger.id}. Skipping as likely processed by another instance.`
          );
        } else {
          throw error;
        }
      }
    }
    return triggersToProcess;
  }

  /**
   * Finds triggers that are ready for processing based on their next run timestamp.
   * Only returns active triggers in IDLE status that are due for execution.
   *
   * @param currentTime The current time to compare against next run timestamps
   * @returns A promise that resolves to an array of triggers that are ready for processing
   */
  private async findTriggersReadyForProcessing(currentTime: Date): Promise<T[]> {
    return this.repository
      .createQueryBuilder('t')
      .where('t.nextRunTimestamp IS NOT NULL')
      .andWhere('t.nextRunTimestamp <= :currentTime', { currentTime })
      .andWhere('t.isActive = true')
      .andWhere('t.status = :status', { status: TriggerStatus.IDLE })
      .orderBy('t.nextRunTimestamp', 'ASC')
      .getMany();
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
