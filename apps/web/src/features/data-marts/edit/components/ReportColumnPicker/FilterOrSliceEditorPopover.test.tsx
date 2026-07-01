import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FilterOrSliceEditorPopover } from './FilterOrSliceEditorPopover';

// Radix Popover renders into a portal; mock to a passthrough that just renders
// `children` when `open` is true. That lets RTL query the popover content
// directly without portal/positioning machinery.
vi.mock('@owox/ui/components/popover', () => ({
  Popover: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <>{children}</> : null,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Radix Select with a native <select> so RTL can fire change events on it.
// FilterValueEditor uses <Select> to pick the operator; without this mock the
// happy-dom render can't drive it.
vi.mock('@owox/ui/components/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select
      data-testid='operator-select'
      value={value}
      onChange={e => {
        onValueChange?.(e.target.value);
      }}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

describe('FilterOrSliceEditorPopover — parallel drafts across tab switches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the Filter-tab draft when the user switches to Slice and back', () => {
    // Regression for the commit-pinned bug where the popover mounted a single
    // FilterValueEditor and swapped its `initialRule` prop based on the active
    // tab — that swap re-triggered the editor's `useEffect`, wiping mid-edit
    // state. The fix mounts two editors and hides the inactive one.
    render(
      <FilterOrSliceEditorPopover
        open={true}
        onOpenChange={() => undefined}
        column='users__userRole'
        sliceColumn='users__userRole'
        fieldType='STRING'
        defaultTab='filter'
        trigger={<button>trigger</button>}
        filterProps={{
          onApply: vi.fn(),
          existingRules: [],
        }}
        sliceProps={{
          onApply: vi.fn(),
          existingSlicesForColumn: [],
        }}
      />
    );

    // FilterValueEditor renders multiple inputs; the scalar `value` input is
    // the one without a placeholder. Both Filter and Slice editors render
    // their inputs simultaneously (the inactive tab is under `.hidden`); the
    // helper picks the currently visible one.
    const filterValueInput = findVisibleScalarInput();

    // Type into the Filter tab.
    act(() => {
      fireEvent.change(filterValueInput, { target: { value: 'admin-filter' } });
    });
    expect(filterValueInput.value).toBe('admin-filter');

    // Switch to Slice tab.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Slice' }));
    });

    // The visible scalar input is now the Slice tab's editor — should be empty.
    const sliceValueInput = findVisibleScalarInput();
    expect(sliceValueInput).not.toBe(filterValueInput);
    expect(sliceValueInput.value).toBe('');

    // Type into the Slice tab.
    act(() => {
      fireEvent.change(sliceValueInput, { target: { value: 'admin-slice' } });
    });
    expect(sliceValueInput.value).toBe('admin-slice');

    // Switch back to Filter tab.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    });

    // Filter draft must still hold 'admin-filter' — NOT be reset to empty.
    const filterValueInputAfter = findVisibleScalarInput();
    expect(filterValueInputAfter.value).toBe('admin-filter');

    // And switching back to Slice keeps 'admin-slice' too.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Slice' }));
    });
    const sliceValueInputAfter = findVisibleScalarInput();
    expect(sliceValueInputAfter.value).toBe('admin-slice');
  });

  it('emits the Filter draft via filterProps.onApply when Apply is clicked on Filter tab', () => {
    const filterOnApply = vi.fn();
    const sliceOnApply = vi.fn();

    render(
      <FilterOrSliceEditorPopover
        open={true}
        onOpenChange={() => undefined}
        column='users__userRole'
        sliceColumn='users__userRole'
        fieldType='STRING'
        defaultTab='filter'
        trigger={<button>trigger</button>}
        filterProps={{ onApply: filterOnApply, existingRules: [] }}
        sliceProps={{ onApply: sliceOnApply, existingSlicesForColumn: [] }}
      />
    );

    act(() => {
      fireEvent.change(findVisibleScalarInput(), { target: { value: 'admin' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Apply|Add/ }));
    });

    expect(filterOnApply).toHaveBeenCalledTimes(1);
    const emitted = filterOnApply.mock.calls[0][0];
    expect(emitted).toMatchObject({ column: 'users__userRole', operator: 'eq', value: 'admin' });
    // No pre-join injection on the filter side.
    expect(emitted.placement).toBeUndefined();
    expect(emitted.aliasPath).toBeUndefined();
    expect(sliceOnApply).not.toHaveBeenCalled();
  });

  it('emits the Slice draft with placement="pre-join" and unified column when applied on Slice tab', () => {
    const filterOnApply = vi.fn();
    const sliceOnApply = vi.fn();

    render(
      <FilterOrSliceEditorPopover
        open={true}
        onOpenChange={() => undefined}
        column='users__userRole'
        sliceColumn='users__userRole'
        fieldType='STRING'
        defaultTab='slice'
        trigger={<button>trigger</button>}
        filterProps={{ onApply: filterOnApply, existingRules: [] }}
        sliceProps={{ onApply: sliceOnApply, existingSlicesForColumn: [] }}
      />
    );

    act(() => {
      fireEvent.change(findVisibleScalarInput(), { target: { value: 'admin' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Apply|Add/ }));
    });

    expect(sliceOnApply).toHaveBeenCalledTimes(1);
    const emitted = sliceOnApply.mock.calls[0][0];
    // Popover must inject placement and override column with the unified name.
    expect(emitted).toMatchObject({
      column: 'users__userRole',
      operator: 'eq',
      value: 'admin',
      placement: 'pre-join',
    });
    expect(emitted.aliasPath).toBeUndefined();
    expect(filterOnApply).not.toHaveBeenCalled();
  });
});

// Returns the value <input> whose enclosing wrapper isn't marked `.hidden`.
// Both Filter and Slice editors render their value input simultaneously while
// the popover is open; we only want the one currently visible.
function findVisibleScalarInput(): HTMLInputElement {
  const inputs = document.querySelectorAll('input[type="text"]');
  for (const el of Array.from(inputs)) {
    const wrapper = el.closest('.hidden');
    if (!wrapper) return el as HTMLInputElement;
  }
  throw new Error('No visible scalar input found in popover');
}
