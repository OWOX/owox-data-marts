import { Children, isValidElement, type ReactNode } from 'react';

/**
 * Module shape for `vi.mock('@owox/ui/components/select', selectAsNativeElement)`.
 *
 * Radix's Select is a button plus a portalled listbox and does not open under the test
 * environment's pointer events, so a test cannot pick an option from the real control.
 * Rendering a native `<select>` instead keeps `fireEvent.change(el, { target: { value } })`
 * working and keeps the assertions about what the editor WRITES, rather than about Radix's
 * internals. The repo already does this per-file (see DataMartRelationshipsContent.test);
 * this is the same shim in one place, for the four builder suites that need it.
 *
 * The accessible name lives on `SelectTrigger` in the real markup, so it is lifted onto the
 * native element here — otherwise every mocked select would be nameless.
 */
export function selectAsNativeElement() {
  const triggerLabel = (children: ReactNode): string | undefined => {
    let label: string | undefined;
    Children.forEach(children, child => {
      if (isValidElement(child)) {
        const ariaLabel = (child.props as Record<string, unknown>)['aria-label'];
        if (typeof ariaLabel === 'string') label ??= ariaLabel;
      }
    });
    return label;
  };

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children?: ReactNode;
    }) => (
      <select
        aria-label={triggerLabel(children)}
        value={value}
        onChange={event => {
          onValueChange(event.target.value);
        }}
      >
        {children}
      </select>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectGroup: ({ children }: { children?: ReactNode }) => children,
    SelectContent: ({ children }: { children?: ReactNode }) => children,
    SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
}
