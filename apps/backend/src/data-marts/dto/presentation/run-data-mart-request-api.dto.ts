import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiSchema,
  getSchemaPath,
} from '@nestjs/swagger';
import { IsObject, ValidateBy, ValidateIf, type ValidationOptions } from 'class-validator';
import { MaxJsonSize } from '../../../common/validators/max-json-size.validator';

const MAX_PAYLOAD_SIZE_BYTES = 1024 * 1024; // 1MB

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function IsRunDataMartPayload(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isRunDataMartPayload',
      validator: {
        validate(value: unknown): boolean {
          if (!isRecord(value)) return false;
          if (Object.keys(value).some(key => key !== 'runType' && key !== 'data')) return false;
          const hasValidData = value.data === undefined || isRecord(value.data);
          if (value.runType === 'MANUAL_BACKFILL') return hasValidData;
          return (value.runType === undefined || value.runType === 'INCREMENTAL') && hasValidData;
        },
        defaultMessage: () =>
          'payload must select INCREMENTAL or MANUAL_BACKFILL and use object data when provided',
      },
    },
    validationOptions
  );
}

type ClosedApiSchemaOptions = NonNullable<Parameters<typeof ApiSchema>[0]> & {
  additionalProperties: false;
};

const incrementalSchema: ClosedApiSchemaOptions = {
  description: 'Incremental connector run options.',
  additionalProperties: false,
};

const manualBackfillSchema: ClosedApiSchemaOptions = {
  description: 'Manual-backfill connector run options.',
  additionalProperties: false,
};

@ApiSchema(incrementalSchema)
export class IncrementalRunDataMartPayloadApiDto {
  @ApiPropertyOptional({ enum: ['INCREMENTAL'], default: 'INCREMENTAL' })
  runType?: 'INCREMENTAL';

  @ApiPropertyOptional({
    type: Object,
    additionalProperties: true,
    description: 'Connector-specific fields retained for compatibility with existing run forms.',
  })
  data?: Record<string, unknown>;
}

@ApiSchema(manualBackfillSchema)
export class ManualBackfillRunDataMartPayloadApiDto {
  @ApiProperty({ enum: ['MANUAL_BACKFILL'] })
  runType: 'MANUAL_BACKFILL';

  @ApiPropertyOptional({
    type: Object,
    additionalProperties: true,
    description: 'Connector-specific manual-backfill fields, when the connector defines them.',
  })
  data?: Record<string, unknown>;
}

@ApiExtraModels(IncrementalRunDataMartPayloadApiDto, ManualBackfillRunDataMartPayloadApiDto)
export class RunDataMartRequestApiDto {
  /**
   * Payload for the manual run. Omit it or select INCREMENTAL for an incremental run.
   * MANUAL_BACKFILL can include connector-specific fields in data.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @IsRunDataMartPayload()
  @MaxJsonSize(MAX_PAYLOAD_SIZE_BYTES)
  @ApiPropertyOptional({
    oneOf: [
      { $ref: getSchemaPath(IncrementalRunDataMartPayloadApiDto) },
      { $ref: getSchemaPath(ManualBackfillRunDataMartPayloadApiDto) },
    ],
    example: {
      runType: 'MANUAL_BACKFILL',
      data: { StartDate: '2026-07-01', EndDate: '2026-07-31' },
    },
    description: `Payload for the manual run. Omit it or select INCREMENTAL for an incremental run.
    MANUAL_BACKFILL can include connector-specific fields in data.`,
  })
  payload?: Record<string, unknown> | undefined;
}
