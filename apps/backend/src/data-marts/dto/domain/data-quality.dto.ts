import {
  DataQualityConfig,
  EffectiveDataQualityConfig,
} from '../schemas/data-quality/data-quality-config.schema';
import {
  DataQualityRelationshipSnapshot,
  DataQualityStoredCheckResult,
  DataQualitySummary,
} from '../schemas/data-quality/data-quality-run.schema';
import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { JoinCondition } from '../schemas/join-condition.schema';

export interface DataQualityRelationshipMetadataDto {
  id: string;
  targetAlias: string;
  joinConditions: JoinCondition[];
}

export interface DataQualityConfigDto {
  savedConfig: DataQualityConfig | null;
  effectiveConfig: EffectiveDataQualityConfig;
  configRevision: string;
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

export interface DataQualityRunHistorySnapshotDto {
  config: EffectiveDataQualityConfig;
  schema: DataMartSchema | null;
  relationships: DataQualityRelationshipSnapshot[];
  definitionType: DataMartDefinitionType;
}

export interface DataQualityRunDetailsDto {
  snapshot: DataQualityRunHistorySnapshotDto;
  summary: DataQualitySummary;
  results: DataQualityCheckResultDto[];
}
