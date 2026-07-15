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
  column: 'b__hidden_field',
  operator: 'eq',
  value: 'y',
  placement: 'pre-join',
} as FilterRule;

describe('RowFilterIcon — remove-only popup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a view-and-remove popup without tabs or editor for orphaned slices', () => {
    const onRemoveSliceAt = vi.fn();
    render(
      <RowFilterIcon
        column='b__hidden_field'
        fieldType='INTEGER'
        activeRules={[]}
        onRemoveAt={() => undefined}
        sliceIconProps={{
          unifiedFieldName: 'b__hidden_field',
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
    expect(screen.getByText('b__hidden_field')).toBeInTheDocument();
    expect(screen.queryByText('(INTEGER)')).not.toBeInTheDocument();
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

  it('keeps an active filter icon always visible as a configured-state indicator', () => {
    render(
      <RowFilterIcon
        column='ghost__col'
        fieldType='STRING'
        activeRules={[filterRule]}
        onRemoveAt={vi.fn()}
      />
    );
    const btn = screen.getByRole('button', { name: 'Manage filters and slices' });
    expect(btn.className).toMatch(/text-blue-500/);
    expect(btn.className).toMatch(/opacity-100/);
    expect(btn.className).not.toMatch(/opacity-0/);
    expect(btn.className).not.toMatch(/group-hover/);
  });

  it('hides an inactive filter add-affordance until the row is hovered', () => {
    render(
      <RowFilterIcon
        column='native_one'
        fieldType='STRING'
        activeRules={[]}
        onAdd={() => undefined}
        onRemoveAt={() => undefined}
      />
    );
    const btn = screen.getByRole('button', { name: 'Add filter' });
    expect(btn.className).toMatch(/opacity-0/);
    // Named group (/row) scopes the reveal to this row, not the ancestor FormItem `group`.
    expect(btn.className).toMatch(/group-hover\/row:opacity-100/);
  });

  it('shows filters and slices together without tabs for no-access rows (nothing editable)', () => {
    render(
      <RowFilterIcon
        column='b__field'
        fieldType='STRING'
        activeRules={[filterRule]}
        onRemoveAt={() => undefined}
        sliceIconProps={{
          unifiedFieldName: 'b__field',
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
          unifiedFieldName: 'b__field',
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

  it('editing a single existing filter exposes a Delete filter button that removes it', () => {
    const onRemoveAt = vi.fn();
    render(
      <RowFilterIcon
        column='native_one'
        fieldType='STRING'
        activeRules={[filterRule]}
        onAdd={() => undefined}
        onReplaceAt={() => undefined}
        onRemoveAt={onRemoveAt}
      />
    );

    // Single-filter edit mode renders the editor (no "Active filters" list), so the
    // delete affordance must live in the editor header.
    expect(screen.queryByText('Active filters')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete filter' }));
    expect(onRemoveAt).toHaveBeenCalledWith(0);
  });

  it('does not show a Delete filter button when adding a new filter (nothing to delete)', () => {
    render(
      <RowFilterIcon
        column='native_one'
        fieldType='STRING'
        activeRules={[]}
        onAdd={() => undefined}
        onReplaceAt={() => undefined}
        onRemoveAt={() => undefined}
      />
    );

    expect(screen.queryByRole('button', { name: 'Delete filter' })).not.toBeInTheDocument();
  });

  it('editing a single existing slice exposes a Delete slice button that removes it', () => {
    const onRemoveSliceAt = vi.fn();
    render(
      <RowFilterIcon
        column='b__hidden_field'
        fieldType='STRING'
        activeRules={[]}
        onAdd={() => undefined}
        onRemoveAt={() => undefined}
        sliceIconProps={{
          unifiedFieldName: 'b__hidden_field',
          existingSlices: [sliceRule],
          existingSliceIndices: [3],
          onAddSlice: () => undefined,
          onRemoveSliceAt,
          onReplaceSliceAt: () => undefined,
        }}
      />
    );

    // Slice tab is the default here (no filters, one slice) and opens in edit mode.
    expect(screen.queryByText('Active slices')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete slice' }));
    expect(onRemoveSliceAt).toHaveBeenCalledWith(3);
  });
});
