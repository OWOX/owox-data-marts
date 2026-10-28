import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../shared';
import type { DataStorage } from '../../../shared/model/types/data-storage.ts';
import { useDataStorage } from '../../../shared/model/hooks/useDataStorage.ts';
import { DataStorageConfigSheet } from './DataStorageConfigSheet';

const authMock = vi.hoisted(() => ({
  value: {
    status: 'authenticated',
    user: { id: 'user-1', projectId: 'project-1', roles: ['admin'] },
    signOut: vi.fn(),
  },
}));

vi.mock('../../../shared/model/hooks/useDataStorage.ts', () => ({
  useDataStorage: vi.fn(),
}));

vi.mock('../../../../idp', () => ({
  useAuth: () => authMock.value,
}));

// Captures what the sheet hands the form, so a test can drive a save the way the form does.
const formProps = vi.hoisted(() => ({
  current: null as null | {
    initialData?: DataStorage;
    onSubmit: (data: unknown) => Promise<void>;
  },
}));

vi.mock('../DataStorageEditForm', () => ({
  DataStorageForm: (props: {
    initialData?: DataStorage;
    onSubmit: (data: unknown) => Promise<void>;
  }) => {
    formProps.current = props;
    return null;
  },
}));

vi.mock('@owox/ui/components/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <aside role='dialog'>{children}</aside>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

const dataStorage: DataStorage = {
  id: 'storage-1',
  title: 'BigQuery Storage',
  type: DataStorageType.GOOGLE_BIGQUERY,
  config: { projectId: 'gcp-project', location: 'US' },
  createdAt: new Date('2026-06-09T10:00:00.000Z'),
  modifiedAt: new Date('2026-06-09T10:00:00.000Z'),
  reusableCredential: null,
};

function renderSheet(onSaveSuccess = vi.fn(), onClose = vi.fn(), storage = dataStorage) {
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/data-storages']}>
      <DataStorageConfigSheet
        isOpen
        onClose={onClose}
        dataStorage={storage}
        onSaveSuccess={onSaveSuccess}
      />
    </MemoryRouter>
  );
}

