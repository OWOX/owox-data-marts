import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AggregationSettingsDropdown,
  type AggregationDropdownColumn,
} from './AggregationSettingsDropdown';
import type { OutputConfig } from '../../../shared/types/output-config';

const EMPTY_CONFIG: OutputConfig = {
  filterConfig: [],
  sortConfig: [],
  limitConfig: null,
  aggregationConfig: [],
  dateTruncConfig: [],
  uniqueCountConfig: false,
};

const revenue: AggregationDropdownColumn = {
  name: 'orders.revenue',
  type: 'INTEGER',
  label: 'Revenue',
};
const orderedAt: AggregationDropdownColumn = {
  name: 'orders.ordered_at',
  type: 'TIMESTAMP',
  label: 'Ordered At',
};

describe('AggregationSettingsDropdown chips', () => {
  it('renders one chip per {column, function} — two functions on a column → two chips', () => {
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      aggregationConfig: [
        { column: 'orders.revenue', function: 'SUM' },
        { column: 'orders.revenue', function: 'AVG' },
      ],
    };

    render(
      <AggregationSettingsDropdown value={value} onChange={() => {}} selectedColumns={[revenue]} />
    );

    expect(screen.getAllByText('Revenue')).toHaveLength(2);
    expect(screen.getByText('Sum')).toBeInTheDocument();
    expect(screen.getByText('Average')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Remove aggregation')).toHaveLength(2);
  });

  it('removing one chip leaves the other function intact', () => {
    const onChange = vi.fn();
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      aggregationConfig: [
        { column: 'orders.revenue', function: 'SUM' },
        { column: 'orders.revenue', function: 'AVG' },
      ],
    };

    render(
      <AggregationSettingsDropdown value={value} onChange={onChange} selectedColumns={[revenue]} />
    );

    // Remove the first chip (SUM).
    fireEvent.click(screen.getAllByLabelText('Remove aggregation')[0]);

    const cfg = onChange.mock.lastCall?.[0] as OutputConfig | undefined;
    expect(cfg?.aggregationConfig).toEqual([{ column: 'orders.revenue', function: 'AVG' }]);
  });

  it('does not surface the group-by hint even when some metric columns are un-aggregated', () => {
    const margin: AggregationDropdownColumn = {
      name: 'orders.margin',
      type: 'INTEGER',
      label: 'Margin',
    };
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      aggregationConfig: [{ column: 'orders.revenue', function: 'SUM' }],
    };

    render(
      <AggregationSettingsDropdown
        value={value}
        onChange={() => {}}
        selectedColumns={[revenue, margin]}
      />
    );

    expect(
      screen.queryByText('Other metrics will be grouped, not aggregated.')
    ).not.toBeInTheDocument();
  });

  it('renders a date-bucket row alongside the aggregation rows', () => {
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      aggregationConfig: [{ column: 'orders.revenue', function: 'SUM' }],
      dateTruncConfig: [{ column: 'orders.ordered_at', unit: 'WEEK' }],
    };

    render(
      <AggregationSettingsDropdown
        value={value}
        onChange={() => {}}
        selectedColumns={[revenue, orderedAt]}
      />
    );

    expect(screen.getByText('Ordered At')).toBeInTheDocument();
    expect(screen.getByText('WEEK')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove date bucket')).toBeInTheDocument();
    // The aggregation row is still there too.
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Sum')).toBeInTheDocument();
  });

  it('removing the date-bucket row clears it from dateTruncConfig', () => {
    const onChange = vi.fn();
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      dateTruncConfig: [{ column: 'orders.ordered_at', unit: 'WEEK' }],
    };

    render(
      <AggregationSettingsDropdown
        value={value}
        onChange={onChange}
        selectedColumns={[orderedAt]}
      />
    );

    fireEvent.click(screen.getByLabelText('Remove date bucket'));

    const cfg = onChange.mock.lastCall?.[0] as OutputConfig | undefined;
    expect(cfg?.dateTruncConfig).toEqual([]);
  });

  it('does not re-offer a bucketed date column in the add-aggregation picker', () => {
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      dateTruncConfig: [{ column: 'orders.ordered_at', unit: 'WEEK' }],
    };

    render(
      <AggregationSettingsDropdown
        value={value}
        onChange={() => {}}
        selectedColumns={[orderedAt]}
      />
    );

    expect(screen.getByText('No aggregatable columns.')).toBeInTheDocument();
  });

  it('does not render a Row Count toggle — Row Count is automatic for aggregated reports', () => {
    render(
      <AggregationSettingsDropdown
        value={EMPTY_CONFIG}
        onChange={() => {}}
        selectedColumns={[revenue]}
      />
    );

    expect(screen.queryByLabelText('Add a Row Count metric')).not.toBeInTheDocument();
    expect(screen.queryByText('Row count')).not.toBeInTheDocument();
  });

  it('shows an automatic Row Count hint when aggregationConfig is non-empty', () => {
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      aggregationConfig: [{ column: 'orders.revenue', function: 'SUM' }],
    };

    render(
      <AggregationSettingsDropdown value={value} onChange={() => {}} selectedColumns={[revenue]} />
    );

    expect(
      screen.getByText('A Row Count column is included automatically in aggregated reports.')
    ).toBeInTheDocument();
  });

  it('does not show the Row Count hint when there are no aggregations', () => {
    render(
      <AggregationSettingsDropdown
        value={EMPTY_CONFIG}
        onChange={() => {}}
        selectedColumns={[revenue]}
      />
    );

    expect(
      screen.queryByText('A Row Count column is included automatically in aggregated reports.')
    ).not.toBeInTheDocument();
  });

  it('shows the Row Count hint when only a date bucket is set (no aggregation function)', () => {
    // Regression lock: a lone date bucket makes the report grouped, so Row Count is automatic.
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      aggregationConfig: [],
      dateTruncConfig: [{ column: 'orders.ordered_at', unit: 'WEEK' }],
    };

    render(
      <AggregationSettingsDropdown
        value={value}
        onChange={() => {}}
        selectedColumns={[orderedAt]}
      />
    );

    expect(
      screen.getByText('A Row Count column is included automatically in aggregated reports.')
    ).toBeInTheDocument();
  });
});
