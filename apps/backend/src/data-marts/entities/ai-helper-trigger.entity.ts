import { Column, Entity } from 'typeorm';
import { UiTrigger } from '../../common/scheduler/shared/entities/ui-trigger.entity';
import {
  DataMartMetadataScope,
  GenerateDataMartMetadataResponse,
} from '../ai-insights/ai-insights-types';

/**
 * Payload shape persisted on `uiResponse` while the trigger is in flight or terminal.
 * - SUCCESS: `result` is populated with the AI-generated metadata.
 * - ERROR:   `error` is populated with a user-facing message.
 */
export interface AiHelperUiResponse {
  result?: GenerateDataMartMetadataResponse;
  error?: string;
}

/**
 * Entity for AI helper triggers.
 *
 * Asynchronous version of the AI metadata generation flow: the API returns a triggerId
 * immediately, a scheduler-driven handler runs the actual generation in the background,
 * and the UI polls the status/result endpoints. This bypasses the ingress idle-timeout
 * that was killing slow synchronous requests.
 */
@Entity('ai_helper_triggers')
export class AiHelperTrigger extends UiTrigger<AiHelperUiResponse> {
  /**
   * ID of the data mart for which metadata is generated.
   */
  @Column()
  dataMartId: string;

  /**
   * Which slice of metadata to generate (title / description / single field / all fields).
   */
  @Column({ type: 'varchar' })
  scope: DataMartMetadataScope;

  /**
   * When true, the handler fetches up to 30 sample rows from the data mart before invoking
   * the LLM. When false, the LLM is grounded only in column names and types.
   */
  @Column({ type: 'boolean' })
  useSample: boolean;

  /**
   * Target field name for FIELD_ALIAS / FIELD_DESCRIPTION scopes; null otherwise.
   */
  @Column({ type: 'varchar', nullable: true })
  fieldName: string | null;
}
