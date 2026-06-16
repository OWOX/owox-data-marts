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
          column: 'users__ghost_slice',
          operator: 'eq',
          value: 'y',
          placement: 'pre-join',
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
    expect(screen.getByText('users__ghost_slice')).toHaveClass('line-through');
    expect(screen.getByText('ghost_sort')).toHaveClass('line-through');
    expect(screen.getAllByLabelText('Column not found in schema')).toHaveLength(3);
  });

  it('shows readable operator labels for stale filters and slices without a known field type', () => {
    const value: OutputConfig = {
      filterConfig: [
        { column: 'ghost_filter', operator: 'gte', value: 10 },
        {
          column: 'users__ghost_slice',
          operator: 'gte',
          value: 20,
          placement: 'pre-join',
        },
      ],
      sortConfig: [],
      limitConfig: null,
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={() => {}}
        allColumns={[]}
        selectedColumns={[]}
        joinedSources={[]}
      />
    );

    expect(screen.getAllByText('greater than or equal')).toHaveLength(2);
    expect(screen.queryByText('gte')).not.toBeInTheDocument();
  });

  it('renders the Add slice picker when joined sources are available', () => {
    // Emission contract (pre-join placement, unified column id, no aliasPath) is
    // asserted in FilterOrSliceEditorPopover.test.tsx ("emits the Slice draft" test).
    // The Select mock here strips onValueChange, so driving the full add flow would
    // require a separate mock strategy that duplicates that coverage without adding value.
    const onChange = vi.fn();
    const value: OutputConfig = {
      filterConfig: [],
      sortConfig: [],
      limitConfig: null,
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={onChange}
        allColumns={[]}
        selectedColumns={[]}
        joinedSources={[
          {
            aliasPath: 'users',
            title: 'Users',
            columns: [{ id: 'users__role', name: 'role', type: 'STRING' }],
          },
        ]}
      />
    );

    expect(screen.getByText('Add slice')).toBeInTheDocument();
  });
});
