import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../../app/api/apiClient';
import { dataQualityService } from './data-quality.service';
import type { DataQualityConfig, EffectiveDataQualityConfig } from '../model/types';

vi.mock('../../../../app/api/apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const effectiveConfig: EffectiveDataQualityConfig = {
  rules: [
    {
      key: 'null_rate:field:["email"]',
      category: 'null_rate',
      scope: { type: 'FIELD', fieldPath: ['email'] },
      severity: 'warning',
      enabled: true,
      parameters: { thresholdPercent: 2 },
      isApplicable: true,
    },
  ],
};
const configRevision = 'a'.repeat(64);

describe('DataQualityService', () => {
  const service = dataQualityService;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('normalizes config permissions and derives the DEFAULT source', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        savedConfig: null,
        effectiveConfig,
        configRevision,
        source: 'DEFAULT',
        relationships: [
          {
            id: 'rel-1',
            targetAlias: 'orders',
            joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
          },
        ],
        canEdit: true,
        canRun: false,
        runEligibility: { eligible: false, code: 'NOT_PUBLISHED', activeRunId: null },
      },
    });

    await expect(service.getConfig('mart-1')).resolves.toEqual({
      savedConfig: null,
      effectiveConfig,
      configRevision,
      source: 'DEFAULT',
      permissions: { canEdit: true, canRun: false },
      runEligibility: { eligible: false, code: 'NOT_PUBLISHED', activeRunId: null },
      relationships: [
        {
          id: 'rel-1',
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
        },
      ],
    });
    expect(apiClient.get).toHaveBeenCalledWith('/data-marts/mart-1/data-quality/config', {
      params: undefined,
    });
  });

  it('rejects a malformed current config response', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        savedConfig: null,
        effectiveConfig,
        configRevision,
        source: 'DEFAULT',
        canEdit: true,
        canRun: true,
        runEligibility: { eligible: 'yes', code: null, activeRunId: null },
        relationships: [],
      },
    });

    await expect(service.getConfig('mart-1')).rejects.toThrow(
      'Data Quality config response has an invalid shape'
    );
  });

  it('sends only the stored config on save', async () => {
    const config = effectiveConfig as unknown as DataQualityConfig;
    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: {
        savedConfig: config,
        effectiveConfig,
        configRevision,
        source: 'SAVED',
        relationships: [],
        canEdit: true,
        canRun: true,
        runEligibility: { eligible: true, code: null, activeRunId: null },
      },
    });

    await service.replaceConfig('mart-1', config);

    expect(apiClient.put).toHaveBeenCalledWith(
      '/data-marts/mart-1/data-quality/config',
      {
        rules: [
          {
            key: 'null_rate:field:["email"]',
            category: 'null_rate',
            scope: { type: 'FIELD', fieldPath: ['email'] },
            severity: 'warning',
            enabled: true,
            parameters: { thresholdPercent: 2 },
          },
        ],
      },
      undefined
    );
  });

  it('starts a normal Run with no config revision', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { runId: 'run-1' } });

    const run = await service.startRun('mart-1');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/data-marts/mart-1/data-quality/runs',
      {},
      undefined
    );
    expect(run).toEqual({ runId: 'run-1' });
  });

  it('starts a revision-bound Run with only the supplied config revision', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { runId: 'run-1' } });

    await expect(service.startRun('mart-1', { configRevision })).resolves.toEqual({
      runId: 'run-1',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/data-marts/mart-1/data-quality/runs',
      { configRevision },
      undefined
    );
  });

  it('maps a 204-like latest response to never run', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: null });

    await expect(service.getLatestRun('mart-1')).resolves.toBeNull();
  });

  it('loads compact summaries for multiple Data Marts through the batch endpoint', async () => {
    const summary = compactSummary('RUNNING');
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        items: [{ dataMartId: 'mart-2', summary }],
      },
    });

    await expect(service.getSummaries(['mart-2', 'mart-1'])).resolves.toEqual({
      'mart-2': summary,
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/data-marts/data-quality/summaries',
      { dataMartIds: ['mart-2', 'mart-1'] },
      undefined
    );
  });

  it('rejects malformed compact summary responses at the API boundary', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        items: [{ dataMartId: 'mart-1', summary: { state: 'RUNNING' } }],
      },
    });

    await expect(service.getSummaries(['mart-1'])).rejects.toThrow(
      'Data Quality summaries response has an invalid shape'
    );
  });

  it('cancels a Data Quality run through the shared Data Mart run endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

    await service.cancelRun('mart-1', 'run-1');

    expect(apiClient.post).toHaveBeenCalledWith('/data-marts/mart-1/runs/run-1/cancel', undefined, {
      skipErrorToast: true,
    });
  });

  it('loads and normalizes an embedded Quality detail through the generic run route', async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: buildGenericRunResponse('run-1', 'Older run result'),
    });

    const run = await service.getRun('mart-1', 'run-1', { signal });

    expect(apiClient.get).toHaveBeenCalledWith('/data-marts/mart-1/runs/run-1', {
      signal,
      params: undefined,
    });
    expect(run).toMatchObject({
      runId: 'run-1',
      snapshot: expect.objectContaining({ definitionType: 'SQL' }),
      summary: expect.objectContaining({ state: 'ISSUES', violationCount: 2 }),
      results: [expect.objectContaining({ id: 'result-run-1', description: 'Older run result' })],
    });
  });

  it('throws a typed UI error when a Quality run has no embedded detail', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        ...buildGenericRunResponse('run-1', 'Unused result'),
        dataQuality: null,
      },
    });

    await expect(service.getRun('mart-1', 'run-1')).rejects.toMatchObject({
      name: 'DataQualityRunDetailsMissingError',
      code: 'DATA_QUALITY_DETAILS_MISSING',
      runId: 'run-1',
    });
  });
});

