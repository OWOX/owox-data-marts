import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../data-storage/shared/model/types/data-storage-type.enum';
import { ModelCanvasStorageSelect } from './ModelCanvasStorageSelect';

const storages = [
  {
    id: 'storage-1',
    type: DataStorageType.GOOGLE_BIGQUERY,
    title: 'Warehouse',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    modifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    publishedDataMartsCount: 1,
    draftDataMartsCount: 0,
  },
];

describe('ModelCanvasStorageSelect', () => {
  it('labels the combobox and shows the selected storage title', () => {
    render(
      <ModelCanvasStorageSelect
        storages={storages}
        storageId='storage-1'
        onStorageChange={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Storage' })).toHaveTextContent('Warehouse');
  });

  it('shows a placeholder when no storage is selected', () => {
    render(
      <ModelCanvasStorageSelect storages={storages} storageId={null} onStorageChange={vi.fn()} />
    );

    expect(screen.getByRole('combobox', { name: 'Storage' })).toHaveTextContent('Select storage');
  });
});
