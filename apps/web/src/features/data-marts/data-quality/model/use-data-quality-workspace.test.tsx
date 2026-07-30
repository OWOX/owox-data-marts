// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataQualityService } from '../api/data-quality.service';
import {
  dataQualityQueryKeys,
  useDataQualitySummaries,
  useDataQualitySummary,
  useDataQualityRun,
  useDataQualityWorkspace,
} from './use-data-quality-workspace';
import type { DataQualityConfigResponse, DataQualityRun } from './types';

vi.mock('../api/data-quality.service', () => ({
  dataQualityService: {
    getConfig: vi.fn(),
    getLatestRun: vi.fn(),
    getSummaries: vi.fn(),
    getRun: vi.fn(),
    replaceConfig: vi.fn(),
    startRun: vi.fn(),
    cancelRun: vi.fn(),
  },
}));

const configResponse: DataQualityConfigResponse = {
  savedConfig: null,
  effectiveConfig: { rules: [] },
  configRevision: 'a'.repeat(64),
  source: 'DEFAULT',
  permissions: { canEdit: true, canRun: true },
  runEligibility: { eligible: true, code: null, activeRunId: null },
  relationships: [],
};

describe('useDataQualityWorkspace', () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(dataQualityService.getConfig).mockResolvedValue(configResponse);
    vi.mocked(dataQualityService.getLatestRun).mockResolvedValue(null);
    vi.mocked(dataQualityService.getSummaries).mockResolvedValue({});
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

  it('loads a compact summary independently from the Data Mart response', async () => {
    const summary = {
      ...buildRun('PASSED').summary,
      dataMartRunId: 'run-1',
      lastRunAt: '2026-07-15T12:00:02.000Z',
    };
    vi.mocked(dataQualityService.getSummaries).mockResolvedValueOnce({ 'mart-1': summary });

    const { result } = renderHook(() => useDataQualitySummary('project-1', 'mart-1'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(summary);
    });
    expect(dataQualityService.getSummaries).toHaveBeenCalledWith(
      ['mart-1'],
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        skipLoadingIndicator: true,
        skipErrorToast: true,
      })
    );
  });

  it('loads summaries only for the supplied Data Marts using a stable unique id set', async () => {
    const mart1Summary = {
      ...buildRun('PASSED').summary,
      dataMartRunId: 'run-1',
      lastRunAt: '2026-07-15T12:00:02.000Z',
    };
    const mart2Summary = {
      ...buildRun('PASSED', 'run-2').summary,
      dataMartRunId: 'run-2',
      lastRunAt: '2026-07-15T12:00:03.000Z',
    };
    vi.mocked(dataQualityService.getSummaries).mockResolvedValueOnce({
      'mart-1': mart1Summary,
      'mart-2': mart2Summary,
    });

    const { result, rerender } = renderHook(
      ({ dataMartIds }) => useDataQualitySummaries('project-1', dataMartIds),
      {
        initialProps: { dataMartIds: ['mart-2', 'mart-1', 'mart-2'] },
        wrapper,
      }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({
        'mart-1': mart1Summary,
        'mart-2': mart2Summary,
      });
    });
    expect(dataQualityService.getSummaries).toHaveBeenCalledWith(
      ['mart-1', 'mart-2'],
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        skipLoadingIndicator: true,
        skipErrorToast: true,
      })
    );

    rerender({ dataMartIds: ['mart-1', 'mart-2'] });
    expect(dataQualityService.getSummaries).toHaveBeenCalledTimes(1);
  });

  it('accepts a partial batch response when one requested Data Mart is no longer visible', async () => {
    const summary = {
      ...buildRun('PASSED').summary,
      dataMartRunId: 'run-1',
      lastRunAt: '2026-07-15T12:00:02.000Z',
    };
    vi.mocked(dataQualityService.getSummaries).mockResolvedValueOnce({ 'mart-1': summary });

    const { result } = renderHook(
      () => useDataQualitySummaries('project-1', ['mart-1', 'mart-2']),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ 'mart-1': summary });
    });
    expect(result.current.error).toBeNull();
  });

  it('cancels an obsolete summary request when the visible Data Mart set changes', async () => {
    let obsoleteSignal: { readonly aborted: boolean } | undefined;
    vi.mocked(dataQualityService.getSummaries)
      .mockImplementationOnce((_dataMartIds, config) => {
        obsoleteSignal = config?.signal;
        return new Promise(() => undefined);
      })
      .mockResolvedValueOnce({
        'mart-2': {
          ...buildRun('PASSED', 'run-2').summary,
          dataMartRunId: 'run-2',
          lastRunAt: '2026-07-15T12:00:03.000Z',
        },
      });

    const { result, rerender } = renderHook(
      ({ dataMartIds }) => useDataQualitySummaries('project-1', dataMartIds),
      {
        initialProps: { dataMartIds: ['mart-1'] },
        wrapper,
      }
    );
    await waitFor(() => {
      expect(dataQualityService.getSummaries).toHaveBeenCalledTimes(1);
    });

    rerender({ dataMartIds: ['mart-2'] });

    await waitFor(() => {
      expect(result.current.data).toEqual(
        expect.objectContaining({
          'mart-2': expect.objectContaining({ state: 'PASSED' }),
        })
      );
    });
    expect(obsoleteSignal?.aborted).toBe(true);
  });

  it('polls the supplied summaries while one is active and stops at terminal state', async () => {
    vi.useFakeTimers();
    vi.mocked(dataQualityService.getSummaries)
      .mockResolvedValueOnce({
        'mart-1': {
          ...buildRun('RUNNING').summary,
          dataMartRunId: 'run-1',
          lastRunAt: '2026-07-15T12:00:02.000Z',
        },
      })
      .mockResolvedValue({
        'mart-1': {
          ...buildRun('PASSED').summary,
          dataMartRunId: 'run-1',
          lastRunAt: '2026-07-15T12:00:04.000Z',
        },
      });

    const { result } = renderHook(() => useDataQualitySummaries('project-1', ['mart-1']), {
      wrapper,
    });
    await vi.waitFor(() => {
      expect(result.current.data?.['mart-1']?.state).toBe('RUNNING');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await vi.waitFor(() => {
      expect(result.current.data?.['mart-1']?.state).toBe('PASSED');
    });
    expect(dataQualityService.getSummaries).toHaveBeenCalledTimes(2);
    expect(dataQualityService.getSummaries).toHaveBeenLastCalledWith(
      ['mart-1'],
      expect.any(Object)
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(dataQualityService.getSummaries).toHaveBeenCalledTimes(2);
  });

  it('invalidates config and latest run after a config-free Run', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startRun();
    });

    expect(dataQualityService.startRun).toHaveBeenCalledWith('mart-1');
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dataQualityQueryKeys.config('project-1', 'mart-1'),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dataQualityQueryKeys.latest('project-1', 'mart-1'),
    });
  });

  it('passes a supplied config revision to a revision-bound Run', async () => {
    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startRun(configResponse.configRevision);
    });

    expect(dataQualityService.startRun).toHaveBeenCalledWith('mart-1', {
      configRevision: configResponse.configRevision,
    });
  });

  it('cancels the active shared Data Mart run and refreshes its latest state', async () => {
    vi.mocked(dataQualityService.getLatestRun).mockResolvedValue(buildRun('RUNNING'));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.activeRun?.summary.state).toBe('RUNNING');
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
      expect(result.current.activeRun?.summary.state).toBe('RUNNING');
    });
    expect(result.current.latestRun).toBeNull();
    expect(dataQualityService.getRun).not.toHaveBeenCalled();
  });

  it('keeps the last terminal report while a newer run is active', async () => {
    const terminalRun = {
      ...buildRun('PASSED', 'run-terminal'),
      results: [
        {
          id: 'terminal-result',
          ruleKey: 'empty_table:data_mart',
          category: 'empty_table' as const,
          scope: { type: 'DATA_MART' as const },
          severity: 'error' as const,
          status: 'PASSED' as const,
          violationCount: 0,
          description: 'Table is not empty',
          examples: [],
          sql: 'SELECT 1',
          error: null,
          redacted: false,
        },
      ],
    };
    vi.mocked(dataQualityService.getLatestRun)
      .mockResolvedValueOnce(buildRun('PASSED', 'run-terminal'))
      .mockResolvedValue(buildRun('RUNNING', 'run-active'));
    vi.mocked(dataQualityService.getRun).mockResolvedValue(terminalRun);

    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.latestRun?.runId).toBe('run-terminal');
      expect(result.current.latestRun?.results).toHaveLength(1);
    });

    await act(async () => {
      await result.current.startRun();
    });

    await waitFor(() => {
      expect(result.current.activeRun?.runId).toBe('run-active');
    });
    expect(result.current.latestRun?.runId).toBe('run-terminal');
    expect(result.current.latestRun?.results).toHaveLength(1);
  });

  it('finishes loading the previous terminal report when a newer run starts', async () => {
    const terminalRun = {
      ...buildRun('PASSED', 'run-terminal'),
      results: [
        {
          id: 'terminal-result',
          ruleKey: 'empty_table:data_mart',
          category: 'empty_table' as const,
          scope: { type: 'DATA_MART' as const },
          severity: 'error' as const,
          status: 'PASSED' as const,
          violationCount: 0,
          description: 'Table is not empty',
          examples: [],
          sql: 'SELECT 1',
          error: null,
          redacted: false,
        },
      ],
    };
    const terminalDetails = deferred<DataQualityRun>();
    vi.mocked(dataQualityService.getLatestRun)
      .mockResolvedValueOnce(buildRun('PASSED', 'run-terminal'))
      .mockResolvedValue(buildRun('RUNNING', 'run-active'));
    vi.mocked(dataQualityService.getRun).mockReturnValue(terminalDetails.promise);

    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });
    await waitFor(() => {
      expect(dataQualityService.getRun).toHaveBeenCalledWith(
        'mart-1',
        'run-terminal',
        expect.any(Object)
      );
    });

    await act(async () => {
      await result.current.startRun();
    });
    await waitFor(() => {
      expect(result.current.activeRun?.runId).toBe('run-active');
    });

    await act(async () => {
      terminalDetails.resolve(terminalRun);
      await terminalDetails.promise;
    });

    await waitFor(() => {
      expect(result.current.latestRun?.runId).toBe('run-terminal');
      expect(result.current.latestRun?.results).toHaveLength(1);
    });
  });

  it('keeps the previous report visible while a newer terminal run detail is loading', async () => {
    const previousRun = {
      ...buildRun('PASSED', 'run-previous'),
      results: [buildResult('previous-result')],
    };
    const nextRunDetails = deferred<DataQualityRun>();
    vi.mocked(dataQualityService.getLatestRun).mockResolvedValue(
      buildRun('PASSED', 'run-previous')
    );
    vi.mocked(dataQualityService.getRun).mockImplementation((_dataMartId, runId) =>
      runId === 'run-previous' ? Promise.resolve(previousRun) : nextRunDetails.promise
    );

    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.latestRun?.runId).toBe('run-previous');
    });

    act(() => {
      client.setQueryData(
        dataQualityQueryKeys.latest('project-1', 'mart-1'),
        buildRun('PASSED', 'run-next')
      );
    });

    await waitFor(() => {
      expect(dataQualityService.getRun).toHaveBeenCalledWith(
        'mart-1',
        'run-next',
        expect.any(Object)
      );
      expect(result.current.isResultsLoading).toBe(true);
    });
    expect(result.current.latestRun?.runId).toBe('run-previous');
    expect(result.current.latestRunOverview?.runId).toBe('run-next');

    await act(async () => {
      nextRunDetails.resolve({
        ...buildRun('PASSED', 'run-next'),
        results: [buildResult('next-result')],
      });
      await nextRunDetails.promise;
    });

    await waitFor(() => {
      expect(result.current.latestRun?.runId).toBe('run-next');
    });
  });

  it('keeps the previous report visible when newer terminal details fail to load', async () => {
    const previousRun = {
      ...buildRun('PASSED', 'run-previous'),
      results: [buildResult('previous-result')],
    };
    vi.mocked(dataQualityService.getLatestRun).mockResolvedValue(
      buildRun('PASSED', 'run-previous')
    );
    vi.mocked(dataQualityService.getRun).mockImplementation((_dataMartId, runId) =>
      runId === 'run-previous'
        ? Promise.resolve(previousRun)
        : Promise.reject(new Error('detail unavailable'))
    );

    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.latestRun?.runId).toBe('run-previous');
    });

    act(() => {
      client.setQueryData(
        dataQualityQueryKeys.latest('project-1', 'mart-1'),
        buildRun('PASSED', 'run-next')
      );
    });

    await waitFor(() => {
      expect(result.current.resultsError).toEqual(new Error('detail unavailable'));
    });
    expect(result.current.latestRun?.runId).toBe('run-previous');
    expect(result.current.latestRunOverview?.runId).toBe('run-next');
  });

  it('refreshes run eligibility when the latest run becomes terminal', async () => {
    vi.useFakeTimers();
    const activeRunConfig: DataQualityConfigResponse = {
      ...configResponse,
      permissions: { canEdit: true, canRun: false },
      runEligibility: {
        eligible: false,
        code: 'ACTIVE_RUN',
        activeRunId: 'run-1',
      },
    };
    vi.mocked(dataQualityService.getConfig)
      .mockResolvedValueOnce(activeRunConfig)
      .mockResolvedValue(configResponse);
    vi.mocked(dataQualityService.getLatestRun)
      .mockResolvedValueOnce(buildRun('RUNNING'))
      .mockResolvedValue(buildRun('PASSED'));
    vi.mocked(dataQualityService.getRun).mockResolvedValue(buildRun('PASSED'));

    const { result } = renderHook(() => useDataQualityWorkspace('project-1', 'mart-1'), {
      wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.activeRun?.summary.state).toBe('RUNNING');
      expect(result.current.configResponse?.runEligibility.code).toBe('ACTIVE_RUN');
    });
    expect(dataQualityService.getConfig).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    await vi.waitFor(() => {
      expect(result.current.latestRun?.summary.state).toBe('PASSED');
      expect(result.current.configResponse?.runEligibility.eligible).toBe(true);
    });
    expect(dataQualityService.getConfig).toHaveBeenCalledTimes(2);
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
          sql: 'SELECT * FROM source',
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
      expect(result.current.first.data?.runId).toBe('run-first');
      expect(result.current.second.data?.runId).toBe('run-second');
    });
    expect(
      client.getQueryData(dataQualityQueryKeys.run('project-1', 'mart-1', 'run-first'))
    ).toEqual(expect.objectContaining({ runId: 'run-first' }));
    expect(
      client.getQueryData(dataQualityQueryKeys.run('project-2', 'mart-2', 'run-second'))
    ).toEqual(expect.objectContaining({ runId: 'run-second' }));
  });
});

function buildRun(state: 'RUNNING' | 'PASSED', runId = 'run-1'): DataQualityRun {
  return {
    runId,
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

function buildResult(id: string): DataQualityRun['results'][number] {
  return {
    id,
    ruleKey: 'empty_table:data_mart',
    category: 'empty_table',
    scope: { type: 'DATA_MART' },
    severity: 'error',
    status: 'PASSED',
    violationCount: 0,
    description: 'Table is not empty',
    examples: [],
    sql: 'SELECT 1',
    error: null,
    redacted: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