function compactSummary(state: 'RUNNING' | 'PASSED') {
  return {
    state,
    enabledChecks: 1,
    totalChecks: 1,
    passedChecks: state === 'PASSED' ? 1 : 0,
    failedChecks: 0,
    notApplicableChecks: 0,
    errorChecks: 0,
    noticeFindings: 0,
    warningFindings: 0,
    errorFindings: 0,
    violationCount: 0,
    highestSeverity: null,
    dataMartRunId: 'run-1',
    lastRunAt: '2026-07-16T10:00:00.000Z',
  };
}

function buildGenericRunResponse(runId: string, description: string) {
  return {
    id: runId,
    dataMartId: 'mart-1',
    type: 'DATA_QUALITY',
    createdAt: '2026-07-15T12:00:00.000Z',
    startedAt: '2026-07-15T12:00:01.000Z',
    finishedAt: '2026-07-15T12:00:10.000Z',
    dataQuality: {
      snapshot: {
        config: effectiveConfig,
        schema: { fields: [] },
        relationships: [],
        definitionType: 'SQL',
      },
      summary: {
        state: 'ISSUES',
        enabledChecks: 1,
        totalChecks: 1,
        passedChecks: 0,
        failedChecks: 1,
        notApplicableChecks: 0,
        errorChecks: 0,
        noticeFindings: 0,
        warningFindings: 1,
        errorFindings: 0,
        violationCount: 2,
        highestSeverity: 'warning',
      },
      results: [
        {
          id: `result-${runId}`,
          ruleKey: 'negative_values:field:["amount"]',
          category: 'negative_values',
          scope: { type: 'FIELD', fieldPath: ['amount'] },
          severity: 'warning',
          status: 'FAILED',
          violationCount: 2,
          description,
          examples: [],
          sql: 'SELECT * FROM source WHERE amount < 0',
          error: null,
          redacted: false,
          createdAt: '2026-07-15T12:00:10.000Z',
        },
      ],
    },
  };
}
