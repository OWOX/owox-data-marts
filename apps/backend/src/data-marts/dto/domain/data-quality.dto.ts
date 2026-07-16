import {
  DataQualityConfig,
  EffectiveDataQualityConfig,
} from '../schemas/data-quality/data-quality-config.schema';
import {
  DataQualityRunSnapshot,
  DataQualityStoredCheckResult,
  DataQualitySummary,
} from '../schemas/data-quality/data-quality-run.schema';
import { JoinCondition } from '../schemas/join-condition.schema';

export interface DataQualityRelationshipMetadataDto {
  id: string;
  targetAlias: string;
  joinConditions: JoinCondition[];
}

export interface DataQualityConfigDto {
  savedConfig: DataQualityConfig | null;
  effectiveConfig: EffectiveDataQualityConfig;
  relationships: DataQualityRelationshipMetadataDto[];
  canEdit: boolean;
  canRun: boolean;
}

export interface DataQualitySummaryDto extends DataQualitySummary {
  dataMartRunId: string | null;
  lastRunAt: Date | null;
}

export interface DataQualityCheckResultDto extends DataQualityStoredCheckResult {
  redacted: boolean;
}

export interface DataQualityRunDetailsDto {
  snapshot: DataQualityRunSnapshot;
  summary: DataQualitySummary;
  results: DataQualityStoredCheckResult[];
}

export type DataQualityConfigApiDto = DataQualityConfigDto;
export type DataQualitySummaryApiDto = DataQualitySummaryDto;
export type DataQualityCheckResultApiDto = DataQualityCheckResultDto;
export type DataQualityRunDetailsApiDto = DataQualityRunDetailsDto;
