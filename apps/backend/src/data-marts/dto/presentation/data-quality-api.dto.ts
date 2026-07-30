import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, Matches } from 'class-validator';
import {
  DataQualityConfigDto,
  DataQualityRelationshipMetadataDto,
  DataQualityRunHistorySnapshotDto,
  DataQualityRunDetailsDto,
} from '../domain/data-quality.dto';
import {
  DataQualityCheckScope,
  DataQualityConfig,
  DataQualityRuleConfig,
  EffectiveDataQualityConfig,
  EffectiveDataQualityRuleConfig,
} from '../schemas/data-quality/data-quality-config.schema';
import {
  DataQualityMappedError,
  DataQualityRelationshipSnapshot,
  DataQualityResultExample,
  DataQualityStoredCheckResult,
  DataQualitySummary,
} from '../schemas/data-quality/data-quality-run.schema';
import { DataQualityCategory } from '../../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../../enums/data-quality-summary-state.enum';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { JoinCondition } from '../schemas/join-condition.schema';

export enum DataQualityConfigSource {
  DEFAULT = 'DEFAULT',
  SAVED = 'SAVED',
}

export enum DataQualityBatchErrorCode {
  NOT_FOUND_OR_FORBIDDEN = 'NOT_FOUND_OR_FORBIDDEN',
  NOT_ELIGIBLE = 'NOT_ELIGIBLE',
  ACTIVE_RUN = 'ACTIVE_RUN',
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

  @ApiPropertyOptional({ type: [String] })
  fieldPath?: string[];

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
  @ApiProperty({ type: [DataQualityRuleConfigApiDto] })
  rules: DataQualityRuleConfig[];
}

export class EffectiveDataQualityConfigValueApiDto implements EffectiveDataQualityConfig {
  @ApiProperty({ type: [EffectiveDataQualityRuleConfigApiDto] })
  rules: EffectiveDataQualityRuleConfig[];
}

export class DataQualityRelationshipJoinConditionApiDto implements JoinCondition {
  @ApiProperty({ example: 'customer_id' })
  sourceFieldName: string;

  @ApiProperty({ example: 'id' })
  targetFieldName: string;
}

export class DataQualityRelationshipMetadataApiDto implements DataQualityRelationshipMetadataDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'customers' })
  targetAlias: string;

  @ApiProperty({ type: [DataQualityRelationshipJoinConditionApiDto] })
  joinConditions: DataQualityRelationshipJoinConditionApiDto[];
}

export class DataQualityConfigResponseApiDto implements DataQualityConfigDto {
  @ApiProperty({ enum: DataQualityConfigSource })
  source: DataQualityConfigSource;

  @ApiProperty({ type: DataQualityConfigValueApiDto, nullable: true })
  savedConfig: DataQualityConfig | null;

  @ApiProperty({ type: EffectiveDataQualityConfigValueApiDto })
  effectiveConfig: EffectiveDataQualityConfig;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  configRevision: string;

  @ApiProperty({ type: [DataQualityRelationshipMetadataApiDto] })
  relationships: DataQualityRelationshipMetadataApiDto[];

  @ApiProperty()
  canEdit: boolean;

  @ApiProperty()
  canRun: boolean;

  @ApiProperty({ type: DataQualityRunEligibilityApiDto })
  runEligibility: DataQualityRunEligibilityApiDto;
}

export class RunDataQualityResponseApiDto {
  @ApiProperty({ format: 'uuid' })
  runId: string;
}

export class RunDataQualityRequestApiDto {
  @ApiPropertyOptional({ pattern: '^[0-9a-f]{64}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  configRevision?: string;
}

export class BatchRunDataQualityRequestApiDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  dataMartIds: string[];
}

export class GetDataQualitySummariesRequestApiDto {
  @ApiProperty({ type: [String] })
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

export class DataQualitySummaryItemApiDto {
  @ApiProperty({ format: 'uuid' })
  dataMartId: string;

  @ApiProperty({ type: CompactDataQualitySummaryApiDto })
  summary: CompactDataQualitySummaryApiDto;
}

export class GetDataQualitySummariesResponseApiDto {
  @ApiProperty({ type: [DataQualitySummaryItemApiDto] })
  items: DataQualitySummaryItemApiDto[];
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

export class DataQualityCheckResultResponseApiDto implements DataQualityStoredCheckResult {
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

  @ApiProperty({ nullable: true })
  sql: string | null;

  @ApiProperty({ type: DataQualityMappedErrorApiDto, nullable: true })
  error: DataQualityMappedError | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ description: 'Sensitive relationship details were hidden by target access' })
  redacted: boolean;
}

export class DataQualityRelationshipSnapshotApiDto implements DataQualityRelationshipSnapshot {
  @ApiProperty()
  id: string;

  @ApiProperty()
  sourceDataMartId: string;

  @ApiProperty()
  targetDataMartId: string;

  @ApiProperty()
  targetAlias: string;

  @ApiProperty({ type: [DataQualityRelationshipJoinConditionApiDto] })
  joinConditions: DataQualityRelationshipJoinConditionApiDto[];

  @ApiPropertyOptional()
  targetAccessible?: boolean;
}

export class DataQualityRunSnapshotApiDto implements DataQualityRunHistorySnapshotDto {
  @ApiProperty({ type: EffectiveDataQualityConfigValueApiDto })
  config: EffectiveDataQualityConfig;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  schema: DataQualityRunHistorySnapshotDto['schema'];

  @ApiProperty({ type: [DataQualityRelationshipSnapshotApiDto] })
  relationships: DataQualityRelationshipSnapshot[];

  @ApiProperty({ enum: DataMartDefinitionType, enumName: 'DataMartDefinitionType' })
  definitionType: DataMartDefinitionType;
}

export class DataQualityRunDetailsResponseApiDto implements DataQualityRunDetailsDto {
  @ApiProperty({ type: DataQualityRunSnapshotApiDto })
  snapshot: DataQualityRunHistorySnapshotDto;

  @ApiProperty({ type: DataQualitySummaryApiDto })
  summary: DataQualitySummary;

  @ApiProperty({ type: [DataQualityCheckResultResponseApiDto] })
  results: DataQualityCheckResultResponseApiDto[];
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
