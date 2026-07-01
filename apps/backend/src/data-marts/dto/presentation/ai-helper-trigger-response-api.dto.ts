import { ApiPropertyOptional } from '@nestjs/swagger';
import { GenerateDataMartMetadataResponseApiDto } from './generate-data-mart-metadata-response-api.dto';

/**
 * Response payload returned from `GET /ai-helper/triggers/:triggerId`.
 *
 * One of `result` (on SUCCESS) or `error` (on ERROR) is set. Mirrors the shape
 * stored on `AiHelperTrigger.uiResponse`, with the inner result lifted into the
 * existing typed Swagger DTO so consumers get full intellisense.
 */
export class AiHelperTriggerResponseApiDto {
  @ApiPropertyOptional({
    type: () => GenerateDataMartMetadataResponseApiDto,
    description: 'AI-generated metadata. Present when the trigger succeeded.',
  })
  result?: GenerateDataMartMetadataResponseApiDto;

  @ApiPropertyOptional({
    type: String,
    description:
      'Human-readable error message. Present when the trigger errored. Surfaced to the user as a toast.',
  })
  error?: string;
}
