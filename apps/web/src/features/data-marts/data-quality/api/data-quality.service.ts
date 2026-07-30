import type { AxiosRequestConfig } from '../../../../app/api/apiClient';
import { ApiService } from '../../../../services';
import { dataMartService } from '../../shared';
import { toStoredDataQualityConfig } from '../model/data-quality.model';
import { DataQualityRunDetailsMissingError } from '../model/types';
import type {
  DataQualityCompactSummary,
  DataQualityConfig,
  DataQualityConfigResponse,
  DataQualityRun,
  DataQualitySummary,
  EffectiveDataQualityConfig,
  RunDataQualityRequest,
  RunDataQualityResponse,
} from '../model/types';

interface DataQualityConfigResponseDto {
  savedConfig: DataQualityConfig | null;
  effectiveConfig: EffectiveDataQualityConfig;
  configRevision: string;
  source: 'DEFAULT' | 'SAVED';
  canEdit: boolean;
  canRun: boolean;
  runEligibility: DataQualityConfigResponse['runEligibility'];
  relationships: DataQualityConfigResponse['relationships'];
}

interface LatestDataQualityRunResponseDto {
  runId: string;
  summary: DataQualitySummary;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

interface DataQualitySummaryItemDto {
  dataMartId: string;
  summary: DataQualityCompactSummary;
}

class DataQualityService extends ApiService {
  constructor() {
    super('/data-marts');
  }

  async getConfig(
    dataMartId: string,
    config?: AxiosRequestConfig
  ): Promise<DataQualityConfigResponse> {
    const response = await this.get<unknown>(
      `/${dataMartId}/data-quality/config`,
      undefined,
      config
    );
    return toConfigResponse(response);
  }

  async replaceConfig(
    dataMartId: string,
    config: DataQualityConfig | EffectiveDataQualityConfig,
    requestConfig?: AxiosRequestConfig
  ): Promise<DataQualityConfigResponse> {
    const storedConfig = toStoredConfig(config);
    const response = await this.put<unknown>(
      `/${dataMartId}/data-quality/config`,
      storedConfig,
      requestConfig
    );
    return toConfigResponse(response);
  }

  async startRun(
    dataMartId: string,
    request: RunDataQualityRequest = {},
    requestConfig?: AxiosRequestConfig
  ): Promise<RunDataQualityResponse> {
    const response = await this.post<unknown>(
      `/${dataMartId}/data-quality/runs`,
      request,
      requestConfig
    );
    return toRunDataQualityResponse(response);
  }

  async getLatestRun(
    dataMartId: string,
    config?: AxiosRequestConfig
  ): Promise<DataQualityRun | null> {
    const response = await this.get<LatestDataQualityRunResponseDto | null>(
      `/${dataMartId}/data-quality/runs/latest`,
      undefined,
      config
    );
    return response ? { ...response, results: [] } : null;
  }

  async getSummaries(
    dataMartIds: string[],
    config?: AxiosRequestConfig
  ): Promise<Partial<Record<string, DataQualityCompactSummary>>> {
    if (dataMartIds.length === 0) return {};

    const response = await this.post<unknown>('/data-quality/summaries', { dataMartIds }, config);
    return toSummariesResponse(response);
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

    return {
      runId: response.id,
      summary: response.dataQuality.summary,
      snapshot: response.dataQuality.snapshot,
      results: response.dataQuality.results,
      createdAt: response.createdAt,
      startedAt: response.startedAt,
      finishedAt: response.finishedAt,
    };
  }

