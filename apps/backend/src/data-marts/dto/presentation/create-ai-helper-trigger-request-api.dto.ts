import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { DataMartMetadataScope } from '../../ai-insights/ai-insights-types';

/**
 * Request body for creating a new AI helper trigger.
 *
 * The controller returns a triggerId and the actual generation runs in the
 * background; clients poll status and fetch the result via the trigger's GET endpoints.
 */
export class CreateAiHelperTriggerRequestApiDto {
  @ApiProperty({
    enum: DataMartMetadataScope,
    description:
      'What metadata to generate. Use "all_field_*" scopes to populate every field; use "field_alias" or ' +
      '"field_description" together with `fieldName` to generate a single field value.',
  })
  @IsEnum(DataMartMetadataScope)
  scope: DataMartMetadataScope;

  @ApiProperty({
    type: Boolean,
    description:
      'When true, the data mart is run to fetch up to 30 sample rows that ground the AI in real values. ' +
      'When false, generation uses only column names and types (lower quality).',
    default: true,
  })
  @IsBoolean()
  useSample: boolean;

  @ApiPropertyOptional({
    type: String,
    description:
      'Required when scope is "field_alias" or "field_description". Must match an existing field name in the data mart schema.',
  })
  @ValidateIf(
    (o: CreateAiHelperTriggerRequestApiDto) =>
      o.scope === DataMartMetadataScope.FIELD_ALIAS ||
      o.scope === DataMartMetadataScope.FIELD_DESCRIPTION
  )
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  fieldName?: string;
}
