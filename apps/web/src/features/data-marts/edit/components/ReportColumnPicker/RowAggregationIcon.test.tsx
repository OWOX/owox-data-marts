import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RowAggregationIcon } from './RowAggregationIcon';
import type { ReportAggregateFunction } from '../../../shared/types/relationship.types';
import type { AggregationDraft } from './AggregationEditorPopover';

// Render popover content unconditionally so we can assert on inner controls.
vi.mock('@owox/ui/components/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

const NUMERIC_ALLOWED: ReportAggregateFunction[] = ['SUM', 'AVG'];

describe('RowAggregationIcon', () => {
  it('labels the trigger "Add aggregation" when nothing is assigned', () => {
    render(
      <RowAggregationIcon
        column='orders.revenue'
        fieldType='INTEGER'
        allowedAggregations={NUMERIC_ALLOWED}
        activeFunctions={[]}
        activeBucket={null}
        onApplyDraft={() => undefined}
      />
    );

    expect(screen.getByRole('button', { name: 'Add aggregation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage aggregations' })).not.toBeInTheDocument();
    // An inactive (gray) icon is an add-affordance: hidden until THIS row is hovered.
    // The named group (/row) scopes the reveal to the row, not the ancestor FormItem `group`.
    const btn = screen.getByRole('button', { name: 'Add aggregation' });
    expect(btn.className).toMatch(/opacity-0/);
    expect(btn.className).toMatch(/group-hover\/row:opacity-100/);
  });

  it('labels the trigger "Manage aggregations" and shows NO count number when 2 functions are assigned', () => {
    render(
      <RowAggregationIcon
        column='orders.revenue'
        fieldType='INTEGER'
        allowedAggregations={NUMERIC_ALLOWED}
        activeFunctions={['SUM', 'AVG']}
        activeBucket={null}
        onApplyDraft={() => undefined}
      />
    );

    expect(screen.getByRole('button', { name: 'Manage aggregations' })).toBeInTheDocument();
    // Sigma is present and the button is active (blue class), but no count number rendered.
    const btn = screen.getByRole('button', { name: 'Manage aggregations' });
    expect(btn.className).toMatch(/text-blue-500/);
    // An active (blue) icon stays visible as a configured-state indicator — only the
    // gray add-affordance icons are hover-gated (the "christmas tree" was inactive icons).
    expect(btn.className).toMatch(/opacity-100/);
    expect(btn.className).not.toMatch(/opacity-0/);
    expect(btn.className).not.toMatch(/group-hover/);
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('stays visible while inactive when alwaysVisible is set (standalone editor trigger)', () => {
    render(
      <RowAggregationIcon
        column='orders.revenue'
        fieldType='INTEGER'
        allowedAggregations={NUMERIC_ALLOWED}
        activeFunctions={[]}
        activeBucket={null}
        alwaysVisible
        onApplyDraft={() => undefined}
      />
    );

    // Used outside a `group/row` list (the Aggregations dropdown's "add" trigger):
    // it must not be hover-gated, or it would be invisible with no row to hover.
    const btn = screen.getByRole('button', { name: 'Add aggregation' });
    expect(btn.className).toMatch(/opacity-100/);
    expect(btn.className).not.toMatch(/opacity-0/);
    expect(btn.className).not.toMatch(/group-hover/);
  });

  it('carries the raw column id (not the label) into the applied draft', () => {
    const onApplyDraft = vi.fn<(draft: AggregationDraft) => void>();
    render(
      <RowAggregationIcon
        column='orders.revenue'
        fieldType='INTEGER'
        displayLabel='Revenue'
        allowedAggregations={NUMERIC_ALLOWED}
        activeFunctions={[]}
        activeBucket={null}
        onApplyDraft={onApplyDraft}
      />
    );

    fireEvent.click(screen.getByLabelText('SUM'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApplyDraft).toHaveBeenCalledWith({ functions: ['SUM'], bucket: null, timeZone: null });
    // The header shows the readable label, but the column id is what's stored upstream.
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });
});
