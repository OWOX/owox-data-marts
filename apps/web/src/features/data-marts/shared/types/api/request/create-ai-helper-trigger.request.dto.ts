import type { DataMartMetadataScope } from '../shared/data-mart-metadata-scope.enum';

/**
 * Request body for `POST /data-marts/:dataMartId/ai-helper/triggers`.
 *
 * Mirrors the legacy synchronous `GenerateDataMartMetadataRequestDto` exactly — the
 * trigger flow accepts the same input, it just returns a triggerId instead of the
 * result inline.
 */
export interface CreateAiHelperTriggerRequestDto {
  scope: DataMartMetadataScope;
  useSample: boolean;
  fieldName?: string;
}
