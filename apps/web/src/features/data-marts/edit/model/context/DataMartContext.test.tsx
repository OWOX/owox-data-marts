// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartProvider } from './DataMartContext';
import { DataMartContext } from './context';
import { dataMartService } from '../../../shared';
import type { DataMartResponseDto } from '../../../shared/types/api/response/data-mart.response.dto';
import { getConnectorInfoByName } from '../../../../connectors/shared/utils';
import type { ConnectorDefinitionConfig } from '../types';
import { trackEvent as trackDataLayerEvent } from '../../../../../utils/data-layer';
import { DataMartDefinitionType } from '../../../shared/enums';
import { InlineMarkdownDescription } from '../../../../../shared/components/DescriptionEditor/InlineMarkdownDescription';

vi.mock('../../../../../shared/components/DescriptionEditor/DescriptionEditor', () => ({
  DescriptionEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label='Description'
      value={value}
      onChange={event => {
        onChange(event.target.value);
      }}
    />
  ),
}));
vi.mock('../../../../../shared/components/MarkdownEditor', () => ({
  useMarkdownPreview: () => ({ html: '', loading: true, error: null }),
  MarkdownEditorPreview: () => <div>preview</div>,
}));

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

// Builder analytics pushes through the data layer module itself, not the utils barrel.
vi.mock('../../../../../utils/data-layer', () => ({ trackEvent: vi.fn() }));

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
      updateDataMartDefinition: vi.fn(),
      updateDataMartDescription: vi.fn(),
    },
  };
});

describe('DataMartProvider description editor', () => {
  it('preserves a Markdown draft after an API failure and saves it on retry', async () => {
    const response = {
      id: 'dm-1',
      title: 'Revenue',
      description: 'Original',
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: 'SELECT 1' },
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
      schema: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
      availableForReporting: true,
      availableForMaintenance: true,
    } as unknown as DataMartResponseDto;
    vi.mocked(dataMartService.getDataMartById).mockResolvedValue(response);
    vi.mocked(dataMartService.updateDataMartDescription)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response);
    let loading: Promise<unknown> | undefined;
    function Consumer() {
      const context = useContext(DataMartContext)!;
      return (
        <>
          <button
            type='button'
            onClick={() => {
              loading = context.getDataMart('dm-1');
            }}
          >
            Load
          </button>
          {context.dataMart && (
            <InlineMarkdownDescription
              projectId='project'
              description={context.dataMart.description}
              onUpdate={description => context.updateDataMartDescription('dm-1', description)}
            />
          )}
        </>
      );
    }
    render(
      <DataMartProvider>
        <Consumer />
      </DataMartProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await act(async () => {
      await loading;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    const draft = '[Revenue](https://app.example/ui/project/data-marts/revenue/data-setup)';
    fireEvent.change(screen.getByRole('textbox'), { target: { value: draft } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox')).toHaveValue(draft);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(draft)).toBeInTheDocument();
    expect(vi.mocked(dataMartService.updateDataMartDescription).mock.calls.slice(-2)).toEqual([
      ['dm-1', draft],
      ['dm-1', draft],
    ]);
  });
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

describe('DataMartProvider saved version pin', () => {
  const dataMartWith = (version?: number) =>
    ({
      id: 'dm-1',
      title: 'Items',
      description: null,
      status: 'DRAFT',
      storage: { id: 'st-1', title: 'BigQuery', type: 'GOOGLE_BIGQUERY' },
      definitionType: 'CONNECTOR',
      definition: {
        connector: {
          source: {
            name: 'MyCustomApi',
            configuration: [],
            node: 'items',
            fields: ['id'],
            version,
          },
          storage: { fullyQualifiedName: 'ds.items' },
        },
      },
      schema: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
    }) as unknown as DataMartResponseDto;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataMartService.getDataMartById).mockResolvedValue(dataMartWith());
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
      const save = (version?: number) => {
        vi.mocked(dataMartService.updateDataMartDefinition).mockResolvedValue(
          dataMartWith(version)
        );
        const definition = dataMartWith(version).definition as unknown as ConnectorDefinitionConfig;
        pending = context.updateDataMartDefinition(
          'dm-1',
          DataMartDefinitionType.CONNECTOR,
          definition
        );
      };
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
              save(1);
            }}
          >
            Pin 1
          </button>
          <button
            type='button'
            onClick={() => {
              save(undefined);
            }}
          >
            Follow
          </button>
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

  const pins = () =>
    vi
      .mocked(trackDataLayerEvent)
      .mock.calls.map(([payload]) => payload)
      .filter(payload => payload.event === 'custom_connector_version_pinned');

  // A pick in the version popover is only kept once the Data Mart is saved with it.
  it('reports a pin when the Data Mart is saved with a different version', async () => {
    const click = renderPage();
    await click('Load');
    await click('Pin 1');
    await click('Pin 1');
    await click('Follow');

    expect(pins()).toEqual([
      expect.objectContaining({
        action: 'Pin',
        connectorId: 'cdef-1',
        version: 1,
        previousVersion: null,
        activeVersion: 2,
        dataMartId: 'dm-1',
      }),
      expect.objectContaining({ action: 'FollowActive', version: null, previousVersion: 1 }),
    ]);
  });
});
