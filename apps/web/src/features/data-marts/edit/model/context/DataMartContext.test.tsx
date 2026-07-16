// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartProvider } from './DataMartContext';
import { DataMartContext } from './context';
import {
  DataMartRunStatus,
  DataMartRunTriggerType,
  DataMartRunType,
  dataMartService,
} from '../../../shared';
import { useAutoRefresh } from '../../../../../hooks/useAutoRefresh';

vi.mock('../../../../../hooks/useAutoRefresh', () => ({
  useAutoRefresh: vi.fn(),
}));

vi.mock('../../../../../components/AppSidebar/SetupChecklist/useSetupProgress', () => ({
  useRefreshSetupProgress: () => vi.fn(),
}));

vi.mock('../../../../../utils', () => ({
  pushToDataLayer: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
  },
}));

vi.mock('../../../shared', async () => {
  const actual = await vi.importActual<typeof import('../../../shared')>('../../../shared');

  return {
    ...actual,
    dataMartService: {
      cancelDataMartRun: vi.fn(),
      getDataMartRuns: vi.fn(),
      getDataMartRunById: vi.fn(),
      runDataMart: vi.fn(),
    },
  };
});

describe('DataMartProvider cancelDataMartRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderCancelConsumer() {
    let cancelPromise: Promise<void> | undefined;

    function Consumer() {
      const context = useContext(DataMartContext)!;
      return (
        <button
          type='button'
          onClick={() => {
            cancelPromise = context.cancelDataMartRun('dm-1', 'run-1');
          }}
        >
          Cancel
        </button>
      );
    }

    render(
      <DataMartProvider>
        <Consumer />
      </DataMartProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    return {
      get cancelPromise() {
        return cancelPromise;
      },
    };
  }

  it('rejects when the API cancellation request fails', async () => {
    const apiError = {
      message: 'cancel failed',
      path: '/api/data-marts/dm-1/runs/run-1/cancel',
      statusCode: 409,
      timestamp: '2026-06-04T12:00:00.000Z',
    };
    const axiosError = {
      response: {
        data: apiError,
      },
    };

    vi.mocked(dataMartService.cancelDataMartRun).mockRejectedValue(axiosError);
    const result = renderCancelConsumer();

    await act(async () => {
      await expect(result.cancelPromise).rejects.toBe(axiosError);
    });
  });

  it('does not reject when cancellation succeeds but run history refresh fails', async () => {
    const refreshError = new Error('refresh failed');
    vi.mocked(dataMartService.cancelDataMartRun).mockResolvedValue(undefined);
    vi.mocked(dataMartService.getDataMartRuns).mockRejectedValue(refreshError);

    const result = renderCancelConsumer();

    await act(async () => {
      await expect(result.cancelPromise).resolves.toBeUndefined();
    });

    expect(dataMartService.cancelDataMartRun).toHaveBeenCalledWith('dm-1', 'run-1');
    expect(dataMartService.getDataMartRuns).toHaveBeenCalledWith('dm-1', 5, 0, undefined);
  });
});

describe('DataMartProvider runDataMart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderRunConsumer() {
    let runPromise: Promise<string | null> | undefined;

    function Consumer() {
      const context = useContext(DataMartContext)!;
      return (
        <>
          <button
            type='button'
            onClick={() => {
              runPromise = context.runDataMart({
                id: 'dm-1',
                payload: { mode: 'incremental' },
              });
            }}
          >
            Run
          </button>
          <output data-testid='manual-run-triggered'>{String(context.isManualRunTriggered)}</output>
          <output data-testid='manual-run-id'>{context.manualRunId ?? 'none'}</output>
        </>
      );
    }

    render(
      <DataMartProvider>
        <Consumer />
      </DataMartProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    return {
      get runPromise() {
        return runPromise;
      },
    };
  }

  it('returns and stores the exact run id from the manual-run response', async () => {
    vi.mocked(dataMartService.runDataMart).mockResolvedValue({ runId: 'manual-run-1' });
    const result = renderRunConsumer();

    await act(async () => {
      await expect(result.runPromise).resolves.toBe('manual-run-1');
    });

    expect(dataMartService.runDataMart).toHaveBeenCalledWith('dm-1', { mode: 'incremental' });
    expect(screen.getByTestId('manual-run-triggered')).toHaveTextContent('true');
    expect(screen.getByTestId('manual-run-id')).toHaveTextContent('manual-run-1');
  });

  it('preserves the swallowed-error contract while clearing manual tracking', async () => {
    vi.mocked(dataMartService.runDataMart).mockRejectedValue({
      response: {
        data: {
          message: 'run failed',
          path: '/api/data-marts/dm-1/manual-run',
          statusCode: 500,
          timestamp: '2026-07-16T12:00:00.000Z',
        },
      },
    });
    const result = renderRunConsumer();

    await act(async () => {
      await expect(result.runPromise).resolves.toBeNull();
    });

    expect(screen.getByTestId('manual-run-triggered')).toHaveTextContent('false');
    expect(screen.getByTestId('manual-run-id')).toHaveTextContent('none');
  });
});

