import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../data-storage';
import { DataMartCreateForm } from './DataMartCreateForm';

vi.mock('../model', async importOriginal => ({
  ...(await importOriginal<typeof import('../model')>()),
  useDataMartForm: () => ({ handleCreate: vi.fn(), isSubmitting: false, serverError: null }),
}));

vi.mock('../../../data-storage/shared/model/hooks/useDataStorage', () => ({
  useDataStorage: () => storageState,
}));

vi.mock('../../../data-storage', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data-storage')>()),
  DataStorageHealthIndicator: () => null,
}));

vi.mock('../../../data-storage/shared/components/DataStorageTypeDialog', () => ({
  DataStorageTypeDialog: ({
    isOpen,
    onSelectOwoxStorage,
  }: {
    isOpen: boolean;
    onSelectOwoxStorage?: () => void;
  }) =>
    isOpen ? (
      <div>
        Storage type dialog
        <button type='button' onClick={onSelectOwoxStorage}>
          Pick OWOX Storage
        </button>
      </div>
    ) : null,
}));

vi.mock('../../../data-storage/edit', () => ({
  DataStorageConfigSheet: ({
    isOpen,
    newOwoxStorage,
  }: {
    isOpen: boolean;
    newOwoxStorage?: boolean;
  }) => (isOpen && newOwoxStorage ? <div>New OWOX Storage sheet</div> : null),
}));

const storageState = vi.hoisted(() => ({
  dataStorages: [] as unknown[],
  loading: false,
  fetchDataStorages: vi.fn<() => Promise<void>>(),
  createDataStorage: vi.fn(),
  getDataStorageById: vi.fn(),
}));

const listed = () =>
  within(document.body)
    .queryAllByRole('option')
    .map(o => o.textContent);

async function openAndSearch(text: string) {
  render(<DataMartCreateForm />);
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.change(await screen.findByPlaceholderText('Search...'), { target: { value: text } });
}

describe('DataMartCreateForm storage list', () => {
  beforeEach(() => {
    storageState.dataStorages = [
      { id: 'a', title: 'Alpha', type: DataStorageType.GOOGLE_BIGQUERY },
      { id: 'b', title: 'Beta', type: DataStorageType.GOOGLE_BIGQUERY },
    ];
    storageState.fetchDataStorages.mockReset().mockResolvedValue();
  });

  it('keeps "Create new storage" listed when the search matches no storage', async () => {
    await openAndSearch('zzz');

    await waitFor(() => {
      expect(listed()).toEqual(['Create new storage']);
    });
    expect(screen.getByText('No storages found')).toBeInTheDocument();
  });

  it('keeps "Create new storage" below the storages the search matches', async () => {
    await openAndSearch('alp');

    await waitFor(() => {
      expect(listed()).toEqual(['Alpha', 'Create new storage']);
    });
  });

  it('opens the storage type dialog when "Create new storage" is chosen after a search', async () => {
    await openAndSearch('zzz');

    fireEvent.click(await screen.findByRole('option', { name: 'Create new storage' }));

    expect(await screen.findByText('Storage type dialog')).toBeInTheDocument();
  });

  it('opens the storage sheet for a new OWOX Storage', async () => {
    await openAndSearch('zzz');
    fireEvent.click(await screen.findByRole('option', { name: 'Create new storage' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Pick OWOX Storage' }));

    expect(await screen.findByText('New OWOX Storage sheet')).toBeInTheDocument();
    expect(screen.queryByText('Storage type dialog')).toBeNull();
  });

  it('does not match a storage by its id', async () => {
    storageState.dataStorages = [
      { id: 'xq-1', title: 'Alpha', type: DataStorageType.GOOGLE_BIGQUERY },
    ];
    await openAndSearch('xq');

    await waitFor(() => {
      expect(listed()).toEqual(['Create new storage']);
    });
  });

  it('explains that a storage comes first when none is available, with no list to search', async () => {
    storageState.dataStorages = [];
    render(<DataMartCreateForm />);

    expect(await screen.findByText(/Create a storage first\./)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create new storage' }));

    expect(await screen.findByText('Storage type dialog')).toBeInTheDocument();
  });

  it('keeps the list while the storages are still loading', () => {
    storageState.dataStorages = [];
    storageState.fetchDataStorages.mockReturnValue(new Promise(() => undefined));
    render(<DataMartCreateForm />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByText(/Create a storage first\./)).not.toBeInTheDocument();
  });

  it('keeps the list when the storages fail to load', async () => {
    storageState.dataStorages = [];
    storageState.fetchDataStorages.mockRejectedValue(new Error('network'));
    render(<DataMartCreateForm />);

    await waitFor(() => {
      expect(storageState.fetchDataStorages).toHaveBeenCalled();
    });
    await Promise.resolve();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByText(/Create a storage first\./)).not.toBeInTheDocument();
  });
});
