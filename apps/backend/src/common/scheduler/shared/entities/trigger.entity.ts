import {
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { TriggerStatus } from './trigger-status';

/**
 * Abstract base class for all triggers.
 * Provides common properties for both immediate and time-based triggers.
 */
export abstract class Trigger {
  /**
   * Unique identifier for the trigger.
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
   * The timestamp when the trigger was created.
   */
  @CreateDateColumn()
  createdAt: Date;

  /**
   * The timestamp when the trigger was last updated.
   */
  @UpdateDateColumn()
  modifiedAt: Date;

  /**
   * Updates the trigger state after successful processing.
   *
   * @param _lastRunTimestamp Optional timestamp when the trigger was processed (used by time-based triggers)
   */
  onSuccess(_lastRunTimestamp?: Date) {
    this.status = TriggerStatus.SUCCESS;
  }

  /**
   * Updates the trigger state after a processing error.
   *
   * @param _lastRunTimestamp Optional timestamp when the trigger processing was attempted (used by time-based triggers)
   */
  onError(_lastRunTimestamp?: Date) {
    this.status = TriggerStatus.ERROR;
  }
}
