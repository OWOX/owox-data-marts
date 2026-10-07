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
  current: null as null | { onSubmit: (data: unknown) => Promise<void> },
}));

vi.mock('../DataStorageEditForm', () => ({
  DataStorageForm: (props: { onSubmit: (data: unknown) => Promise<void> }) => {
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
  credentials: { serviceAccount: '{}' },
  config: { projectId: 'gcp-project', location: 'US' },
  createdAt: new Date('2026-06-09T10:00:00.000Z'),
  modifiedAt: new Date('2026-06-09T10:00:00.000Z'),
};

function renderSheet(onSaveSuccess = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/data-storages']}>
      <DataStorageConfigSheet
        isOpen
        onClose={vi.fn()}
        dataStorage={dataStorage}
        onSaveSuccess={onSaveSuccess}
      />
    </MemoryRouter>
  );
}

describe('DataStorageConfigSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    vi.mocked(useDataStorage).mockReturnValue({
      dataStorages: [],
      currentDataStorage: null,
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
});
