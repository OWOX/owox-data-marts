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
 * Reads a manual-backfill date the way the connector engine does.
 *
 * A deliberate mirror of AbstractConnector._parseDate: the calendar date is taken from the
 * YYYY-MM-DD prefix and any time part is ignored, which pins the value to UTC midnight and
 * takes the day the customer wrote literally. 1-2 digit month/day components are accepted
 * because stored run forms send them; a 1-3 digit year is not, because Date.UTC would map
 * it into 19xx. Out-of-range components (2026-13-45) roll over, as they do in the engine.
 *
 * Rejecting anything the engine would have accepted would turn a working request into a
 * 400, so this stays in step with it rather than tightening it.
 *
 * @returns milliseconds since epoch at UTC midnight, or NaN when the value is unreadable
 */
function parseBackfillDate(value: unknown): number {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? NaN
      : Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return NaN;
    const asDate = new Date(value);
    return Date.UTC(asDate.getUTCFullYear(), asDate.getUTCMonth(), asDate.getUTCDate());
  }

  if (typeof value !== 'string') return NaN;

  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[Tt ].*)?$/.exec(value.trim());
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Reports the first problem with a manual-backfill window, mirroring the checks in
 * AbstractConnector._getManualBackfillDateRange so a bad window is a 400 instead of a run
 * that starts and then dies.
 *
 * Two engine behaviours are mirrored rather than improved on. A falsy value is passed over:
 * the engine reads it as "not supplied" and owns the decision of whether it was required,
 * which varies by connector -- not every connector even has a time-series node. And an
 * EndDate in the future is accepted, because the engine warns and clamps it to today.
 *
 * @returns the message to reject with, or null when the window is usable
 */
function manualBackfillWindowError(data: Record<string, unknown>): string | null {
  const startDate = data.StartDate;
  const endDate = data.EndDate;

  const startMs = startDate ? parseBackfillDate(startDate) : null;
  const endMs = endDate ? parseBackfillDate(endDate) : null;

  if (startMs !== null && Number.isNaN(startMs)) {
    return unreadableDateMessage('StartDate', startDate);
  }
  if (endMs !== null && Number.isNaN(endMs)) {
    return unreadableDateMessage('EndDate', endDate);
  }

  if (startMs !== null && endMs !== null && endMs < startMs) {
    return `EndDate (${String(endDate)}) cannot be earlier than StartDate (${String(startDate)})`;
  }

  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (startMs !== null && startMs > todayMs) {
    return `StartDate (${String(startDate)}) cannot be in the future`;
  }

  return null;
}

function unreadableDateMessage(field: string, value: unknown): string {
  return (
    `${field} (${String(value)}) is not a valid date. Use YYYY-MM-DD (e.g. 2024-01-15) or an ` +
    `ISO-8601 timestamp (e.g. 2024-01-15T00:00:00.000Z).`
  );
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
    MANUAL_BACKFILL can include connector-specific fields in data.`,
  })
  payload?: Record<string, unknown> | undefined;
}
