import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../data-storage/shared/model/types/data-storage-type.enum';
import { ModelCanvasToolbar } from './ModelCanvasToolbar';

function renderToolbar() {
  return render(
    <ModelCanvasToolbar
      storages={[
        {
          id: 'storage-1',
          type: DataStorageType.GOOGLE_BIGQUERY,
          title: 'Warehouse',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          modifiedAt: new Date('2026-01-01T00:00:00.000Z'),
          publishedDataMartsCount: 1,
          draftDataMartsCount: 0,
        },
      ]}
      storageId='storage-1'
      onStorageChange={vi.fn()}
      status='published'
      onStatusChange={vi.fn()}
      rel='connected'
      onRelChange={vi.fn()}
      searchQuery=''
      onSearchChange={vi.fn()}
    />
  );
}

describe('ModelCanvasToolbar', () => {
  it('labels its select filters and exposes the selected storage', () => {
    renderToolbar();

    expect(screen.getByRole('combobox', { name: 'Storage' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Relationships' })).toBeInTheDocument();
  });

  it('keeps the controls on one row and constrains the search width', () => {
    const { container } = renderToolbar();

    expect(container.firstElementChild).toHaveClass('flex-nowrap');
    expect(container.firstElementChild).not.toHaveClass('flex-wrap');

    const searchInput = screen.getByRole('textbox', { name: 'Search data marts' });
    expect(searchInput.parentElement?.parentElement).toHaveClass(
      'ml-auto',
      'w-[240px]',
      'min-w-[180px]',
      'shrink',
      '[&>div]:w-full'
    );
  });
});
