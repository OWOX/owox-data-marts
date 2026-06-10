import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RowFilterIcon } from './RowFilterIcon';
import type { FilterRule } from '../../../shared/types/output-config';

// Render popover content unconditionally — the popup open state lives inside
// RowFilterIcon, and these tests assert which popup variant gets mounted.
vi.mock('@owox/ui/components/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@owox/ui/components/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <select>{children}</select>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const filterRule = { column: 'ghost__col', operator: 'eq', value: 'x' } as FilterRule;
const sliceRule = {
  column: 'hidden_field',
  operator: 'eq',
  value: 'y',
  placement: 'pre-join',
  aliasPath: 'b',
} as FilterRule;

describe('RowFilterIcon — remove-only popup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a view-and-remove popup without tabs or editor for orphaned slices', () => {
    const onRemoveSliceAt = vi.fn();
    render(
      <RowFilterIcon
        column='hidden_field'
        fieldType='INTEGER'
        activeRules={[]}
        onRemoveAt={() => undefined}
        sliceIconProps={{
          aliasPath: 'b',
          originalFieldName: 'hidden_field',
          existingSlices: [sliceRule],
          existingSliceIndices: [3],
          onRemoveSliceAt,
        }}
      />
    );

    expect(screen.queryByRole('button', { name: 'Filter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Slice' })).not.toBeInTheDocument();
    expect(screen.getByText('Active slices')).toBeInTheDocument();
    expect(screen.queryByText('Active filters')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Apply|Add)$/ })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="text"]')).toBeNull();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('(INTEGER)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove slice' }));
    expect(onRemoveSliceAt).toHaveBeenCalledWith(3);
  });

  it('renders a view-and-remove popup listing filters without the value editor', () => {
    const onRemoveAt = vi.fn();
    render(
      <RowFilterIcon
        column='ghost__col'
        fieldType='STRING'
        activeRules={[filterRule]}
        onRemoveAt={onRemoveAt}
      />
    );

    expect(screen.getByText('Active filters')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Slice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Apply|Add)$/ })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="text"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter' }));
    expect(onRemoveAt).toHaveBeenCalledWith(0);
  });

  it('shows filters and slices together without tabs for no-access rows (nothing editable)', () => {
    render(
      <RowFilterIcon
        column='b__field'
        fieldType='STRING'
        activeRules={[filterRule]}
        onRemoveAt={() => undefined}
        sliceIconProps={{
          aliasPath: 'b',
          originalFieldName: 'field',
          existingSlices: [sliceRule],
          existingSliceIndices: [1],
          onRemoveSliceAt: () => undefined,
        }}
      />
    );

    expect(screen.getByText('Active filters')).toBeInTheDocument();
    expect(screen.getByText('Active slices')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Slice' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('keeps the tabbed editor popover when adding is allowed', () => {
    render(
      <RowFilterIcon
        column='b__field'
        fieldType='STRING'
        activeRules={[]}
        onAdd={() => undefined}
        onRemoveAt={() => undefined}
        sliceIconProps={{
          aliasPath: 'b',
          originalFieldName: 'field',
          existingSlices: [],
          existingSliceIndices: [],
          onAddSlice: () => undefined,
          onRemoveSliceAt: () => undefined,
        }}
      />
    );

    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^(Apply|Add)$/ })).toBeInTheDocument();
  });

  it('keeps the plain filter editor popover when only filters are editable', () => {
    render(
      <RowFilterIcon
        column='native_one'
        fieldType='STRING'
        activeRules={[]}
        onAdd={() => undefined}
        onRemoveAt={() => undefined}
      />
    );

    expect(screen.getByRole('button', { name: /^(Apply|Add)$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });
});
