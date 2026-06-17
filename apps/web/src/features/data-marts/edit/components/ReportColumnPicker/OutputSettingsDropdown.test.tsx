import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OutputSettingsDropdown,
  type OutputSettingsDropdownColumn,
} from './OutputSettingsDropdown';
import type { OutputConfig } from '../../../shared/types/output-config';

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
        allColumns={[{ name: 'native_one', type: 'STRING', label: 'native_one' }]}
        selectedColumns={[{ name: 'native_one', type: 'STRING', label: 'native_one' }]}
        joinedSources={[]}
      />
    );

    expect(screen.getByText('ghost_filter')).toHaveClass('line-through');
    expect(screen.getByText('old.ghost_slice')).toHaveClass('line-through');
    expect(screen.queryByText('ghost_slice')).not.toBeInTheDocument();
    expect(screen.getByText('ghost_sort')).toHaveClass('line-through');
    expect(screen.getAllByLabelText('Column not found in schema')).toHaveLength(3);
  });

  it('shows readable operator labels for stale filters and slices without a known field type', () => {
    const value: OutputConfig = {
      filterConfig: [
        { column: 'ghost_filter', operator: 'gte', value: 10 },
        {
          column: 'ghost_slice',
          operator: 'gte',
          value: 20,
          placement: 'pre-join',
          aliasPath: 'old',
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
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={() => {}}
        allColumns={[productId]}
        selectedColumns={[productId]}
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
    };

    render(
      <OutputSettingsDropdown
        value={value}
        onChange={() => {}}
        allColumns={[productId]}
        selectedColumns={[productId]}
        joinedSources={[]}
      />
    );

    expect(screen.getByText('Product ID')).toBeInTheDocument();
    expect(screen.queryByText('orders.product_id')).not.toBeInTheDocument();
  });
});
