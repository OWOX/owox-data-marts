import { Column, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';

/**
 * Enum representing the possible states of a trigger.
 */
export enum TriggerStatus {
  /** Trigger is waiting to be scheduled */
  IDLE = 'IDLE',

  /** Trigger is ready to be processed */
  READY = 'READY',

  /** Trigger is currently being processed */
  PROCESSING = 'PROCESSING',

  /** Trigger has been successfully processed */
  SUCCESS = 'SUCCESS',

  /** An error occurred while processing the trigger */
  ERROR = 'ERROR',
}

/**
 * Abstract base class for time-based triggers.
 *
 * This class defines the common properties and behaviors for all time-based triggers.
 * Concrete trigger implementations should extend this class and add any additional
 * properties specific to their use case.
 */
export abstract class TimeBasedTrigger {
  /**
   * Unique identifier for the trigger.
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The timestamp when this trigger should next be executed.
   * If null, the trigger is not scheduled for execution.
   */
  @Column({ type: 'datetime', nullable: true })
  nextRunTimestamp: Date | null;

  /**
   * The timestamp when this trigger was last executed.
   * If null, the trigger has never been executed.
   */
  @Column({ type: 'datetime', nullable: true })
  lastRunTimestamp: Date | null;

  /**
   * Whether this trigger is active and should be considered for processing.
   */
  @Column()
  isActive: boolean;

  /**
   * Version number for optimistic locking.
   * This helps prevent concurrent modifications to the same trigger.
   */
  @VersionColumn()
  version: number;

  /**
   * The current status of the trigger.
   */
  @Column({
    type: 'varchar',
    enum: TriggerStatus,
    default: TriggerStatus.IDLE,
  })
  status: TriggerStatus;

  /**
   * Updates the trigger state after successful processing.
   *
   * @param lastRunTimestamp The timestamp when the trigger was processed
   */
  onSuccess(lastRunTimestamp: Date) {
    this.lastRunTimestamp = lastRunTimestamp;
    this.status = TriggerStatus.SUCCESS;
    this.discardNextRun();
  }

  /**
   * Updates the trigger state after a processing error.
   *
   * @param lastRunTimestamp The timestamp when the trigger processing was attempted
   */
  onError(lastRunTimestamp: Date) {
    this.lastRunTimestamp = lastRunTimestamp;
    this.status = TriggerStatus.ERROR;
  }

  /**
   * Disables the trigger by clearing the next run timestamp and setting it as inactive.
   */
  discardNextRun() {
    this.nextRunTimestamp = null;
    this.isActive = false;
  }
}
