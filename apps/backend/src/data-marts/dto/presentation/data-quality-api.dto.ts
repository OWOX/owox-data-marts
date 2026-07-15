import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { DataQualityConfigApiDto, DataQualityRunApiDto } from '../domain/data-quality.dto';
import {
  DataQualityCheckScope,
  DataQualityConfig,
  DataQualityRuleConfig,
  EffectiveDataQualityConfig,
  EffectiveDataQualityRuleConfig,
} from '../schemas/data-quality/data-quality-config.schema';
import {
  DataQualityCheckResultSnapshot,
  DataQualityMappedError,
  DataQualityResultExample,
  DataQualityRunSnapshot,
  DataQualitySummary,
} from '../schemas/data-quality/data-quality-run.schema';
import { DataQualityCategory } from '../../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../../enums/data-quality-summary-state.enum';

export enum DataQualityConfigSource {
  DEFAULT = 'DEFAULT',
  SAVED = 'SAVED',
}

export enum DataQualityBatchErrorCode {
  NOT_FOUND_OR_FORBIDDEN = 'NOT_FOUND_OR_FORBIDDEN',
  NOT_ELIGIBLE = 'NOT_ELIGIBLE',
  ACTIVE_RUN = 'ACTIVE_RUN',
  INVALID_CONFIG = 'INVALID_CONFIG',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export enum DataQualityRunEligibilityCode {
  NOT_PUBLISHED = 'NOT_PUBLISHED',
  OUTPUT_SCHEMA_REQUIRED = 'OUTPUT_SCHEMA_REQUIRED',
  DEFINITION_REQUIRED = 'DEFINITION_REQUIRED',
  NO_APPLICABLE_CHECKS = 'NO_APPLICABLE_CHECKS',
  ACTIVE_RUN = 'ACTIVE_RUN',
}

export class DataQualityRunEligibilityApiDto {
  @ApiProperty()
  eligible: boolean;

  @ApiProperty({ enum: DataQualityRunEligibilityCode, nullable: true })
  code: DataQualityRunEligibilityCode | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  activeRunId: string | null;
}

export class DataQualityScopeApiDto {
  @ApiProperty({ enum: DataQualityScope })
  type: DataQualityScope;

  @ApiPropertyOptional()
  fieldId?: string;

  @ApiPropertyOptional()
  relationshipId?: string;
}

export class DataQualityCheckParametersApiDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  thresholdPercent?: number;

  @ApiPropertyOptional({ minimum: 0 })
  thresholdHours?: number;
}

export class DataQualityRuleConfigApiDto implements DataQualityRuleConfig {
  @ApiProperty()
  key: string;

  @ApiProperty({ enum: DataQualityCategory })
  category: DataQualityCategory;

  @ApiProperty({ type: DataQualityScopeApiDto })
  scope: DataQualityCheckScope;

  @ApiProperty({ enum: DataQualitySeverity })
  severity: DataQualitySeverity;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: DataQualityCheckParametersApiDto })
  parameters: DataQualityCheckParametersApiDto;
}

export class EffectiveDataQualityRuleConfigApiDto
  extends DataQualityRuleConfigApiDto
  implements EffectiveDataQualityRuleConfig
{
  @ApiProperty()
  isApplicable: boolean;

  @ApiPropertyOptional()
  notApplicableReason?: string;
}

export class DataQualityConfigValueApiDto implements DataQualityConfig {
  @ApiProperty({ example: 'UTC' })
  timezone: string;

  @ApiProperty({ type: [DataQualityRuleConfigApiDto] })
  rules: DataQualityRuleConfig[];
}

export class EffectiveDataQualityConfigValueApiDto implements EffectiveDataQualityConfig {
  @ApiProperty({ example: 'UTC' })
  timezone: string;

  @ApiProperty({ type: [EffectiveDataQualityRuleConfigApiDto] })
  rules: EffectiveDataQualityRuleConfig[];
}

export class DataQualityConfigResponseApiDto implements DataQualityConfigApiDto {
  @ApiProperty({ enum: DataQualityConfigSource })
  source: DataQualityConfigSource;

  @ApiProperty({ type: DataQualityConfigValueApiDto, nullable: true })
  savedConfig: DataQualityConfig | null;

  @ApiProperty({ type: EffectiveDataQualityConfigValueApiDto })
  effectiveConfig: EffectiveDataQualityConfig;

  @ApiProperty({ enum: DataQualityCategory, isArray: true })
  availableChecks: DataQualityCategory[];

  @ApiProperty()
  canEdit: boolean;

  @ApiProperty()
  canRun: boolean;

  @ApiProperty({ type: DataQualityRunEligibilityApiDto })
  runEligibility: DataQualityRunEligibilityApiDto;
}

export class RunDataQualityRequestApiDto {
  @ApiPropertyOptional({
    oneOf: [{ $ref: getSchemaPath(DataQualityConfigValueApiDto) }, { type: 'null' }],
    description: 'When present, atomically replaces the saved configuration before the run.',
  })
  @IsOptional()
  config?: DataQualityConfig | null;
}

export class RunDataQualityResponseApiDto {
  @ApiProperty({ format: 'uuid' })
  runId: string;
}

