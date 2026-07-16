import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AggregationEditorPopover, type AggregationDraft } from './AggregationEditorPopover';
import type { ReportAggregateFunction } from '../../../shared/types/relationship.types';

// Render popover content unconditionally — open state lives in the parent test,
// and we assert on the inner controls without Radix portals.
vi.mock('@owox/ui/components/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Drive each Select by exposing a native <select>; the popover passes an explicit
// `aria-label` so the bucket and the time-zone selects can be targeted independently.
vi.mock('@owox/ui/components/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
    'aria-label'?: string;
  }) => (
    <select
      aria-label={ariaLabel ?? 'Group by bucket'}
      value={value ?? ''}
      onChange={e => onValueChange?.(e.target.value)}
    >
      <option value='' />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const NUMERIC_ALLOWED: ReportAggregateFunction[] = ['SUM', 'AVG', 'MIN', 'MAX'];
const DATE_ALLOWED: ReportAggregateFunction[] = ['COUNT', 'COUNT_DISTINCT', 'MIN', 'MAX'];

function lastDraft(onApply: ReturnType<typeof vi.fn>): AggregationDraft | undefined {
  return onApply.mock.lastCall?.[0] as AggregationDraft | undefined;
}

describe('AggregationEditorPopover — metric multi-select', () => {
  it('checking SUM and AVG emits BOTH functions (DoD: extra output columns)', () => {
    const onApply = vi.fn();
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.revenue'
        fieldType='INTEGER'
        allowedAggregations={NUMERIC_ALLOWED}
        onApply={onApply}
      />
    );

    fireEvent.click(screen.getByLabelText('SUM'));
    fireEvent.click(screen.getByLabelText('AVG'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const draft = lastDraft(onApply);
    expect(draft?.functions).toEqual(['SUM', 'AVG']);
    expect(draft?.bucket).toBeNull();
  });

  it('unchecking a previously selected function removes it', () => {
    const onApply = vi.fn();
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.revenue'
        fieldType='INTEGER'
        allowedAggregations={NUMERIC_ALLOWED}
        initialFunctions={['SUM', 'AVG']}
        onApply={onApply}
      />
    );

    fireEvent.click(screen.getByLabelText('AVG'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const draft = lastDraft(onApply);
    expect(draft?.functions).toEqual(['SUM']);
  });
});

describe('AggregationEditorPopover — date field bucket-vs-aggregate', () => {
  it('choosing a bucket clears any aggregate functions for the column', () => {
    const onApply = vi.fn();
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.ordered_at'
        fieldType='TIMESTAMP'
        allowedAggregations={DATE_ALLOWED}
        initialFunctions={['COUNT']}
        onApply={onApply}
      />
    );

    fireEvent.change(screen.getByLabelText('Group by bucket'), { target: { value: 'WEEK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const draft = lastDraft(onApply);
    expect(draft?.bucket).toBe('WEEK');
    expect(draft?.functions).toEqual([]);
  });

  it('choosing aggregate functions clears the bucket', () => {
    const onApply = vi.fn();
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.ordered_at'
        fieldType='TIMESTAMP'
        allowedAggregations={DATE_ALLOWED}
        initialBucket='MONTH'
        onApply={onApply}
      />
    );

    fireEvent.click(screen.getByLabelText('COUNT'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const draft = lastDraft(onApply);
    expect(draft?.bucket).toBeNull();
    expect(draft?.functions).toEqual(['COUNT']);
  });
});

describe('AggregationEditorPopover — date bucket time zone', () => {
  it('shows a time-zone control once a bucket is chosen and persists the selection', () => {
    const onApply = vi.fn();
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.ordered_at'
        fieldType='TIMESTAMP'
        allowedAggregations={DATE_ALLOWED}
        initialBucket='MONTH'
        onApply={onApply}
      />
    );

    fireEvent.change(screen.getByLabelText('Time zone'), {
      target: { value: 'America/New_York' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const draft = lastDraft(onApply);
    expect(draft?.bucket).toBe('MONTH');
    expect(draft?.timeZone).toBe('America/New_York');
  });

  it('pre-fills the time zone from initialTimeZone', () => {
    const onApply = vi.fn();
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.ordered_at'
        fieldType='TIMESTAMP'
        allowedAggregations={DATE_ALLOWED}
        initialBucket='MONTH'
        initialTimeZone='Europe/Kyiv'
        onApply={onApply}
      />
    );

    expect(screen.getByLabelText('Time zone')).toHaveValue('Europe/Kyiv');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(lastDraft(onApply)?.timeZone).toBe('Europe/Kyiv');
  });

  it('clearing the bucket drops the time zone from the draft', () => {
    const onApply = vi.fn();
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.ordered_at'
        fieldType='TIMESTAMP'
        allowedAggregations={DATE_ALLOWED}
        initialBucket='MONTH'
        initialTimeZone='America/New_York'
        onApply={onApply}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear bucket' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const draft = lastDraft(onApply);
    expect(draft?.bucket).toBeNull();
    expect(draft?.timeZone).toBeNull();
  });

  it('hides the time-zone control for a pure DATE column (no time component)', () => {
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.order_date'
        fieldType='DATE'
        allowedAggregations={DATE_ALLOWED}
        initialBucket='MONTH'
        onApply={vi.fn()}
      />
    );

    // The bucket select must still be visible (bucketing without tz is valid).
    expect(screen.getByLabelText('Group by bucket')).toBeInTheDocument();
    // The timezone control must NOT be rendered for a pure DATE column.
    expect(screen.queryByLabelText('Time zone')).toBeNull();
  });

  it('shows the time-zone control for a TIMESTAMP column (has time component)', () => {
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.ordered_at'
        fieldType='TIMESTAMP'
        allowedAggregations={DATE_ALLOWED}
        initialBucket='MONTH'
        onApply={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Time zone')).toBeInTheDocument();
  });
});

describe('AggregationEditorPopover — Apply gating', () => {
  it('disables Apply for a brand-new column until a function is chosen (no silent discard)', () => {
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.revenue'
        fieldType='INTEGER'
        allowedAggregations={NUMERIC_ALLOWED}
        onApply={vi.fn()}
      />
    );

    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    fireEvent.click(screen.getByLabelText('SUM'));
    expect(apply).not.toBeDisabled();
  });

  it('disables Apply for a brand-new date column until a bucket or function is chosen', () => {
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.ordered_at'
        fieldType='TIMESTAMP'
        allowedAggregations={DATE_ALLOWED}
        onApply={vi.fn()}
      />
    );

    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Group by bucket'), { target: { value: 'WEEK' } });
    expect(apply).not.toBeDisabled();
  });

  it('keeps Apply enabled when editing an existing selection so clearing it removes the rule', () => {
    render(
      <AggregationEditorPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>open</button>}
        column='orders.revenue'
        fieldType='INTEGER'
        allowedAggregations={NUMERIC_ALLOWED}
        initialFunctions={['SUM']}
        onApply={vi.fn()}
      />
    );

    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).not.toBeDisabled();

    // Unchecking the only function leaves Apply enabled — applying the empty draft
    // is the intended "remove" path for an existing rule.
    fireEvent.click(screen.getByLabelText('SUM'));
    expect(apply).not.toBeDisabled();
  });
});
