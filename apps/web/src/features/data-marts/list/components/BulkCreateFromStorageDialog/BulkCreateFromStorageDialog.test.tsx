import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataStorageApiService } from '../../../../data-storage/shared/api';
import type { StorageResourceLeafDto } from '../../../../data-storage/shared/api/types';
import { BulkCreateFromStorageDialog } from './BulkCreateFromStorageDialog';

vi.mock('../../../../data-storage/shared/api', () => ({
  dataStorageApiService: {
    getDataStorages: vi.fn(),
    listStorageNamespaces: vi.fn(),
    listStorageResources: vi.fn(),
  },
}));

vi.mock('../../../../data-storage/shared/model/hooks/useDataStorageHealthStatus', () => ({
  useDataStorageHealthStatus: () => ({ status: 'valid', errorMessage: null, isFetched: true }),
}));

vi.mock('../../../../data-storage', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../data-storage')>()),
  DataStorageHealthIndicator: () => null,
}));

// The storage picker's popover does not open under happy-dom; a native select drives the
// same onValueChange.
vi.mock('../../../../../shared/components/Combobox/combobox', () => ({
  Combobox: ({
    options,
    value,
    onValueChange,
  }: {
    options: { value: string; label: string }[];
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select
      aria-label='Storage'
      value={value}
      onChange={event => {
        onValueChange(event.target.value);
      }}
    >
      <option value=''>Select a storage</option>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('../../../../../shared/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../../shared/hooks')>()),
  useProjectRoute: () => ({ navigate: vi.fn() }),
}));

const PROJECT = 'shared-project';

function storage(id: string, title: string) {
  return {
    id,
    type: 'GOOGLE_BIGQUERY',
    title,
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
  };
}

function euOrders(locationMismatch: boolean): StorageResourceLeafDto {
  return {
    id: 'orders',
    groupId: 'eu_dataset',
    type: 'TABLE',
    fullyQualifiedName: `${PROJECT}.eu_dataset.orders`,
    location: 'europe-central2',
    locationMismatch,
  };
}

async function pickStorage(id: string) {
  const picker = screen.getByRole('combobox', { name: 'Storage' });
  await waitFor(() => {
    expect(picker).toHaveTextContent('BigQuery EU');
  });
  fireEvent.change(picker, { target: { value: id } });
}

describe('BulkCreateFromStorageDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataStorageApiService.getDataStorages).mockResolvedValue([
      storage('us-storage', 'BigQuery US'),
      storage('eu-storage', 'BigQuery EU'),
    ] as never);
    vi.mocked(dataStorageApiService.listStorageNamespaces).mockResolvedValue([{ id: PROJECT }]);
    vi.mocked(dataStorageApiService.listStorageResources).mockImplementation(storageId =>
      Promise.resolve([euOrders(storageId === 'us-storage')])
    );
  });

  it('reloads resources and their location checks when the storage changes', async () => {
    render(<BulkCreateFromStorageDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />);

    await pickStorage('us-storage');
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(PROJECT) }));
    expect(await screen.findByRole('button', { name: /eu_dataset/ })).toHaveTextContent(
      'europe-central2 · different location'
    );

    await pickStorage('eu-storage');
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(PROJECT) }));
    await waitFor(() => {
      expect(dataStorageApiService.listStorageResources).toHaveBeenCalledWith(
        'eu-storage',
        PROJECT
      );
    });
    const euDataset = await screen.findByRole('button', { name: /eu_dataset/ });
    expect(euDataset).toHaveTextContent('europe-central2');
    expect(euDataset).not.toHaveTextContent('different location');
  });
});
