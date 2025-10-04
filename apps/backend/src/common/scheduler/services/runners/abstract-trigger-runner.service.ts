import { Trigger } from '../../shared/entities/trigger.entity';
import { TriggerStatus } from '../../shared/entities/trigger-status';
import { TriggerHandler } from '../../shared/trigger-handler.interface';
import { Logger } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { SystemTimeService } from '../system-time.service';
import { TriggerRunnerService } from './trigger-runner.interface';
import { GracefulShutdownService } from '../graceful-shutdown.service';

/**
 * Abstract base class for trigger runner services.
 *
 * This class provides common functionality for processing triggers, including error handling,
 * status updates, and execution logic. Concrete implementations must define how batches of
 * triggers are processed by implementing the `processTriggers` method.
 *
 * @typeParam T - The type of trigger this service processes, must extend TimeBasedTrigger
 */
export abstract class AbstractTriggerRunnerService<T extends Trigger>
  implements TriggerRunnerService<T>
{
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly abortControllersByTriggerId: Map<string, AbortController> = new Map();
  protected readonly handlerName: string;

  /**
   * Creates a new instance of the AbstractTriggerRunnerService.
   *
   * @param handler The trigger handler that defines how triggers are processed
   * @param systemClock The system time service used to get the current time
   * @param shutdownService The graceful shutdown service used to manage shutdown state
   */
  protected constructor(
    protected readonly handler: TriggerHandler<T>,
    protected readonly systemClock: SystemTimeService,
    protected readonly shutdownService: GracefulShutdownService
  ) {
    this.handlerName = this.handler.constructor.name;
  }

  /**
   * Processes a batch of triggers.
   *
   * This abstract method must be implemented by concrete subclasses to define
   * how batches of triggers are processed.
   *
   * @param triggers The triggers to process
   * @returns A promise that resolves when all triggers have been processed
   */
  protected abstract processTriggers(triggers: T[]): Promise<void>;

  /**
   * Runs a batch of triggers.
   *
   * This method is the entry point for trigger processing. It delegates the actual
   * processing to the `processTriggers` method implemented by concrete subclasses.
   *
   * @param triggers The triggers to run
   * @returns A promise that resolves when all triggers have been processed
   */
  public async runTriggers(triggers: T[]): Promise<void> {
    if (triggers.length === 0) {
      this.logger.debug(`[${this.handlerName}] No triggers found for processing`);
      return;
    }

    this.logger.debug(`[${this.handlerName}] Processing ${triggers.length} triggers`);

    await this.processTriggers(triggers);
  }

  /**
   * Aborts the execution of the provided triggers by invoking their associated abort controllers.
   *
   * @param {T[]} triggers - An array of triggers whose runs need to be aborted. Each trigger is expected to have a unique identifier.
   * @return {Promise<void>} A promise that resolves when all associated triggers have been processed for abortion.
   */
  public async abortTriggerRuns(triggers: T[]): Promise<void> {
    for (const trigger of triggers) {
      const abortController = this.abortControllersByTriggerId.get(trigger.id);
      if (abortController) {
        abortController.abort();
        this.logger.log(`[${this.handlerName}] Aborting trigger run for trigger ${trigger.id}`);
      }
    }
  }

  /**
   * Processes a single trigger safely, handling errors and status updates.
   *
   * This method updates the trigger status, executes the trigger, and handles any errors
   * that occur during processing.
   *
   * @param trigger The trigger to process
   * @returns A promise that resolves when the trigger has been processed
   */
  protected async processTriggerSafely(trigger: T): Promise<void> {
    const repository = this.handler.getTriggerRepository();
    let processId: string | null = null;

    // Check if the application is shutting down
    if (this.shutdownService.isInShutdownMode()) {
      this.logger.warn(
        `[${this.handlerName}] Cannot process trigger ${trigger.id}: Application is shutting down.`
      );
      return;
    }

    try {
      // Register this trigger processing as an active process
      processId = this.shutdownService.registerActiveProcess(
        `${this.handlerName}-trigger-${trigger.id}`
      );

      await this.updateTriggerStatus(trigger, TriggerStatus.PROCESSING, repository);
      await this.executeTrigger(trigger, repository);

      this.logger.debug(`[${this.handlerName}] Successfully processed trigger: ${trigger.id}`);
    } catch (error) {
      await this.handleTriggerError(error, trigger, repository);
    } finally {
      // Always unregister the process, even if an error occurred
      if (processId) {
        this.shutdownService.unregisterActiveProcess(processId);
      }
    }
  }

  /**
   * Executes a trigger by calling the handler and updating its status on success.
   *
   * @param trigger The trigger to execute
   * @param repository The repository for the trigger entity
   * @returns A promise that resolves when the trigger has been executed
   */
  private async executeTrigger(trigger: T, repository: Repository<T>): Promise<void> {
    const abortController = new AbortController();
    this.abortControllersByTriggerId.set(trigger.id, abortController);
    try {
      await this.handler.handleTrigger(trigger, { signal: abortController.signal });
      trigger.onSuccess(this.systemClock.now());
      await repository.save(trigger);
    } finally {
      this.abortControllersByTriggerId.delete(trigger.id);
    }
  }

  /**
   * Handles errors that occur during trigger processing.
   *
   * This method checks if the error is an optimistic lock error, and if not,
   * marks the trigger as having an error.
   *
   * @param error The error that occurred
   * @param trigger The trigger that was being processed
   * @param repository The repository for the trigger entity
   * @returns A promise that resolves when the error has been handled
   */
  private async handleTriggerError(
    error: unknown,
    trigger: T,
    repository: Repository<T>
  ): Promise<void> {
    if (this.isOptimisticLockError(error)) {
      this.logger.debug(
        `[${this.handlerName}] Optimistic lock conflict for trigger ${trigger.id}. Skipping as likely processed by another instance.`
      );
      return;
    }

    this.logger.error(`[${this.handlerName}] Failed to process trigger ${trigger.id}:`, error);

    try {
      await this.markTriggerAsError(trigger, repository);
    } catch (secondaryError) {
      this.logger.error(
        `[${this.handlerName}] Failed to mark trigger ${trigger.id} as error:`,
        secondaryError
      );
    }
  }

  /**
   * Updates the status of a trigger.
   *
   * @param trigger The trigger to update
   * @param status The new status
   * @param repository The repository for the trigger entity
   * @returns A promise that resolves when the trigger has been updated
   */
  private async updateTriggerStatus(
    trigger: T,
    status: TriggerStatus,
    repository: Repository<T>
  ): Promise<void> {
    trigger.status = status;
    await repository.save(trigger);
  }

  /**
   * Marks a trigger as having an error.
   *
   * @param trigger The trigger to mark
   * @param repository The repository for the trigger entity
   * @returns A promise that resolves when the trigger has been marked
   */
  private async markTriggerAsError(trigger: T, repository: Repository<T>): Promise<void> {
    trigger.onError(this.systemClock.now());
    await repository.save(trigger);
  }

  /**
   * Checks if an error is an optimistic lock error.
   *
   * @param error The error to check
   * @returns True if the error is an optimistic lock error, false otherwise
   */
  private isOptimisticLockError(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.message.includes('version') || error.message.includes('optimistic lock'))
    );
  }
}
