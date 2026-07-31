import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartStatus } from '../../shared/enums';
import type { DataQualityCompactSummary } from '../../shared/types';
import type { ModelCanvasTopologyData } from '../model/types';
import { ModelCanvasView } from './ModelCanvasView';

const viewState = vi.hoisted(() => ({
  fetchDataStorages: vi.fn(),
  storageHook: {
    dataStorages: [
      {
        id: 'storage-1',
        type: 'GOOGLE_BIGQUERY',
        title: 'Warehouse',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        modifiedAt: new Date('2026-01-01T00:00:00.000Z'),
        publishedDataMartsCount: 1,
        draftDataMartsCount: 0,
      },
    ],
    currentDataStorage: null,
    loading: false,
    error: null,
  },
  canvasHook: {
    data: undefined as ModelCanvasTopologyData | undefined,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn().mockResolvedValue(undefined),
  },
  qualitySummariesHook: {
    data: {} as Record<string, ReturnType<typeof buildQualitySummary>>,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn().mockResolvedValue(undefined),
  },
  useDataQualitySummaries: vi.fn(),
  navigate: vi.fn(),
  filters: {
    storageId: 'storage-1',
    setStorageId: vi.fn(),
    status: 'published' as const,
    setStatus: vi.fn(),
    rel: 'connected' as const,
    setRel: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
  },
}));

const dataQualityServiceMock = vi.hoisted(() => ({
  getConfig: vi.fn(),
  startRun: vi.fn(),
}));

vi.mock('../../../data-storage/shared/model/hooks/useDataStorage', () => ({
  useDataStorage: () => ({
    ...viewState.storageHook,
    fetchDataStorages: viewState.fetchDataStorages,
    getDataStorageById: vi.fn(),
    createDataStorage: vi.fn(),
    updateDataStorage: vi.fn(),
    deleteDataStorage: vi.fn(),
    clearCurrentDataStorage: vi.fn(),
  }),
}));

vi.mock('../model/use-model-canvas', () => ({
  useModelCanvas: () => viewState.canvasHook,
}));

vi.mock('../model/use-refresh-data-last-updated', () => ({
  useRefreshDataLastUpdated: () => ({ refresh: vi.fn(), isRefreshing: false }),
}));

vi.mock('../model/use-model-canvas-filters', () => ({
  useModelCanvasFilters: () => viewState.filters,
}));

vi.mock('../../data-quality/model/use-data-quality-workspace', () => ({
  useDataQualitySummaries: (projectId: string, dataMartIds: string[]) =>
    viewState.useDataQualitySummaries(projectId, dataMartIds),
}));

vi.mock('../../../../shared/hooks', () => ({
  useProjectRoute: () => ({
    projectId: 'project-1',
    scope: (path: string) => path,
    navigate: viewState.navigate,
  }),
}));

vi.mock('../../data-quality/api/data-quality.service', () => ({
  dataQualityService: dataQualityServiceMock,
}));

vi.mock('./ModelCanvasToolbar', () => ({
  ModelCanvasToolbar: () => null,
}));

vi.mock('./ModelCanvas', () => ({
  default: ({
    nodes,
    edges,
    onOpenDataMart,
    onOpenQuality,
    onRunQuality,
    topLeftControls,
  }: {
    nodes: { id: string }[];
    edges: { id: string }[];
    onOpenDataMart: (dataMartId: string) => void;
    onOpenQuality?: (dataMartId: string) => void;
    onRunQuality?: (dataMartId: string) => Promise<void>;
    topLeftControls?: React.ReactNode;
  }) => (
    <>
      {topLeftControls}
      <span data-testid='canvas-node-ids'>{nodes.map(node => node.id).join(',')}</span>
      <span data-testid='canvas-edge-ids'>{edges.map(edge => edge.id).join(',')}</span>
      <button
        type='button'
        onClick={() => {
          onOpenDataMart('mart-1');
        }}
      >
        Open Orders
      </button>
      <button type='button' onClick={() => onOpenQuality?.('mart-1')}>
        Open Quality Orders
      </button>
      <button type='button' onClick={() => void onRunQuality?.('mart-1')}>
        Run Quality Orders
      </button>
    </>
  ),
}));

