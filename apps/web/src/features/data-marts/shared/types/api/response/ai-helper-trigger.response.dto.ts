import type { GenerateDataMartMetadataResponseDto } from './generate-data-mart-metadata.response.dto';

/**
 * Response payload from `GET /data-marts/:dataMartId/ai-helper/triggers/:triggerId`.
 *
 * A successful generation carries `result`. A FAILED generation also arrives as
 * HTTP 200 — with `error` instead of `result`: the trigger handler swallows the
 * error into the trigger's uiResponse and the scheduler runner then flips the
 * trigger to SUCCESS unconditionally. HTTP 400 with `{ error }` occurs only for
 * triggers in a terminal ERROR/CANCELLED status (stuck-run recovery, abort).
 */
export interface AiHelperTriggerResponseDto {
  result?: GenerateDataMartMetadataResponseDto;
  error?: string;
}
