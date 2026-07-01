import type { GenerateDataMartMetadataResponseDto } from './generate-data-mart-metadata.response.dto';

/**
 * Response payload from `GET /data-marts/:dataMartId/ai-helper/triggers/:triggerId`.
 *
 * On SUCCESS, `result` is populated with the AI metadata. On ERROR, the backend
 * returns HTTP 400 with this shape carrying the user-facing `error` string.
 */
export interface AiHelperTriggerResponseDto {
  result?: GenerateDataMartMetadataResponseDto;
  error?: string;
}
