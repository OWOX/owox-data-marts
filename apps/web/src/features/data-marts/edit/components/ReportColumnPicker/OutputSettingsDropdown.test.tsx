import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutputSettingsDropdown } from './OutputSettingsDropdown';
import type { OutputConfig } from '../../../shared/types/output-config';

vi.mock('@owox/ui/components/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('OutputSettingsDropdown disconnected controls', () => {
  it('marks stale filters, slices, and sort rules as disconnected rows', () => {
    const value: OutputConfig = {
      filterConfig: [
        { column: 'ghost_filter', operator: 'eq', value: 'x' },
        {
          column: 'ghost_slice',
          operator: 'eq',
          value: 'y',
          placement: 'pre-join',
          aliasPath: 'old',
        },
      ],
      sortConfig: [{ column: 'ghost_sort', direction: 'asc' }],
      limitConfig: null,
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={() => {}}
        allColumns={[{ name: 'native_one', type: 'STRING' }]}
        selectedColumns={[{ name: 'native_one', type: 'STRING' }]}
        joinedSources={[]}
      />
    );

    expect(screen.getByText('ghost_filter')).toHaveClass('line-through');
    expect(screen.getByText('old.ghost_slice')).toHaveClass('line-through');
    expect(screen.queryByText('ghost_slice')).not.toBeInTheDocument();
    expect(screen.getByText('ghost_sort')).toHaveClass('line-through');
    expect(screen.getAllByLabelText('Column not found in schema')).toHaveLength(3);
  });
});
