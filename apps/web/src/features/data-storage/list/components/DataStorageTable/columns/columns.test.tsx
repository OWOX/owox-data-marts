import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../../shared';
import { getDataStorageColumns, type DataStorageTableItem } from './columns';

const columns = getDataStorageColumns({
  onViewDetails: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onPublishDrafts: vi.fn(),
});

function renderTypeCell(original: Partial<DataStorageTableItem>) {
  const column = columns.find(c => 'accessorKey' in c && c.accessorKey === 'type');
  const Cell = column?.cell as (ctx: unknown) => React.ReactNode;
  render(
    <>
      {Cell({
        row: { original, getValue: () => DataStorageType.GOOGLE_BIGQUERY },
      })}
    </>
  );
}

describe('storage list type column', () => {
  it('shows OWOX Storage for an OWOX Storage', () => {
    renderTypeCell({ owoxStorage: { location: 'US', datasetId: 'owox_0123456789ab' } });
    expect(screen.getByText('OWOX Storage')).toBeInTheDocument();
  });

  it('shows the type name for other storages', () => {
    renderTypeCell({});
    expect(screen.queryByText('OWOX Storage')).toBeNull();
  });
});
