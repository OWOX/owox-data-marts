import { render, screen, fireEvent, within } from '@testing-library/react';
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
  uniqueCountConfig: [],
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

  it('does not render a Row Count toggle or hint — Row Count is no longer added to reports', () => {
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

  it('shows no automatic Row Count hint even when aggregationConfig is non-empty', () => {
    // A report contains only the columns the user selected — nothing is appended, so
    // there is nothing to hint about.
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

    expect(
      screen.queryByText('A Row Count column is included automatically in aggregated reports.')
    ).not.toBeInTheDocument();
  });
});

// The date bucket is a GROUPING key, so it is offered per LEVEL, not per calculated-ness: a
// row-level formula is a dimension and buckets like the DATE column beside it, while an
// aggregate-level one already aggregates and can never be grouped by. Permanent, not a slice
// limit — so the caller's flag must survive any later "calculated fields bucket now" cleanup.
describe('AggregationSettingsDropdown — the date bucket follows the calculated level', () => {
  const aggregateLevelDay: AggregationDropdownColumn = {
    name: 'last_seen',
    type: 'TIMESTAMP',
    label: 'Last Seen',
    allowedAggregations: ['MIN', 'MAX'],
    isAggregateLevelCalculated: true,
  };
  const rowLevelDay: AggregationDropdownColumn = {
    name: 'session_day',
    type: 'TIMESTAMP',
    label: 'Session Day',
    allowedAggregations: ['MIN', 'MAX'],
  };

  const openAddPicker = () => {
    const trigger = screen
      .getAllByRole('button', { name: /Add aggregation/ })
      .find(b => b.getAttribute('aria-haspopup') === 'listbox');
    fireEvent.click(trigger!);
  };

  it('withholds the bucket from an aggregate-level column when its rule is edited', async () => {
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      aggregationConfig: [{ column: 'last_seen', function: 'MIN' }],
    };

    render(
      <AggregationSettingsDropdown
        value={value}
        onChange={() => {}}
        selectedColumns={[aggregateLevelDay]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit aggregation' }));

    // The editor really opened — the date type's own menu is there, only the bucket is not.
    expect(await screen.findByLabelText('MIN')).toBeInTheDocument();
    expect(screen.queryByLabelText('Group by bucket')).not.toBeInTheDocument();
  });

  it('offers it to a row-level column whose rule is edited', async () => {
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      aggregationConfig: [{ column: 'session_day', function: 'MIN' }],
    };

    render(
      <AggregationSettingsDropdown
        value={value}
        onChange={() => {}}
        selectedColumns={[rowLevelDay]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit aggregation' }));

    expect(await screen.findByLabelText('Group by bucket')).toBeInTheDocument();
  });

  it('withholds it from an aggregate-level column picked from the add picker', async () => {
    render(
      <AggregationSettingsDropdown
        value={EMPTY_CONFIG}
        onChange={() => {}}
        selectedColumns={[aggregateLevelDay]}
      />
    );
    openAddPicker();
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('Last Seen'));

    expect(await screen.findByLabelText('MIN')).toBeInTheDocument();
    expect(screen.queryByLabelText('Group by bucket')).not.toBeInTheDocument();
  });

  it('offers it to a row-level column picked from the add picker', async () => {
    render(
      <AggregationSettingsDropdown
        value={EMPTY_CONFIG}
        onChange={() => {}}
        selectedColumns={[rowLevelDay]}
      />
    );
    openAddPicker();
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('Session Day'));

    expect(await screen.findByLabelText('Group by bucket')).toBeInTheDocument();
  });
});

// The time zone follows CALCULATED-ness rather than the level, which is the one place
// these two flags part company: a row-level formula buckets like the TIMESTAMP column beside it and
// is still refused the zone. Measured on Snowflake — `CONVERT_TIMEZONE` coerced the formula's
// `05/08/2026` and bucketed the report into May, where it means the 5th of August.
describe('AggregationSettingsDropdown — a calculated bucket carries no time zone', () => {
  const calculatedDay: AggregationDropdownColumn = {
    name: 'session_day',
    type: 'TIMESTAMP',
    label: 'Session Day',
    allowedAggregations: ['MIN', 'MAX'],
    isCalculated: true,
  };
  const warehouseDay: AggregationDropdownColumn = {
    name: 'visit_ts',
    type: 'TIMESTAMP',
    label: 'Visit Ts',
    allowedAggregations: ['MIN', 'MAX'],
  };

  it('withholds the time zone while keeping the bucket, editing a calculated bucket rule', async () => {
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      dateTruncConfig: [{ column: 'session_day', unit: 'MONTH' }],
    };

    render(
      <AggregationSettingsDropdown
        value={value}
        onChange={() => {}}
        selectedColumns={[calculatedDay]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit date bucket' }));

    expect(await screen.findByLabelText('Group by bucket')).toBeInTheDocument();
    expect(screen.queryByLabelText('Time zone')).not.toBeInTheDocument();
  });

  it('keeps offering it on an ordinary TIMESTAMP column', async () => {
    const value: OutputConfig = {
      ...EMPTY_CONFIG,
      dateTruncConfig: [{ column: 'visit_ts', unit: 'MONTH' }],
    };

    render(
      <AggregationSettingsDropdown
        value={value}
        onChange={() => {}}
        selectedColumns={[warehouseDay]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit date bucket' }));

    expect(await screen.findByLabelText('Time zone')).toBeInTheDocument();
  });
});