vi.mock('@owox/ui/components/common/skeleton-list', () => ({
  SkeletonList: () => <div>Loading canvas</div>,
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('ModelCanvasView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewState.fetchDataStorages.mockResolvedValue(undefined);
    viewState.storageHook.dataStorages = [
      {
        id: 'storage-1',
        type: 'GOOGLE_BIGQUERY',
        title: 'Warehouse',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        modifiedAt: new Date('2026-01-01T00:00:00.000Z'),
        publishedDataMartsCount: 1,
        draftDataMartsCount: 0,
      },
    ];
    viewState.storageHook.loading = false;
    viewState.canvasHook.data = undefined;
    viewState.canvasHook.isLoading = false;
    viewState.canvasHook.error = null;
    viewState.canvasHook.refetch.mockResolvedValue(undefined);
    viewState.qualitySummariesHook.data = {};
    viewState.qualitySummariesHook.isLoading = false;
    viewState.qualitySummariesHook.error = null;
    viewState.qualitySummariesHook.refetch.mockResolvedValue(undefined);
    viewState.useDataQualitySummaries.mockImplementation(
      (_projectId: string, dataMartIds: string[]) => ({
        ...viewState.qualitySummariesHook,
        data: Object.fromEntries(
          dataMartIds.map(dataMartId => [
            dataMartId,
            viewState.qualitySummariesHook.data[dataMartId] ?? buildQualitySummary(),
          ])
        ),
      })
    );
    viewState.filters.storageId = 'storage-1';
    viewState.filters.status = 'published';
    viewState.filters.rel = 'connected';
    viewState.filters.searchQuery = '';
    dataQualityServiceMock.getConfig.mockResolvedValue({
      savedConfig: null,
      effectiveConfig: { rules: [] },
      configRevision: 'a'.repeat(64),
      source: 'DEFAULT',
      permissions: { canEdit: true, canRun: true },
      runEligibility: { eligible: true, code: null, activeRunId: null },
      relationships: [],
    });
    dataQualityServiceMock.startRun.mockResolvedValue({
      runId: 'run-1',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens data marts in a tab without exposing the opener or referrer', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    viewState.canvasHook.data = {
      nodes: [
        {
          id: 'mart-1',
          title: 'Orders',
          status: DataMartStatus.PUBLISHED,
          description: null,
          fieldCount: 3,
          dataLastUpdated: null,
        },
        {
          id: 'mart-2',
          title: 'Customers',
          status: DataMartStatus.PUBLISHED,
          description: null,
          fieldCount: 2,
          dataLastUpdated: null,
        },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceDataMartId: 'mart-1',
          targetDataMartId: 'mart-2',
          joinConditions: [],
        },
      ],
    };

    render(<ModelCanvasView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Orders' }));

    expect(openSpy).toHaveBeenCalledWith(
      '/data-marts/mart-1/data-setup',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('opens the Data Mart Quality tab in the current project route', async () => {
    viewState.canvasHook.data = buildCanvasData();

    render(<ModelCanvasView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Quality Orders' }));

    expect(viewState.navigate).toHaveBeenCalledWith('/data-marts/mart-1/quality');
  });

  it('lets the run request decide eligibility and refreshes only canvas quality summaries', async () => {
    viewState.canvasHook.data = buildCanvasData();

    render(<ModelCanvasView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Run Quality Orders' }));

    await waitFor(() => {
      expect(dataQualityServiceMock.startRun).toHaveBeenCalledWith('mart-1');
    });
    expect(dataQualityServiceMock.getConfig).not.toHaveBeenCalled();
    expect(viewState.qualitySummariesHook.refetch).toHaveBeenCalledOnce();
    expect(viewState.canvasHook.refetch).not.toHaveBeenCalled();
  });

  it('requests summaries only for nodes left by the canvas filters', async () => {
    viewState.canvasHook.data = {
      ...buildCanvasData(),
      nodes: [
        ...buildCanvasData().nodes,
        {
          id: 'mart-3',
          title: 'Draft hidden by status',
          status: DataMartStatus.DRAFT,
          description: null,
          fieldCount: 1,
          dataLastUpdated: null,
        },
      ],
    };

    render(<ModelCanvasView />);

    await waitFor(() => {
      expect(viewState.useDataQualitySummaries).toHaveBeenLastCalledWith('project-1', [
        'mart-1',
        'mart-2',
      ]);
    });
  });

  it('renders only summarized nodes and removes their incident edges from a partial response', async () => {
    viewState.canvasHook.data = buildCanvasData();
    viewState.useDataQualitySummaries.mockReturnValue({
      ...viewState.qualitySummariesHook,
      data: { 'mart-1': buildQualitySummary() },
    });

    render(<ModelCanvasView />);

    expect(await screen.findByTestId('canvas-node-ids')).toHaveTextContent('mart-1');
    expect(screen.getByTestId('canvas-node-ids')).not.toHaveTextContent('mart-2');
    expect(screen.getByTestId('canvas-edge-ids')).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('counts the Data Marts left by canvas filters without narrowing the count by search', async () => {
    viewState.filters.searchQuery = 'Orders';
    viewState.canvasHook.data = {
      ...buildCanvasData(),
      nodes: [
        ...buildCanvasData().nodes,
        {
          id: 'mart-3',
          title: 'Disconnected',
          status: DataMartStatus.PUBLISHED,
          description: null,
          fieldCount: 1,
          dataLastUpdated: null,
        },
      ],
    };

    render(<ModelCanvasView />);

    expect(await screen.findByRole('button', { name: 'Actions 2' })).toBeVisible();
  });

  it('describes canvas actions as applying to every Data Mart shown by the filters', async () => {
    viewState.canvasHook.data = buildCanvasData();

    render(<ModelCanvasView />);

    const trigger = await screen.findByRole('button', { name: 'Actions 2' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(
      screen.getByText(
        "You're about to delete all 2 data marts shown by the current canvas filters."
      )
    ).toBeVisible();
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
  });

  it('does not report active Data Quality runs from nodes excluded by canvas filters', async () => {
    const onActiveQualityRunChange = vi.fn();
    viewState.canvasHook.data = {
      ...buildCanvasData(),
      nodes: [
        ...buildCanvasData().nodes,
        {
          id: 'mart-3',
          title: 'Draft quality run',
          status: DataMartStatus.DRAFT,
          description: null,
          fieldCount: 1,
          dataLastUpdated: null,
        },
      ],
    };
    viewState.qualitySummariesHook.data = {
      'mart-1': buildQualitySummary(),
      'mart-2': buildQualitySummary(),
      'mart-3': {
        ...buildQualitySummary(),
        state: 'RUNNING',
        dataMartRunId: 'quality-run-1',
      },
    };

    render(<ModelCanvasView onActiveQualityRunChange={onActiveQualityRunChange} />);

    await waitFor(() => {
      expect(viewState.useDataQualitySummaries).toHaveBeenLastCalledWith('project-1', [
        'mart-1',
        'mart-2',
      ]);
      expect(onActiveQualityRunChange).toHaveBeenLastCalledWith(false);
    });
  });

  it('shows a stable fallback when the canvas request fails without an Axios response', async () => {
    viewState.canvasHook.error = new Error('Network Error');

    render(<ModelCanvasView />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load the data model');
  });

  it('catches storage loading failures and offers a retry', async () => {
    viewState.storageHook.dataStorages = [];
    viewState.fetchDataStorages
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(undefined);

    render(<ModelCanvasView />);

    expect(await screen.findByText('Failed to load storages')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading storages' }));

    await waitFor(() => {
      expect(viewState.fetchDataStorages).toHaveBeenCalledTimes(2);
    });
  });

  it('shows loading feedback while the initial storage request is pending', () => {
    viewState.storageHook.dataStorages = [];
    viewState.fetchDataStorages.mockReturnValue(new Promise(() => undefined));

    render(<ModelCanvasView />);

    expect(screen.getByText('Loading canvas')).toBeInTheDocument();
    expect(screen.queryByText('Select a storage to view its data model')).not.toBeInTheDocument();
  });

  it('does not ask for a storage when none are available', async () => {
    viewState.storageHook.dataStorages = [];

    render(<ModelCanvasView />);

    expect(await screen.findByRole('status')).toHaveTextContent('No storages available');
    expect(screen.queryByText('Select a storage to view its data model')).not.toBeInTheDocument();
  });

  it('replaces a storage error with loading feedback during retry', async () => {
    const retry = deferred<undefined>();
    viewState.storageHook.dataStorages = [];
    viewState.fetchDataStorages
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockReturnValueOnce(retry.promise);

    render(<ModelCanvasView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading storages' }));

    expect(screen.getByText('Loading canvas')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces informational empty states as status messages', async () => {
    viewState.canvasHook.data = { nodes: [], edges: [] };

    render(<ModelCanvasView />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('No data marts in this storage');
    });
  });

  it('ignores an older storage failure after a newer StrictMode load succeeds', async () => {
    const older = deferred<undefined>();
    const newer = deferred<undefined>();
    viewState.fetchDataStorages
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    render(
      <StrictMode>
        <ModelCanvasView />
      </StrictMode>
    );

    await waitFor(() => {
      expect(viewState.fetchDataStorages).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      newer.resolve(undefined);
      await newer.promise;
    });
    await act(async () => {
      older.reject(new Error('Stale network failure'));
      await older.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Failed to load storages')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry loading storages' })
    ).not.toBeInTheDocument();
  });
});

function buildCanvasData(): ModelCanvasTopologyData {
  return {
    nodes: [
      {
        id: 'mart-1',
        title: 'Orders',
        status: DataMartStatus.PUBLISHED,
        description: null,
        fieldCount: 3,
        dataLastUpdated: null,
      },
      {
        id: 'mart-2',
        title: 'Customers',
        status: DataMartStatus.PUBLISHED,
        description: null,
        fieldCount: 2,
        dataLastUpdated: null,
      },
    ],
    edges: [
      {
        id: 'edge-1',
        sourceDataMartId: 'mart-1',
        targetDataMartId: 'mart-2',
        joinConditions: [],
      },
    ],
  };
}

function buildQualitySummary(): DataQualityCompactSummary {
  return {
    state: 'NEVER_RUN' as const,
    enabledChecks: 1,
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    notApplicableChecks: 0,
    errorChecks: 0,
    noticeFindings: 0,
    warningFindings: 0,
    errorFindings: 0,
    violationCount: 0,
    highestSeverity: null,
    dataMartRunId: null,
    lastRunAt: null,
  };
}