export class BatchRunDataQualityRequestApiDto {
  @ApiProperty({ type: [String], maxItems: 200 })
  @IsArray()
  @IsString({ each: true })
  dataMartIds: string[];
}

export class DataQualityBatchRunSuccessApiDto {
  @ApiProperty()
  dataMartId: string;

  @ApiProperty({ enum: ['SUCCESS'] })
  status: 'SUCCESS';

  @ApiProperty({ format: 'uuid' })
  runId: string;
}

export class DataQualityBatchRunErrorApiDto {
  @ApiProperty()
  dataMartId: string;

  @ApiProperty({ enum: ['ERROR'] })
  status: 'ERROR';

  @ApiProperty({ enum: DataQualityBatchErrorCode })
  code: DataQualityBatchErrorCode;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  activeRunId?: string | null;
}

export type DataQualityBatchRunItemApiDto =
  | DataQualityBatchRunSuccessApiDto
  | DataQualityBatchRunErrorApiDto;

@ApiExtraModels(DataQualityBatchRunSuccessApiDto, DataQualityBatchRunErrorApiDto)
export class BatchRunDataQualityResponseApiDto {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(DataQualityBatchRunSuccessApiDto) },
        { $ref: getSchemaPath(DataQualityBatchRunErrorApiDto) },
      ],
      discriminator: { propertyName: 'status' },
    },
  })
  items: DataQualityBatchRunItemApiDto[];
}

export class DataQualitySummaryApiDto implements DataQualitySummary {
  @ApiProperty({ enum: DataQualitySummaryState })
  state: DataQualitySummaryState;

  @ApiProperty()
  enabledChecks: number;

  @ApiProperty()
  totalChecks: number;

  @ApiProperty()
  passedChecks: number;

  @ApiProperty()
  failedChecks: number;

  @ApiProperty()
  notApplicableChecks: number;

  @ApiProperty()
  errorChecks: number;

  @ApiProperty()
  noticeFindings: number;

  @ApiProperty()
  warningFindings: number;

  @ApiProperty()
  errorFindings: number;

  @ApiProperty()
  violationCount: number;

  @ApiProperty({ enum: DataQualitySeverity, nullable: true })
  highestSeverity: DataQualitySeverity | null;
}

export class CompactDataQualitySummaryApiDto extends DataQualitySummaryApiDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  dataMartRunId: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastRunAt: Date | null;
}

export class DataQualityResultExampleApiDto implements DataQualityResultExample {
  @ApiProperty({ type: 'object', additionalProperties: true })
  values: Record<string, unknown>;
}

export class DataQualityMappedErrorApiDto implements DataQualityMappedError {
  @ApiProperty({ nullable: true })
  code: string | null;

  @ApiProperty()
  message: string;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  details: Record<string, unknown> | null;
}

export class DataQualityCheckResultResponseApiDto implements DataQualityCheckResultSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  ruleKey: string;

  @ApiProperty({ enum: DataQualityCategory })
  category: DataQualityCategory;

  @ApiProperty({ type: DataQualityScopeApiDto })
  scope: DataQualityCheckScope;

  @ApiProperty({ enum: DataQualitySeverity })
  severity: DataQualitySeverity;

  @ApiProperty({ enum: DataQualityCheckStatus })
  status: DataQualityCheckStatus;

  @ApiProperty()
  violationCount: number;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: [DataQualityResultExampleApiDto] })
  examples: DataQualityResultExample[];

  @ApiProperty({ type: [String] })
  executedSql: string[];

  @ApiProperty({ nullable: true })
  reproductionSql: string | null;

  @ApiProperty({ type: DataQualityMappedErrorApiDto, nullable: true })
  error: DataQualityMappedError | null;

  @ApiProperty({ format: 'uuid' })
  dataQualityRunId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ description: 'Sensitive relationship details were hidden by target access' })
  redacted: boolean;
}

export class DataQualityRunSnapshotApiDto implements DataQualityRunSnapshot {
  @ApiProperty({ type: EffectiveDataQualityConfigValueApiDto })
  config: EffectiveDataQualityConfig;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  schema: DataQualityRunSnapshot['schema'];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  relationships: DataQualityRunSnapshot['relationships'];

  @ApiProperty({ example: 'UTC' })
  timezone: string;
}

export class DataQualityRunResponseApiDto implements DataQualityRunApiDto {
  @ApiProperty({ format: 'uuid', description: 'Internal Data Quality run id' })
  id: string;

  @ApiProperty({ format: 'uuid', description: 'Public run id' })
  dataMartRunId: string;

  @ApiProperty({ type: DataQualityRunSnapshotApiDto })
  snapshot: DataQualityRunSnapshot;

  @ApiProperty({ type: DataQualitySummaryApiDto })
  summary: DataQualitySummary;

  @ApiProperty({ type: [DataQualityCheckResultResponseApiDto] })
  results: DataQualityRunApiDto['results'];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt: Date | null;
}

export class LatestDataQualityRunResponseApiDto {
  @ApiProperty({ format: 'uuid' })
  runId: string;

  @ApiProperty({ type: DataQualitySummaryApiDto })
  summary: DataQualitySummary;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt: Date | null;
}
