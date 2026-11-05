import { manualBackfillWindowError } from '../domain/connector-run-payload.validation';
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

/**
 * Checks the backfill window inside the otherwise open `data` bag.
 *
 * `data` stays additionalProperties: true because its keys are connector-specific, so these
 * two are the only ones the platform itself can say anything about. Everything else in the
 * bag is passed through untouched.
 */
function IsManualBackfillDateRange(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isManualBackfillDateRange',
      validator: {
        validate(value: unknown): boolean {
          if (!isRecord(value) || value.runType !== 'MANUAL_BACKFILL') return true;
          if (!isRecord(value.data)) return true;
          return manualBackfillWindowError(value.data) === null;
        },
        defaultMessage: (args): string => {
          const fallback = 'manual-backfill window is invalid';
          const value: unknown = args?.value;
          if (!isRecord(value) || !isRecord(value.data)) {
            return fallback;
          }
          return manualBackfillWindowError(value.data) ?? fallback;
        },
      },
    },
    validationOptions
  );
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
  @IsManualBackfillDateRange()
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
    MANUAL_BACKFILL can include connector-specific fields in data; connectors without backfill
    fields can omit data. StartDate and EndDate accept YYYY-MM-DD (or the date part of an
    ISO-8601 timestamp). A missing or future EndDate counts as today. A StartDate earlier than
    2000-01-01 is rejected. The range has no other length limit: a range longer than 31 days runs
    as a chain of runs, one segment of up to 31 days each. A segment counts as one connector run
    once any of its accounts loads data.`,
  })
  payload?: Record<string, unknown> | undefined;
}
