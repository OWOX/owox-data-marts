// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataQualityService } from '../api/data-quality.service';
import {
  dataQualityQueryKeys,
  useDataQualityRun,
  useDataQualityWorkspace,
} from './use-data-quality-workspace';
import type { DataQualityConfigResponse, DataQualityRun } from './types';

vi.mock('../api/data-quality.service', () => ({
  dataQualityService: {
    getConfig: vi.fn(),
    getLatestRun: vi.fn(),
    getRun: vi.fn(),
    replaceConfig: vi.fn(),
    startRun: vi.fn(),
    cancelRun: vi.fn(),
  },
}));

const configResponse: DataQualityConfigResponse = {
  savedConfig: null,
  effectiveConfig: { timezone: 'UTC', rules: [] },
  source: 'DEFAULT',
  permissions: { canEdit: true, canRun: true },
  runEligibility: { eligible: true, code: null, activeRunId: null },
  availableChecks: [],
  relationships: [],
};

describe('useDataQualityWorkspace', () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(dataQualityService.getConfig).mockResolvedValue(configResponse);
    vi.mocked(dataQualityService.getLatestRun).mockResolvedValue(null);
    vi.mocked(dataQualityService.getRun).mockResolvedValue(buildRun('RUNNING'));
    vi.mocked(dataQualityService.replaceConfig).mockResolvedValue(configResponse);
    vi.mocked(dataQualityService.startRun).mockResolvedValue(buildRun('RUNNING'));
    vi.mocked(dataQualityService.cancelRun).mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  it('scopes every query key by project and Data Mart', async () => {
    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(client.getQueryData(dataQualityQueryKeys.config('project-1', 'mart-1'))).toEqual(
      configResponse
    );
    expect(client.getQueryData(dataQualityQueryKeys.latest('project-1', 'mart-1'))).toBeNull();
    expect(dataQualityService.getConfig).toHaveBeenCalledWith(
      'mart-1',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        skipLoadingIndicator: true,
        skipErrorToast: true,
      })
    );
    expect(dataQualityService.getLatestRun).toHaveBeenCalledWith(
      'mart-1',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        skipLoadingIndicator: true,
        skipErrorToast: true,
      })
    );
  });

  it('invalidates config and latest run after atomic Save & Run', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startRun({ timezone: 'UTC', rules: [] });
    });

    expect(dataQualityService.startRun).toHaveBeenCalledWith('mart-1', {
      timezone: 'UTC',
      rules: [],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dataQualityQueryKeys.config('project-1', 'mart-1'),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dataQualityQueryKeys.latest('project-1', 'mart-1'),
    });
  });

  it('cancels the active shared Data Mart run and refreshes its latest state', async () => {
    vi.mocked(dataQualityService.getLatestRun).mockResolvedValue(buildRun('RUNNING'));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.latestRun?.summary.state).toBe('RUNNING');
    });

    await act(async () => {
      await result.current.cancelRun();
    });

    expect(dataQualityService.cancelRun).toHaveBeenCalledWith('mart-1', 'run-1');
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dataQualityQueryKeys.latest('project-1', 'mart-1'),
    });
  });

  it('uses latest as the single polling source for the workspace', async () => {
    vi.mocked(dataQualityService.getLatestRun).mockResolvedValue(buildRun('RUNNING'));

    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.latestRun?.summary.state).toBe('RUNNING');
    });
    expect(dataQualityService.getRun).not.toHaveBeenCalled();
  });

  it('loads terminal run details once for result cards and SQL', async () => {
    vi.mocked(dataQualityService.getLatestRun).mockResolvedValue(buildRun('PASSED'));
    vi.mocked(dataQualityService.getRun).mockResolvedValue({
      ...buildRun('PASSED'),
      results: [
        {
          id: 'result-1',
          ruleKey: 'empty_table:data_mart',
          category: 'empty_table',
          scope: { type: 'DATA_MART' },
          severity: 'error',
          status: 'PASSED',
          violationCount: 0,
          description: 'Table is not empty',
          examples: [],
          executedSql: ['SELECT COUNT(*) FROM source'],
          reproductionSql: 'SELECT * FROM source',
          error: null,
          redacted: false,
        },
      ],
    });

    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.latestRun?.results).toHaveLength(1);
    });
    expect(dataQualityService.getRun).toHaveBeenCalledTimes(1);
    expect(dataQualityService.getRun).toHaveBeenCalledWith(
      'mart-1',
      'run-1',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        skipLoadingIndicator: true,
        skipErrorToast: true,
      })
    );
  });

  it('polls the selected exact run while active and stops after it becomes terminal', async () => {
    vi.useFakeTimers();
    vi.mocked(dataQualityService.getRun)
      .mockResolvedValueOnce(buildRun('RUNNING', 'run-active'))
      .mockResolvedValue(buildRun('PASSED', 'run-active'));
    const { result } = renderHook(() => useDataQualityRun('project-1', 'mart-1', 'run-active'), {
      wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.data?.summary.state).toBe('RUNNING');
    });
    expect(dataQualityService.getRun).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await vi.waitFor(() => {
      expect(result.current.data?.summary.state).toBe('PASSED');
    });
    expect(dataQualityService.getRun).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(dataQualityService.getRun).toHaveBeenCalledTimes(2);
  });

  it('keeps exact-run cache and results isolated by project, Data Mart, and run id', async () => {
    vi.mocked(dataQualityService.getRun).mockImplementation(async (_dataMartId, runId) =>
      buildRun('PASSED', runId)
    );
    const { result } = renderHook(
      () => ({
        first: useDataQualityRun('project-1', 'mart-1', 'run-first'),
        second: useDataQualityRun('project-2', 'mart-2', 'run-second'),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.first.data?.id).toBe('run-first');
      expect(result.current.second.data?.id).toBe('run-second');
    });
    expect(
      client.getQueryData(dataQualityQueryKeys.run('project-1', 'mart-1', 'run-first'))
    ).toEqual(expect.objectContaining({ id: 'run-first' }));
    expect(
      client.getQueryData(dataQualityQueryKeys.run('project-2', 'mart-2', 'run-second'))
    ).toEqual(expect.objectContaining({ id: 'run-second' }));
  });
});

function buildRun(state: 'RUNNING' | 'PASSED', runId = 'run-1'): DataQualityRun {
  return {
    id: runId,
    dataMartRunId: runId,
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
    startedAt: '2026-07-15T12:00:00.000Z',
    finishedAt: null,
  };
}
