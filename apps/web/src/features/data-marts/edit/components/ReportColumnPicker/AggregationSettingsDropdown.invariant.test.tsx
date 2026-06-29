import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OutputConfig } from '../../../shared/types/output-config';
import type { ReportAggregateFunction } from '../../../shared/types/relationship.types';
import type { AggregationDraft } from './AggregationEditorPopover';

// The picker shows a business label but must hand back the RAW identifier; the
// AGG icon edits the column carried in its `column` prop. Stub both so the test
// drives the add/edit wiring directly without Radix/cmdk portals.
vi.mock('./FieldSearchPicker', () => ({
  FieldSearchPicker: ({
    items,
    placeholder,
    onSelect,
  }: {
    items: { value: string; label: string }[];
    placeholder: string;
    onSelect: (value: string) => void;
  }) => (
    <div>
      {items.map(item => (
        <button
          key={item.value}
          onClick={() => {
            onSelect(item.value);
          }}
        >
          {`${placeholder}: ${item.label}`}
        </button>
      ))}
    </div>
  ),
}));

// Stand in for the per-field popover: emit a draft selecting the FIRST TWO allowed
// functions for the `column` prop it was given. A label leak into `column` would
// surface in the stored rules; multi-select means two rules from one click.
vi.mock('./RowAggregationIcon', () => ({
  RowAggregationIcon: ({
    column,
    allowedAggregations,
    onApplyDraft,
  }: {
    column: string;
    allowedAggregations: readonly ReportAggregateFunction[];
    onApplyDraft: (draft: AggregationDraft) => void;
  }) => (
    <button
      onClick={() => {
        onApplyDraft({ functions: allowedAggregations.slice(0, 2), bucket: null, timeZone: null });
      }}
    >
      {`apply-agg:${column}`}
    </button>
  ),
}));

import {
  AggregationSettingsDropdown,
  type AggregationDropdownColumn,
} from './AggregationSettingsDropdown';

const EMPTY: OutputConfig = {
  filterConfig: [],
  sortConfig: [],
  limitConfig: null,
  aggregationConfig: [],
  dateTruncConfig: [],
  uniqueCountConfig: false,
};

// Alias differs from the raw name on purpose — that's where a leak would show.
const revenue: AggregationDropdownColumn = {
  name: 'orders.revenue',
  type: 'INTEGER',
  label: 'Revenue',
};

describe('AggregationSettingsDropdown stored-identifier + multi-select', () => {
  it('assigning two functions to one column emits TWO {column, function} rules (DoD)', () => {
    const onChange = vi.fn();
    render(
      <AggregationSettingsDropdown value={EMPTY} onChange={onChange} selectedColumns={[revenue]} />
    );

    fireEvent.click(screen.getByText('Add aggregation: Revenue'));
    fireEvent.click(screen.getByText('apply-agg:orders.revenue'));

    const cfg = onChange.mock.lastCall?.[0] as OutputConfig | undefined;
    expect(cfg?.aggregationConfig).toHaveLength(2);
    expect(cfg?.aggregationConfig.map(r => r.column)).toEqual(['orders.revenue', 'orders.revenue']);
    // Number governance default order → SUM then AVG.
    expect(cfg?.aggregationConfig.map(r => r.function)).toEqual(['SUM', 'AVG']);
    // The raw id is stored, never the business label.
    expect(cfg?.aggregationConfig.some(r => r.column === 'Revenue')).toBe(false);
  });

  it('the add-aggregation picker only offers columns with a non-empty allowed set', () => {
    const onChange = vi.fn();
    const ungovernable: AggregationDropdownColumn = {
      name: 'orders.locked',
      type: 'INTEGER',
      label: 'Locked',
      allowedAggregations: [],
    };
    render(
      <AggregationSettingsDropdown
        value={EMPTY}
        onChange={onChange}
        selectedColumns={[revenue, ungovernable]}
      />
    );

    expect(screen.getByText('Add aggregation: Revenue')).toBeInTheDocument();
    expect(screen.queryByText('Add aggregation: Locked')).not.toBeInTheDocument();
  });

  it('date-grouping section is absent from the global dialog — no "Add date grouping" picker', () => {
    const orderedAt: AggregationDropdownColumn = {
      name: 'orders.ordered_at',
      type: 'TIMESTAMP',
      label: 'Ordered At',
    };
    render(
      <AggregationSettingsDropdown value={EMPTY} onChange={vi.fn()} selectedColumns={[orderedAt]} />
    );

    expect(screen.queryByText('Add date grouping: Ordered At')).not.toBeInTheDocument();
  });
});
