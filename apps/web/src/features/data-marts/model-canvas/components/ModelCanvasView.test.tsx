import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartStatus } from '../../shared/enums';
import type { ModelCanvasData } from '../model/types';
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
    data: undefined as ModelCanvasData | undefined,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn().mockResolvedValue(undefined),
  },
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

vi.mock('../model/use-model-canvas-filters', () => ({
  useModelCanvasFilters: () => viewState.filters,
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
    onOpenDataMart,
    onOpenQuality,
    onRunQuality,
    topLeftControls,
  }: {
    onOpenDataMart: (dataMartId: string) => void;
    onOpenQuality?: (dataMartId: string) => void;
    onRunQuality?: (dataMartId: string) => Promise<void>;
    topLeftControls?: React.ReactNode;
  }) => (
    <>
      {topLeftControls}
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
    viewState.filters.storageId = 'storage-1';
    viewState.filters.status = 'published';
    viewState.filters.rel = 'connected';
    viewState.filters.searchQuery = '';
    dataQualityServiceMock.getConfig.mockResolvedValue({
      savedConfig: null,
      effectiveConfig: { timezone: 'UTC', rules: [] },
      source: 'DEFAULT',
      permissions: { canEdit: true, canRun: true },
      runEligibility: { eligible: true, code: null, activeRunId: null },
      availableChecks: [],
      relationships: [],
    });
    dataQualityServiceMock.startRun.mockResolvedValue({
      id: 'run-1',
      dataMartRunId: 'run-1',
      summary: {},
      results: [],
      createdAt: null,
      startedAt: null,
      finishedAt: null,
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
          qualitySummary: buildQualitySummary(),
        },
        {
          id: 'mart-2',
          title: 'Customers',
          status: DataMartStatus.PUBLISHED,
          description: null,
          fieldCount: 2,
          qualitySummary: buildQualitySummary(),
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

  it('checks backend capability before starting Quality and refreshes canvas summaries', async () => {
    viewState.canvasHook.data = buildCanvasData();

    render(<ModelCanvasView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Run Quality Orders' }));

    await waitFor(() => {
      expect(dataQualityServiceMock.getConfig).toHaveBeenCalledWith('mart-1');
      expect(dataQualityServiceMock.startRun).toHaveBeenCalledWith('mart-1');
    });
    expect(viewState.canvasHook.refetch).toHaveBeenCalledOnce();
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
          qualitySummary: buildQualitySummary(),
        },
      ],
    };

    render(<ModelCanvasView />);

    expect(await screen.findByRole('button', { name: 'Actions 2' })).toBeVisible();
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

function buildCanvasData(): ModelCanvasData {
  return {
    nodes: [
      {
        id: 'mart-1',
        title: 'Orders',
        status: DataMartStatus.PUBLISHED,
        description: null,
        fieldCount: 3,
        qualitySummary: buildQualitySummary(),
      },
      {
        id: 'mart-2',
        title: 'Customers',
        status: DataMartStatus.PUBLISHED,
        description: null,
        fieldCount: 2,
        qualitySummary: buildQualitySummary(),
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

function buildQualitySummary() {
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
