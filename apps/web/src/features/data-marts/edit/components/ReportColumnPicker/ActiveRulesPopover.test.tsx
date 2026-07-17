import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActiveRulesPopover } from './ActiveRulesPopover';
import type { FilterRule } from '../../../shared/types/output-config';

// Radix Popover renders into a portal; mock to a passthrough that renders
// `children` when `open` is true so RTL can query the popover content directly.
vi.mock('@owox/ui/components/popover', () => ({
  Popover: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <>{children}</> : null,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const sliceRule: FilterRule = {
  column: 'traffic__campaign',
  operator: 'eq',
  value: 'brand',
  placement: 'pre-join',
};
const filterRule: FilterRule = {
  column: 'traffic__campaign',
  operator: 'eq',
  value: 'brand',
  placement: 'post-join',
};

// A joined field deduped by COUNT: effective type INTEGER, raw pre-join type STRING.
// 'eq' renders as "equals" for INTEGER and "is" for STRING — a type-divergent label
// that proves which type each section is labelled against.
describe('ActiveRulesPopover — slices use the raw pre-join type for labels', () => {
  it('labels a slice rule with the raw sliceFieldType, not the effective fieldType', () => {
    render(
      <ActiveRulesPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>trigger</button>}
        column='traffic__campaign'
        fieldType='INTEGER'
        sliceFieldType='STRING'
        sliceColumn='traffic__campaign'
        slices={{ rules: [sliceRule], onRemoveAt: () => undefined }}
      />
    );
    expect(screen.getByText('is')).toBeInTheDocument();
    expect(screen.queryByText('equals')).not.toBeInTheDocument();
  });

  it('labels filters by the effective type and slices by the raw type at the same time', () => {
    render(
      <ActiveRulesPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>trigger</button>}
        column='traffic__campaign'
        fieldType='INTEGER'
        sliceFieldType='STRING'
        sliceColumn='traffic__campaign'
        filters={{ rules: [filterRule], onRemoveAt: () => undefined }}
        slices={{ rules: [sliceRule], onRemoveAt: () => undefined }}
      />
    );
    expect(screen.getByText('equals')).toBeInTheDocument(); // post-join filter, effective INTEGER
    expect(screen.getByText('is')).toBeInTheDocument(); // pre-join slice, raw STRING
  });

  it('falls back to fieldType for slice labels when sliceFieldType is absent', () => {
    render(
      <ActiveRulesPopover
        open
        onOpenChange={() => undefined}
        trigger={<button>trigger</button>}
        column='traffic__campaign'
        fieldType='STRING'
        sliceColumn='traffic__campaign'
        slices={{ rules: [sliceRule], onRemoveAt: () => undefined }}
      />
    );
    expect(screen.getByText('is')).toBeInTheDocument();
  });
});
