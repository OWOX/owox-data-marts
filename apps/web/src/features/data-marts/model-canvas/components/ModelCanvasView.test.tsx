import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    data: undefined as { nodes: []; edges: [] } | undefined,
    isLoading: false,
    error: null as unknown,
  },
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
  useModelCanvasFilters: () => ({
    storageId: 'storage-1',
    setStorageId: vi.fn(),
    status: 'published',
    setStatus: vi.fn(),
    rel: 'connected',
    setRel: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
  }),
}));

vi.mock('../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => path }),
}));

vi.mock('./ModelCanvasToolbar', () => ({
  ModelCanvasToolbar: () => null,
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
