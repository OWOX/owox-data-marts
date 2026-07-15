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
    });
    expect(apiClient.get).toHaveBeenCalledWith('/data-marts/mart-1/data-quality/config', {
      params: undefined,
    });
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

    await service.startRun('mart-1');
    await service.startRun('mart-1', effectiveConfig as unknown as DataQualityConfig);

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
  });

  it('maps a 204-like latest response to never run', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: null });

    await expect(service.getLatestRun('mart-1')).resolves.toBeNull();
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
