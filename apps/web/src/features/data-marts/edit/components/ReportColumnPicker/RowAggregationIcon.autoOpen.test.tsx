import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RowAggregationIcon } from './RowAggregationIcon';
import type { ReportAggregateFunction } from '../../../shared/types/relationship.types';

// Unlike the sibling spec, this mock EXPOSES the controlled `open` prop (as data-open)
// so we can assert the auto-open behaviour of the dropdown's pending "add" entry —
// the whole point of item #6733.3 ("the Aggregation block does not show on first invoke").
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

const NUMERIC_ALLOWED: ReportAggregateFunction[] = ['SUM', 'AVG'];

describe('RowAggregationIcon — autoOpen / onClose (pending add entry)', () => {
  it('mounts the editor already open when autoOpen is set', () => {
    render(
      <RowAggregationIcon
        column='orders.revenue'
        fieldType='INTEGER'
        allowedAggregations={NUMERIC_ALLOWED}
        activeFunctions={[]}
        activeBucket={null}
        alwaysVisible
        autoOpen
        onApplyDraft={() => undefined}
      />
    );

    expect(screen.getByTestId('agg-popover')).toHaveAttribute('data-open', 'true');
  });

  it('mounts closed when autoOpen is not set (default)', () => {
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

    expect(screen.getByTestId('agg-popover')).toHaveAttribute('data-open', 'false');
  });

  it('fires onClose when the editor is dismissed via Cancel (so the pending column can reset)', () => {
    const onClose = vi.fn();
    render(
      <RowAggregationIcon
        column='orders.revenue'
        fieldType='INTEGER'
        allowedAggregations={NUMERIC_ALLOWED}
        activeFunctions={[]}
        activeBucket={null}
        alwaysVisible
        autoOpen
        onClose={onClose}
        onApplyDraft={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('agg-popover')).toHaveAttribute('data-open', 'false');
  });

  it('fires onClose after applying a draft (Apply also closes the editor)', () => {
    const onClose = vi.fn();
    const onApplyDraft = vi.fn();
    render(
      <RowAggregationIcon
        column='orders.revenue'
        fieldType='INTEGER'
        allowedAggregations={NUMERIC_ALLOWED}
        activeFunctions={[]}
        activeBucket={null}
        alwaysVisible
        autoOpen
        onClose={onClose}
        onApplyDraft={onApplyDraft}
      />
    );

    fireEvent.click(screen.getByLabelText('SUM'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApplyDraft).toHaveBeenCalledWith({ functions: ['SUM'], bucket: null, timeZone: null });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
