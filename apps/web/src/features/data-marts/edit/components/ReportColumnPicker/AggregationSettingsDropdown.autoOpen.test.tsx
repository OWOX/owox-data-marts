import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AggregationSettingsDropdown,
  type AggregationDropdownColumn,
} from './AggregationSettingsDropdown';
import type { OutputConfig } from '../../../shared/types/output-config';

// Integration coverage for #6733.3: selecting a column from the "Add aggregation"
// picker must open the editor IMMEDIATELY (no second click). The leaf FieldSearchPicker
// (Radix Popover + cmdk) is exercised by its own tests; here we stub it down to a plain
// onSelect trigger so we can drive the container's pending → auto-open wiring, and expose
// the popover `open` state so the auto-open is observable.
vi.mock('./FieldSearchPicker', () => ({
  FieldSearchPicker: ({
    items,
    onSelect,
  }: {
    items: { value: string; label: string }[];
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
          add:{item.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@owox/ui/components/popover', () => ({
  Popover: ({ open, children }: { open?: boolean; children: React.ReactNode }) => (
    <div data-testid='agg-popover' data-open={String(Boolean(open))}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@owox/ui/components/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <select>{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

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
const margin: AggregationDropdownColumn = {
  name: 'orders.margin',
  type: 'INTEGER',
  label: 'Margin',
};

describe('AggregationSettingsDropdown — pending column auto-opens the editor (#6733.3)', () => {
  it('opens the aggregation editor immediately after picking a column (no second click)', () => {
    render(
      <AggregationSettingsDropdown
        value={EMPTY_CONFIG}
        onChange={() => undefined}
        selectedColumns={[revenue]}
      />
    );

    // No editor popover is mounted until a column is picked.
    expect(screen.queryByTestId('agg-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'add:Revenue' }));

    // The pending column now renders the editor already open — the whole point of the fix.
    expect(screen.getByTestId('agg-popover')).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  it('resets the pending column (back to the picker) when the editor is dismissed via Cancel', () => {
    render(
      <AggregationSettingsDropdown
        value={EMPTY_CONFIG}
        onChange={() => undefined}
        selectedColumns={[revenue, margin]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'add:Margin' }));
    expect(screen.getByTestId('agg-popover')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // onClose → setPendingColumn(null) → the picker comes back (both columns addable again).
    expect(screen.queryByTestId('agg-popover')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'add:Revenue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'add:Margin' })).toBeInTheDocument();
  });

  it('applies the picked column and returns to the picker', () => {
    const onChange = vi.fn();
    render(
      <AggregationSettingsDropdown
        value={EMPTY_CONFIG}
        onChange={onChange}
        selectedColumns={[revenue]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'add:Revenue' }));
    fireEvent.click(screen.getByLabelText('SUM'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const cfg = onChange.mock.lastCall?.[0] as OutputConfig | undefined;
    expect(cfg?.aggregationConfig).toEqual([{ column: 'orders.revenue', function: 'SUM' }]);
    // Editor closed; picker restored.
    expect(screen.queryByTestId('agg-popover')).not.toBeInTheDocument();
  });
});
