import {
  DataQualityConfig,
  EffectiveDataQualityConfig,
} from '../schemas/data-quality/data-quality-config.schema';
import {
  DataQualityCheckResultSnapshot,
  DataQualityRunSnapshot,
  DataQualitySummary,
} from '../schemas/data-quality/data-quality-run.schema';

export interface DataQualityConfigDto {
  savedConfig: DataQualityConfig | null;
  effectiveConfig: EffectiveDataQualityConfig;
  canEdit: boolean;
  canRun: boolean;
}

export interface DataQualitySummaryDto extends DataQualitySummary {
  dataMartRunId: string | null;
  lastRunAt: Date | null;
}

export interface DataQualityCheckResultDto extends DataQualityCheckResultSnapshot {
  dataQualityRunId: string;
  createdAt: Date;
  redacted?: boolean;
}

export interface DataQualityRunDto {
  id: string;
  dataMartRunId: string;
  snapshot: DataQualityRunSnapshot;
  summary: DataQualitySummary;
  results: DataQualityCheckResultDto[];
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export type DataQualityConfigApiDto = DataQualityConfigDto;
export type DataQualitySummaryApiDto = DataQualitySummaryDto;
export type DataQualityCheckResultApiDto = DataQualityCheckResultDto;
export type DataQualityRunApiDto = DataQualityRunDto;
