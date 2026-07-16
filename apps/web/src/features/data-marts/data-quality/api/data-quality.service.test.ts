import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../../app/api/apiClient';
import { DataQualityService } from './data-quality.service';
import type { DataQualityConfig, EffectiveDataQualityConfig } from '../model/types';

vi.mock('../../../../app/api/apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const effectiveConfig: EffectiveDataQualityConfig = {
  timezone: 'UTC',
  rules: [
    {
      key: 'null_rate:field:email',
      category: 'null_rate',
      scope: { type: 'FIELD', fieldId: 'email' },
      severity: 'warning',
      enabled: true,
      parameters: { thresholdPercent: 2 },
      isApplicable: true,
    },
  ],
};

describe('DataQualityService', () => {
  const service = new DataQualityService();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('normalizes config permissions and derives the DEFAULT source', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        savedConfig: null,
        effectiveConfig,
        availableChecks: ['empty_table', 'type_mismatch'],
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
      source: 'DEFAULT',
      permissions: { canEdit: true, canRun: false },
      runEligibility: { eligible: false, code: 'NOT_PUBLISHED', activeRunId: null },
      availableChecks: ['empty_table', 'type_mismatch'],
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

  it('defaults relationship display metadata for older config responses', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        savedConfig: null,
        effectiveConfig,
        availableChecks: [],
      },
    });

    await expect(service.getConfig('mart-1')).resolves.toMatchObject({ relationships: [] });
  });

  it('sends only the unversioned stored config on save', async () => {
    const config = effectiveConfig as unknown as DataQualityConfig;
    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: {
        savedConfig: config,
        effectiveConfig,
        source: 'SAVED',
        availableChecks: ['empty_table'],
        canEdit: true,
        canRun: true,
        runEligibility: { eligible: true, code: null, activeRunId: null },
      },
    });

    await service.replaceConfig('mart-1', config);

    expect(apiClient.put).toHaveBeenCalledWith(
      '/data-marts/mart-1/data-quality/config',
      {
        timezone: 'UTC',
        rules: [
          {
            key: 'null_rate:field:email',
            category: 'null_rate',
            scope: { type: 'FIELD', fieldId: 'email' },
            severity: 'warning',
            enabled: true,
            parameters: { thresholdPercent: 2 },
          },
        ],
      },
      undefined
    );
  });

  it('uses an empty payload for Run and a plain config for atomic Save & Run', async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: buildRunResponse('QUEUED') })
      .mockResolvedValueOnce({ data: { run: buildRunResponse('QUEUED') } });

    const run = await service.startRun('mart-1');
    const atomicRun = await service.startRun(
      'mart-1',
      effectiveConfig as unknown as DataQualityConfig
    );

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/data-marts/mart-1/data-quality/runs',
      {},
      undefined
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/data-marts/mart-1/data-quality/runs',
      {
        config: expect.objectContaining({ timezone: 'UTC' }),
      },
      undefined
    );
    expect(run).toMatchObject({ id: 'run-1', dataMartRunId: 'run-1' });
    expect(atomicRun).toMatchObject({ id: 'run-1', dataMartRunId: 'run-1' });
  });

  it('maps a 204-like latest response to never run', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: null });

    await expect(service.getLatestRun('mart-1')).resolves.toBeNull();
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
      id: 'run-1',
      dataMartRunId: 'run-1',
      snapshot: expect.objectContaining({ timezone: 'UTC', definitionType: 'SQL' }),
      summary: expect.objectContaining({ state: 'ISSUES', violationCount: 2 }),
      results: [expect.objectContaining({ id: 'result-run-1', description: 'Older run result' })],
    });
    expect(run.results[0]).not.toHaveProperty('dataQualityRunId');
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

function buildRunResponse(state: string) {
  return {
    id: 'quality-internal-1',
    dataMartRunId: 'run-1',
    summary: {
      state,
      enabledChecks: 1,
      totalChecks: 1,
      passedChecks: 0,
      failedChecks: 0,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 0,
      errorFindings: 0,
      violationCount: 0,
      highestSeverity: null,
    },
    results: [],
    createdAt: '2026-07-15T12:00:00.000Z',
    startedAt: null,
    finishedAt: null,
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
        timezone: 'UTC',
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
          ruleKey: 'negative_values:field:amount',
          category: 'negative_values',
          scope: { type: 'FIELD', fieldId: 'amount' },
          severity: 'warning',
          status: 'FAILED',
          violationCount: 2,
          description,
          examples: [],
          executedSql: ['SELECT amount FROM source WHERE amount < 0'],
          reproductionSql: 'SELECT * FROM source WHERE amount < 0',
          error: null,
          redacted: false,
          createdAt: '2026-07-15T12:00:10.000Z',
        },
      ],
    },
  };
}