  async cancelRun(dataMartId: string, runId: string): Promise<void> {
    await dataMartService.cancelDataMartRun(dataMartId, runId);
  }
}

function toStoredConfig(config: DataQualityConfig | EffectiveDataQualityConfig): DataQualityConfig {
  if (config.rules.some(rule => 'isApplicable' in rule)) {
    return toStoredDataQualityConfig(config as EffectiveDataQualityConfig);
  }
  return {
    rules: config.rules.map(rule => ({
      key: rule.key,
      category: rule.category,
      scope:
        rule.scope.type === 'FIELD'
          ? { type: rule.scope.type, fieldPath: [...rule.scope.fieldPath] }
          : { ...rule.scope },
      severity: rule.severity,
      enabled: rule.enabled,
      parameters: { ...rule.parameters },
    })),
  };
}

function toConfigResponse(response: unknown): DataQualityConfigResponse {
  if (
    !isRecord(response) ||
    typeof response.configRevision !== 'string' ||
    !/^[0-9a-f]{64}$/.test(response.configRevision)
  ) {
    throw new Error('Data Quality config response has an invalid configRevision');
  }
  if (
    (response.savedConfig !== null && !isRecord(response.savedConfig)) ||
    !isEffectiveConfig(response.effectiveConfig) ||
    (response.source !== 'DEFAULT' && response.source !== 'SAVED') ||
    typeof response.canEdit !== 'boolean' ||
    typeof response.canRun !== 'boolean' ||
    !isRunEligibility(response.runEligibility) ||
    !Array.isArray(response.relationships)
  ) {
    throw new Error('Data Quality config response has an invalid shape');
  }
  const typedResponse = response as unknown as DataQualityConfigResponseDto;
  return {
    savedConfig: typedResponse.savedConfig,
    effectiveConfig: typedResponse.effectiveConfig,
    configRevision: typedResponse.configRevision,
    source: typedResponse.source,
    permissions: {
      canEdit: typedResponse.canEdit,
      canRun: typedResponse.canRun,
    },
    runEligibility: typedResponse.runEligibility,
    relationships: typedResponse.relationships,
  };
}

function toRunDataQualityResponse(response: unknown): RunDataQualityResponse {
  if (
    !isRecord(response) ||
    typeof response.runId !== 'string' ||
    Object.keys(response).some(key => key !== 'runId')
  ) {
    throw new Error('Data Quality run response is missing runId');
  }
  return { runId: response.runId };
}

function toSummariesResponse(
  response: unknown
): Partial<Record<string, DataQualityCompactSummary>> {
  if (!isRecord(response) || !Array.isArray(response.items)) {
    throw new Error('Data Quality summaries response has an invalid shape');
  }

  const summaries: Record<string, DataQualityCompactSummary> = {};
  for (const item of response.items) {
    if (!isDataQualitySummaryItem(item)) {
      throw new Error('Data Quality summaries response has an invalid shape');
    }
    summaries[item.dataMartId] = item.summary;
  }
  return summaries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDataQualitySummaryItem(value: unknown): value is DataQualitySummaryItemDto {
  return (
    isRecord(value) &&
    typeof value.dataMartId === 'string' &&
    isDataQualityCompactSummary(value.summary)
  );
}

function isDataQualityCompactSummary(value: unknown): value is DataQualityCompactSummary {
  if (!isRecord(value)) return false;

  return (
    isDataQualitySummaryState(value.state) &&
    isNonNegativeNumber(value.enabledChecks) &&
    isNonNegativeNumber(value.totalChecks) &&
    isNonNegativeNumber(value.passedChecks) &&
    isNonNegativeNumber(value.failedChecks) &&
    isNonNegativeNumber(value.notApplicableChecks) &&
    isNonNegativeNumber(value.errorChecks) &&
    isNonNegativeNumber(value.noticeFindings) &&
    isNonNegativeNumber(value.warningFindings) &&
    isNonNegativeNumber(value.errorFindings) &&
    isNonNegativeNumber(value.violationCount) &&
    (value.highestSeverity === null ||
      value.highestSeverity === 'error' ||
      value.highestSeverity === 'warning' ||
      value.highestSeverity === 'notice') &&
    (value.dataMartRunId === null || typeof value.dataMartRunId === 'string') &&
    (value.lastRunAt === null || typeof value.lastRunAt === 'string')
  );
}

function isDataQualitySummaryState(value: unknown): value is DataQualityCompactSummary['state'] {
  return (
    value === 'NEVER_RUN' ||
    value === 'QUEUED' ||
    value === 'RUNNING' ||
    value === 'PASSED' ||
    value === 'ISSUES' ||
    value === 'EXECUTION_FAILED' ||
    value === 'CANCELLED' ||
    value === 'ALL_DISABLED'
  );
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isEffectiveConfig(value: unknown): value is EffectiveDataQualityConfig {
  return isRecord(value) && Array.isArray(value.rules);
}

function isRunEligibility(value: unknown): value is DataQualityConfigResponse['runEligibility'] {
  return (
    isRecord(value) &&
    typeof value.eligible === 'boolean' &&
    (value.code === null || typeof value.code === 'string') &&
    (value.activeRunId === null || typeof value.activeRunId === 'string')
  );
}

export const dataQualityService = new DataQualityService();
