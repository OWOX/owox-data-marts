import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  OutputSettingsDropdown,
  type OutputSettingsDropdownColumn,
} from './OutputSettingsDropdown';
import type { OutputConfig } from '../../../shared/types/output-config';

const EMPTY_CONFIG: OutputConfig = {
  filterConfig: [],
  sortConfig: [],
  limitConfig: null,
  aggregationConfig: [],
  dateTruncConfig: [],
  uniqueCountConfig: false,
};

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
      aggregationConfig: [],
      dateTruncConfig: [],
      uniqueCountConfig: false,
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={() => {}}
        allColumns={[{ name: 'native_one', type: 'STRING', label: 'native_one' }]}
        selectedColumns={[{ name: 'native_one', type: 'STRING', label: 'native_one' }]}
        hasExplicitColumns={true}
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
      aggregationConfig: [],
      dateTruncConfig: [],
      uniqueCountConfig: false,
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={() => {}}
        allColumns={[]}
        selectedColumns={[]}
        hasExplicitColumns={true}
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
      aggregationConfig: [],
      dateTruncConfig: [],
      uniqueCountConfig: false,
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={onChange}
        allColumns={[]}
        selectedColumns={[]}
        hasExplicitColumns={true}
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

describe('OutputSettingsDropdown readable labels', () => {
  const productId: OutputSettingsDropdownColumn = {
    name: 'orders.product_id',
    type: 'STRING',
    label: 'Product ID',
  };

  it('shows the business label on a live filter chip, not the raw column', () => {
    const value: OutputConfig = {
      filterConfig: [{ column: 'orders.product_id', operator: 'eq', value: 'x' }],
      sortConfig: [],
      limitConfig: null,
      aggregationConfig: [],
      dateTruncConfig: [],
      uniqueCountConfig: false,
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={() => {}}
        allColumns={[productId]}
        selectedColumns={[productId]}
        hasExplicitColumns={true}
        joinedSources={[]}
      />
    );

    expect(screen.getByText('Product ID')).toBeInTheDocument();
    // Raw column name stays in the title attribute, not the visible text.
    expect(screen.queryByText('orders.product_id')).not.toBeInTheDocument();
  });

  it('shows the business label on a live sort chip, not the raw column', () => {
    const value: OutputConfig = {
      filterConfig: [],
      sortConfig: [{ column: 'orders.product_id', direction: 'asc' }],
      limitConfig: null,
      aggregationConfig: [],
      dateTruncConfig: [],
      uniqueCountConfig: false,
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={() => {}}
        allColumns={[productId]}
        selectedColumns={[productId]}
        hasExplicitColumns={true}
        joinedSources={[]}
      />
    );

    expect(screen.getByText('Product ID')).toBeInTheDocument();
    expect(screen.queryByText('orders.product_id')).not.toBeInTheDocument();
  });
});

describe('OutputSettingsDropdown no longer hosts aggregation controls', () => {
  const revenue: OutputSettingsDropdownColumn = {
    name: 'orders.revenue',
    type: 'INTEGER',
    label: 'Revenue',
  };

  it('renders neither the aggregation add-picker nor the row-count toggle', () => {
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      aggregationConfig: [{ column: 'orders.revenue', function: 'SUM' }],
      dateTruncConfig: [{ column: 'orders.ordered_at', unit: 'WEEK' }],
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={() => {}}
        allColumns={[revenue]}
        selectedColumns={[revenue]}
        hasExplicitColumns={true}
        joinedSources={[]}
      />
    );

    expect(screen.queryByText('Add aggregation')).not.toBeInTheDocument();
    expect(screen.queryByText('Add date grouping')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add a Row Count metric')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remove aggregation')).not.toBeInTheDocument();
  });
});