describe('DataStorageConfigSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formProps.current = null;

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    // As on the Storages page: the sheet gets the copy its provider just loaded.
    vi.mocked(useDataStorage).mockReturnValue({
      dataStorages: [],
      currentDataStorage: dataStorage,
      loading: false,
      error: null,
      fetchDataStorages: vi.fn(),
      getDataStorageById: vi.fn(),
      createDataStorage: vi.fn(),
      updateDataStorage: vi.fn(),
      deleteDataStorage: vi.fn(),
      clearCurrentDataStorage: vi.fn(),
    });

    authMock.value = {
      status: 'authenticated',
      user: { id: 'user-1', projectId: 'project-1', roles: ['admin'] },
      signOut: vi.fn(),
    };
  });

  it('copies the project-scoped deep link for the storage', async () => {
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to this storage' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/ui/project-1/data-storages?id=storage-1`
      );
    });
  });

  it('hides the copy link button when no project id is resolvable', () => {
    authMock.value = {
      status: 'authenticated',
      user: { id: 'user-1', projectId: '', roles: ['admin'] },
      signOut: vi.fn(),
    };

    renderSheet();

    expect(screen.queryByRole('button', { name: 'Copy link to this storage' })).toBeNull();
  });

  // The form highlights the rejected fields only if the failure reaches it; a sheet that
  // treated it as a success would also close as if the Storage had been saved.
  it('passes a rejected save on to the form and stays open', async () => {
    const rejection = { response: { status: 400, data: { message: 'Invalid config' } } };
    const updateDataStorage = vi.fn().mockRejectedValue(rejection);
    vi.mocked(useDataStorage).mockReturnValue({
      ...vi.mocked(useDataStorage)(),
      updateDataStorage,
    });
    const onSaveSuccess = vi.fn();
    renderSheet(onSaveSuccess);

    await expect(formProps.current?.onSubmit({})).rejects.toBe(rejection);

    expect(updateDataStorage).toHaveBeenCalled();
    expect(onSaveSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reports a successful save', async () => {
    const updated = { ...dataStorage, title: 'Renamed' };
    vi.mocked(useDataStorage).mockReturnValue({
      ...vi.mocked(useDataStorage)(),
      updateDataStorage: vi.fn().mockResolvedValue(updated),
    });
    const onSaveSuccess = vi.fn();
    renderSheet(onSaveSuccess);

    await formProps.current?.onSubmit({});

    expect(onSaveSuccess).toHaveBeenCalledWith(updated);
  });

  it('treats a fault in the caller after the save as a saved Storage, not a rejected one', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(useDataStorage).mockReturnValue({
      ...vi.mocked(useDataStorage)(),
      updateDataStorage: vi.fn().mockResolvedValue(dataStorage),
    });
    const onClose = vi.fn();
    renderSheet(
      vi.fn(() => {
        throw new Error('list refresh failed');
      }),
      onClose
    );

    await expect(formProps.current?.onSubmit({})).resolves.toBeUndefined();

    expect(onClose).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  // The Data Mart page passes the Storage embedded in the Data Mart, or one from an earlier open.
  it('loads its own copy of a Storage passed from another page', async () => {
    const { reusableCredential: _absent, ...embedded } = dataStorage;
    void _absent;
    const loaded = { ...dataStorage, reusableCredential: { access: 'restricted', state: 'ready' } };
    const getDataStorageById = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useDataStorage).mockReturnValue({
      ...vi.mocked(useDataStorage)(),
      currentDataStorage: null,
      getDataStorageById,
    });
    const { rerender } = renderSheet(vi.fn(), vi.fn(), embedded as DataStorage);

    expect(getDataStorageById).toHaveBeenCalledWith('storage-1', { skipErrorToast: true });
    expect(formProps.current).toBeNull();

    vi.mocked(useDataStorage).mockReturnValue({
      ...vi.mocked(useDataStorage)(),
      getDataStorageById,
      currentDataStorage: loaded as DataStorage,
    });
    rerender(
      <MemoryRouter initialEntries={['/ui/project-1/data-storages']}>
        <DataStorageConfigSheet
          isOpen
          onClose={vi.fn()}
          dataStorage={embedded as DataStorage}
          onSaveSuccess={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(formProps.current?.initialData).toBe(loaded);
    });
  });

  it('says when it could not load the Storage and loads it again on Retry', async () => {
    const getDataStorageById = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(undefined);
    vi.mocked(useDataStorage).mockReturnValue({
      ...vi.mocked(useDataStorage)(),
      currentDataStorage: null,
      getDataStorageById,
    });
    const onClose = vi.fn();
    renderSheet(vi.fn(), onClose, { ...dataStorage });

    expect(await screen.findByText('This Storage could not be loaded.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(getDataStorageById).toHaveBeenCalledTimes(2);
    });
  });

  it('says the member has no access when the Storage answers 403, without Retry', async () => {
    const getDataStorageById = vi.fn().mockRejectedValue({ response: { status: 403 } });
    vi.mocked(useDataStorage).mockReturnValue({
      ...vi.mocked(useDataStorage)(),
      currentDataStorage: null,
      getDataStorageById,
    });
    renderSheet(vi.fn(), vi.fn(), { ...dataStorage });

    expect(await screen.findByText("You don't have access to this Storage.")).toBeInTheDocument();
    expect(screen.queryByText('This Storage could not be loaded.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(formProps.current).toBeNull();
  });

  it('edits the copy the Storages page just loaded as given', () => {
    const getDataStorageById = vi.fn();
    vi.mocked(useDataStorage).mockReturnValue({
      ...vi.mocked(useDataStorage)(),
      getDataStorageById,
    });
    renderSheet();

    expect(getDataStorageById).not.toHaveBeenCalled();
    expect(formProps.current?.initialData).toBe(dataStorage);
  });
});
