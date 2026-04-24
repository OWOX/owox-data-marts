import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ALIAS_PATH_REGEX, ALIAS_SEGMENT_ERROR } from '../schemas/blended-fields-config.schema';
import { AGGREGATE_FUNCTIONS, AggregateFunction } from '../schemas/aggregate-function.schema';
import { ValidateRecordValues } from '../../../common/validators/validate-record-values.validator';

const PATH_MESSAGE = `path must be a dot-separated chain where each segment ${ALIAS_SEGMENT_ERROR}`;

export class BlendedFieldOverrideApiDto {
  @ApiPropertyOptional({
    description: 'Optional custom alias shown in reports for this blended field.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  alias?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @ApiPropertyOptional({ enum: AGGREGATE_FUNCTIONS })
  @IsOptional()
  @IsIn(AGGREGATE_FUNCTIONS as readonly string[])
  aggregateFunction?: AggregateFunction;
}

@ApiExtraModels(BlendedFieldOverrideApiDto)
export class BlendedSourceApiDto {
  @ApiProperty({
    description: 'Dot-separated chain of target aliases identifying the blended data mart.',
    example: 'orders.items',
    pattern: ALIAS_PATH_REGEX.source,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(ALIAS_PATH_REGEX, { message: PATH_MESSAGE })
  path: string;

  @ApiProperty({
    description: 'Display label shown in report column headers.',
    example: 'Orders',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  alias: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isExcluded?: boolean;

  @ApiPropertyOptional({
    description:
      'Per-field overrides keyed by original field name. Values must match the blended field override shape.',
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(BlendedFieldOverrideApiDto) },
  })
  @IsOptional()
  @IsObject()
  @ValidateRecordValues(BlendedFieldOverrideApiDto)
  fields?: Record<string, BlendedFieldOverrideApiDto>;
}

export class BlendedFieldsConfigApiDto {
  @ApiProperty({ type: [BlendedSourceApiDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlendedSourceApiDto)
  sources: BlendedSourceApiDto[];
}

export class UpdateBlendedFieldsConfigApiDto {
  @ApiProperty({
    type: BlendedFieldsConfigApiDto,
    required: false,
    nullable: true,
    description: 'Pass `null` to clear the blended fields config.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BlendedFieldsConfigApiDto)
  blendedFieldsConfig?: BlendedFieldsConfigApiDto | null;
}
