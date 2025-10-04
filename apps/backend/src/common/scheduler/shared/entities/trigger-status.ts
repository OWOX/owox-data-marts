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

  /**
   * Trigger is being cancelled.
   */
  CANCELLING = 'CANCELLING',

  /**
   * Trigger has been cancelled.
   */
  CANCELLED = 'CANCELLED',
}
