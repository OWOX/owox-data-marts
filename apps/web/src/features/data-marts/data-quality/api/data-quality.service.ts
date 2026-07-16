import type { AxiosRequestConfig } from '../../../../app/api/apiClient';
import { ApiService } from '../../../../services';
import { dataMartService } from '../../shared';
import { toStoredDataQualityConfig } from '../model/data-quality.model';
import { DataQualityRunDetailsMissingError } from '../model/types';
import type {
  DataQualityCheckResult,
  DataQualityCategory,
  DataQualityConfig,
  DataQualityConfigResponse,
  DataQualityRun,
  DataQualitySummary,
  EffectiveDataQualityConfig,
} from '../model/types';

interface RawDataQualityConfigResponse {
  savedConfig: DataQualityConfig | null;
  effectiveConfig: EffectiveDataQualityConfig;
  source?: 'DEFAULT' | 'SAVED';
  canEdit?: boolean;
  canRun?: boolean;
  permissions?: { canEdit?: boolean; canRun?: boolean };
  runEligibility?: DataQualityConfigResponse['runEligibility'];
  availableChecks?: DataQualityCategory[];
  relationships?: DataQualityConfigResponse['relationships'];
}

type RawRunResponse = Omit<Partial<DataQualityRun>, 'createdAt' | 'startedAt' | 'finishedAt'> & {
  runId?: string;
  run?: RawRunResponse;
  summary?: Partial<DataQualitySummary>;
  results?: DataQualityCheckResult[];
  createdAt?: string | Date | null;
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
};

export class DataQualityService extends ApiService {
  constructor() {
    super('/data-marts');
  }

  async getConfig(
    dataMartId: string,
    config?: AxiosRequestConfig
  ): Promise<DataQualityConfigResponse> {
    const response = await this.get<RawDataQualityConfigResponse>(
      `/${dataMartId}/data-quality/config`,
      undefined,
      config
    );
    return normalizeConfigResponse(response);
  }

  async replaceConfig(
    dataMartId: string,
    config: DataQualityConfig | EffectiveDataQualityConfig,
    requestConfig?: AxiosRequestConfig
  ): Promise<DataQualityConfigResponse> {
    const storedConfig = toStoredConfig(config);
    const response = await this.put<RawDataQualityConfigResponse>(
      `/${dataMartId}/data-quality/config`,
      storedConfig,
      requestConfig
    );
    return normalizeConfigResponse(response);
  }

  async startRun(
    dataMartId: string,
    config?: DataQualityConfig | EffectiveDataQualityConfig,
    requestConfig?: AxiosRequestConfig
  ): Promise<DataQualityRun> {
    const payload = config ? { config: toStoredConfig(config) } : {};
    const response = await this.post<RawRunResponse>(
      `/${dataMartId}/data-quality/runs`,
      payload,
      requestConfig
    );
    return normalizeRunResponse(response);
  }

  async getLatestRun(
    dataMartId: string,
    config?: AxiosRequestConfig
  ): Promise<DataQualityRun | null> {
    const response = await this.get<RawRunResponse | null>(
      `/${dataMartId}/data-quality/runs/latest`,
      undefined,
      config
    );
    return response ? normalizeRunResponse(response) : null;
  }

  async getRun(
    dataMartId: string,
    runId: string,
    config?: AxiosRequestConfig
  ): Promise<DataQualityRun> {
    const response = await dataMartService.getDataMartRunById(dataMartId, runId, config);
    if (!response.dataQuality) {
      throw new DataQualityRunDetailsMissingError(runId);
    }

    return normalizeRunResponse({
      id: response.id,
      dataMartRunId: response.id,
      summary: response.dataQuality.summary,
      snapshot: response.dataQuality.snapshot,
      results: response.dataQuality.results,
      createdAt: response.createdAt,
      startedAt: response.startedAt,
      finishedAt: response.finishedAt,
    });
  }
}

function toStoredConfig(config: DataQualityConfig | EffectiveDataQualityConfig): DataQualityConfig {
  if (config.rules.some(rule => 'isApplicable' in rule)) {
    return toStoredDataQualityConfig(config as EffectiveDataQualityConfig);
  }
  return {
    timezone: config.timezone,
    rules: config.rules.map(rule => ({
      key: rule.key,
      category: rule.category,
      scope: { ...rule.scope },
      severity: rule.severity,
      enabled: rule.enabled,
      parameters: { ...rule.parameters },
    })),
  };
}

function normalizeConfigResponse(
  response: RawDataQualityConfigResponse
): DataQualityConfigResponse {
  return {
    savedConfig: response.savedConfig,
    effectiveConfig: response.effectiveConfig,
    source: response.source ?? (response.savedConfig === null ? 'DEFAULT' : 'SAVED'),
    permissions: {
      canEdit: response.permissions?.canEdit ?? response.canEdit ?? false,
      canRun: response.permissions?.canRun ?? response.canRun ?? false,
    },
    runEligibility: response.runEligibility ?? {
      eligible: false,
      code: null,
      activeRunId: null,
    },
    availableChecks: response.availableChecks ?? [],
    relationships: response.relationships ?? [],
  };
}

function normalizeRunResponse(rawResponse: RawRunResponse): DataQualityRun {
  const response = rawResponse.run ?? rawResponse;
  const publicRunId = response.dataMartRunId ?? response.runId ?? response.id;
  if (!publicRunId) {
    throw new Error('Data Quality run response is missing runId');
  }
  const summary = normalizeSummary(response.summary);
  return {
    id: publicRunId,
    dataMartRunId: publicRunId,
    ...(response.snapshot ? { snapshot: response.snapshot } : {}),
    summary,
    results: response.results ?? [],
    createdAt: normalizeRunTimestamp(response.createdAt),
    startedAt: normalizeRunTimestamp(response.startedAt),
    finishedAt: normalizeRunTimestamp(response.finishedAt),
  };
}

function normalizeRunTimestamp(value: string | Date | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

function normalizeSummary(summary: Partial<DataQualitySummary> | undefined): DataQualitySummary {
  return {
    state: summary?.state ?? 'QUEUED',
    enabledChecks: summary?.enabledChecks ?? 0,
    totalChecks: summary?.totalChecks ?? 0,
    passedChecks: summary?.passedChecks ?? 0,
    failedChecks: summary?.failedChecks ?? 0,
    notApplicableChecks: summary?.notApplicableChecks ?? 0,
    errorChecks: summary?.errorChecks ?? 0,
    noticeFindings: summary?.noticeFindings ?? 0,
    warningFindings: summary?.warningFindings ?? 0,
    errorFindings: summary?.errorFindings ?? 0,
    violationCount: summary?.violationCount ?? 0,
    highestSeverity: summary?.highestSeverity ?? null,
  };
}

export const dataQualityService = new DataQualityService();
