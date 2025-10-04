import { Column } from 'typeorm';
import { Trigger } from './trigger.entity';

/**
 * Abstract class for tasks to handle long-running UI requests.
 *
 * This class extends OneTimeTask to provide a common base for tasks that handle
 * long-running UI requests. It includes a column to store the response for the UI.
 */
export abstract class UiTrigger<UiResponseType> extends Trigger {
  @Column()
  userId: string;

  @Column({ type: 'json', nullable: true })
  uiResponse: UiResponseType;
}
