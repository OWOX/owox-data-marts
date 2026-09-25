// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartProvider } from './DataMartContext';
import { DataMartContext } from './context';
import { dataMartService } from '../../../shared';
import type { DataMartResponseDto } from '../../../shared/types/api/response/data-mart.response.dto';
import { getConnectorInfoByName } from '../../../../connectors/shared/utils';
import type { ConnectorDefinitionConfig } from '../types';

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
      runDataMart: vi.fn(),
      getDataMartById: vi.fn(),
      updateDataMart: vi.fn(),
    },
  };
});

vi.mock('../../../../connectors/shared/utils', async () => ({
  ...(await vi.importActual<typeof import('../../../../connectors/shared/utils')>(
    '../../../../connectors/shared/utils'
  )),
  getConnectorInfoByName: vi.fn(),
}));

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
});

describe('DataMartProvider connector info', () => {
  const connectorDataMart = {
    id: 'dm-1',
    title: 'Items',
    description: null,
    status: 'DRAFT',
    storage: {
      id: 'st-1',
      title: 'BigQuery',
      type: 'GOOGLE_BIGQUERY',
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
      config: null,
      credentials: null,
      availableForUse: true,
      availableForMaintenance: true,
    },
    definitionType: 'CONNECTOR',
    definition: {
      connector: {
        source: { name: 'MyCustomApi', configuration: [], node: 'items', fields: ['id'] },
        storage: { fullyQualifiedName: 'ds.items' },
      },
    },
    schema: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    availableForReporting: true,
    availableForMaintenance: true,
  } as unknown as DataMartResponseDto;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataMartService.getDataMartById).mockResolvedValue(connectorDataMart);
    vi.mocked(dataMartService.updateDataMart).mockResolvedValue(connectorDataMart);
    vi.mocked(getConnectorInfoByName).mockResolvedValue({
      name: 'MyCustomApi',
      displayName: 'My Custom API',
      description: '',
      logoBase64: null,
      docUrl: null,
      isCustom: true,
      id: 'cdef-1',
      version: 2,
    });
  });

  function renderPage() {
    let pending: Promise<unknown> | undefined;

    function Consumer() {
      const context = useContext(DataMartContext)!;
      const definition = context.dataMart?.definition as ConnectorDefinitionConfig | undefined;
      return (
        <>
          <button
            type='button'
            onClick={() => {
              pending = context.getDataMart('dm-1');
            }}
          >
            Load
          </button>
          <button
            type='button'
            onClick={() => {
              pending = context.refreshDataMart('dm-1');
            }}
          >
            Refresh
          </button>
          <button
            type='button'
            onClick={() => {
              pending = context.updateDataMart('dm-1', { title: 'Renamed' });
            }}
          >
            Save
          </button>
          <output data-testid='connector'>
            {definition?.connector.info?.displayName ?? 'none'}
          </output>
        </>
      );
    }

    render(
      <DataMartProvider>
        <Consumer />
      </DataMartProvider>
    );

    return async (button: string) => {
      fireEvent.click(screen.getByRole('button', { name: button }));
      await act(async () => {
        await pending;
      });
    };
  }

  it('looks the connector up once for the page, not again on every save or refresh', async () => {
    const click = renderPage();

    await click('Load');
    await click('Refresh');
    await click('Save');

    expect(getConnectorInfoByName).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('connector')).toHaveTextContent('My Custom API');
  });

  it('looks the connector up again when the page loads a Data Mart', async () => {
    const click = renderPage();

    await click('Load');
    await click('Load');

    expect(getConnectorInfoByName).toHaveBeenCalledTimes(2);
  });
});