describe('DataMartProvider run history polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('polls active Data Quality runs every five seconds without marking data as updating', async () => {
    vi.mocked(dataMartService.getDataMartRuns).mockResolvedValue({
      runs: [
        {
          id: 'quality-run-1',
          status: DataMartRunStatus.RUNNING,
          createdAt: '2026-07-16T12:00:00.000Z',
          logs: [],
          errors: [],
          definitionRun: {},
          type: DataMartRunType.DATA_QUALITY,
          runType: DataMartRunTriggerType.MANUAL,
          startedAt: '2026-07-16T12:00:00.000Z',
          finishedAt: null,
          reportDefinition: null,
          reportId: null,
          insightDefinition: null,
          insightId: null,
          insightTemplateDefinition: null,
          insightTemplateId: null,
          aiSourceDefinition: null,
          createdByUser: null,
          additionalParams: null,
        },
      ],
    } as never);

    function Consumer() {
      const context = useContext(DataMartContext)!;
      return (
        <>
          <button
            type='button'
            onClick={() => {
              void context.getDataMartRuns('dm-1');
            }}
          >
            Load runs
          </button>
          <output data-testid='has-active-data-updates'>{String(context.hasActiveRuns)}</output>
        </>
      );
    }

    render(
      <DataMartProvider>
        <Consumer />
      </DataMartProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load runs' }));

    await waitFor(() => {
      expect(vi.mocked(useAutoRefresh)).toHaveBeenLastCalledWith(
        expect.objectContaining({ intervalMs: 5_000 })
      );
    });
    expect(screen.getByTestId('has-active-data-updates')).toHaveTextContent('false');
  });
});

describe('DataMartProvider getDataMartRunById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderRunDetailsConsumer() {
    let requestPromise: Promise<unknown> | undefined;

    function Consumer() {
      const context = useContext(DataMartContext)!;
      return (
        <button
          type='button'
          onClick={() => {
            requestPromise = context.getDataMartRunById('dm-1', 'manual-run-1', { silent: true });
          }}
        >
          Fetch run
        </button>
      );
    }

    render(
      <DataMartProvider>
        <Consumer />
      </DataMartProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fetch run' }));

    return {
      get requestPromise() {
        return requestPromise;
      },
    };
  }

  it('suppresses both the global loader and repeated error toast for silent polling', async () => {
    const run = {
      id: 'manual-run-1',
      status: 'SUCCESS',
      createdAt: '2026-07-16T12:00:00.000Z',
      logs: null,
      errors: null,
      definitionRun: {},
      type: 'CONNECTOR',
      runType: 'manual',
      startedAt: '2026-07-16T12:00:00.000Z',
      finishedAt: '2026-07-16T12:01:00.000Z',
      reportDefinition: null,
      reportId: null,
      insightDefinition: null,
      insightId: null,
      insightTemplateDefinition: null,
      insightTemplateId: null,
      aiSourceDefinition: null,
      createdByUser: null,
      additionalParams: null,
    };
    vi.mocked(dataMartService.getDataMartRunById).mockResolvedValue(run as never);
    const result = renderRunDetailsConsumer();

    await act(async () => {
      await expect(result.requestPromise).resolves.toEqual(
        expect.objectContaining({
          id: 'manual-run-1',
          triggerType: DataMartRunTriggerType.MANUAL,
          createdAt: new Date('2026-07-16T12:00:00.000Z'),
        })
      );
    });

    expect(dataMartService.getDataMartRunById).toHaveBeenCalledWith('dm-1', 'manual-run-1', {
      skipLoadingIndicator: true,
      skipErrorToast: true,
    });
  });

  it('keeps the silent request flags when exact-run polling fails', async () => {
    const requestError = {
      response: {
        data: {
          message: 'temporary fetch failure',
          path: '/api/data-marts/dm-1/runs/manual-run-1',
          statusCode: 503,
          timestamp: '2026-07-16T12:00:00.000Z',
        },
      },
    };
    vi.mocked(dataMartService.getDataMartRunById).mockRejectedValue(requestError);
    const result = renderRunDetailsConsumer();

    await act(async () => {
      await expect(result.requestPromise).rejects.toBe(requestError);
    });

    expect(dataMartService.getDataMartRunById).toHaveBeenCalledWith('dm-1', 'manual-run-1', {
      skipLoadingIndicator: true,
      skipErrorToast: true,
    });
  });
});
