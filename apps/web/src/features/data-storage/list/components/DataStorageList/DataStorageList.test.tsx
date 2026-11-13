import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageList } from './DataStorageList';

const storages = vi.hoisted(() => [
  { id: 'owox', title: 'OWOX', publishedDataMartsCount: 0, draftDataMartsCount: 0 },
  { id: 'bq', title: 'BQ', publishedDataMartsCount: 0, draftDataMartsCount: 0 },
]);
const handlers = vi.hoisted(() => ({ onDelete: undefined as undefined | ((id: string) => void) }));

vi.mock('../../../shared/model/hooks/useDataStorage.ts', () => ({
  useDataStorage: () => ({
    dataStorages: [
      { ...storages[0], owoxStorage: { location: 'US', datasetId: 'owox_x' } },
      storages[1],
    ],
    fetchDataStorages: vi.fn(),
    clearCurrentDataStorage: vi.fn(),
    getDataStorageById: vi.fn(),
    deleteDataStorage: vi.fn(),
    createDataStorage: vi.fn(),
    loading: false,
  }),
}));
vi.mock('../../../shared/hooks/usePublishDraftsTrigger.ts', () => ({
  usePublishDraftsTrigger: () => ({ run: vi.fn() }),
}));
vi.mock('../../../../../shared/hooks', () => ({
  useUrlParam: () => ({ value: null, setParam: vi.fn(), removeParam: vi.fn() }),
  useProjectRoute: () => ({ scope: (p: string) => p }),
}));
vi.mock('react-router', () => ({ Link: () => null }));
vi.mock('../../../edit', () => ({ DataStorageConfigSheet: () => null }));
vi.mock('../../../shared', () => ({}));
vi.mock('../../../shared/components/DataStorageTypeDialog.tsx', () => ({
  DataStorageTypeDialog: () => null,
}));
vi.mock('../../../shared/components/OwoxStorageCreateDialog.tsx', () => ({
  OwoxStorageCreateDialog: () => null,
}));
vi.mock('../DataStorageDetailsDialog', () => ({ DataStorageDetailsDialog: () => null }));
vi.mock('../DataStorageTable', () => ({
  DataStorageTable: () => null,
  getDataStorageColumns: (args: { onDelete: (id: string) => void }) => {
    handlers.onDelete = args.onDelete;
    return [];
  },
}));

describe('DataStorageList delete confirmation', () => {
  beforeEach(() => {
    handlers.onDelete = undefined;
  });

  it('warns that an OWOX Storage deletes its tables', () => {
    render(<DataStorageList />);
    act(() => {
      handlers.onDelete?.('owox');
    });
    expect(
      screen.getByText(
        'This deletes the OWOX Storage and all its tables. The data cannot be restored.'
      )
    ).toBeInTheDocument();
  });

  it('keeps the usual text for other storages', () => {
    render(<DataStorageList />);
    act(() => {
      handlers.onDelete?.('bq');
    });
    expect(
      screen.getByText(
        'Are you sure you want to delete this storage? This action cannot be undone.'
      )
    ).toBeInTheDocument();
  });
});
