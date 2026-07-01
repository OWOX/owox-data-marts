import type { DataMartMetadataScope } from '../shared/data-mart-metadata-scope.enum';

/**
 * Request body for `POST /data-marts/:dataMartId/ai-helper/triggers`.
 *
 * The server returns a triggerId; the result is fetched via the trigger's GET
 * endpoint once polling sees a terminal status.
 */
export interface CreateAiHelperTriggerRequestDto {
  scope: DataMartMetadataScope;
  useSample: boolean;
  fieldName?: string;
}
