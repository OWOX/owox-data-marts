import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { FilterRule } from '../../../shared/types/output-config';
import { FilterValueEditor } from './FilterValueEditor';

type OnChangeMock = Mock<(rule: FilterRule | null) => void>;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Radix Select with native <select> so RTL can fireEvent.change
vi.mock('@owox/ui/components/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select
      data-testid='select'
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COL = 'name';
const STRING_TYPE = 'STRING';
const INT_TYPE = 'INTEGER';
const DATE_TYPE = 'DATE';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RenderOptions {
  column?: string;
  fieldType?: string;
  initialRule?: FilterRule;
  onChange?: OnChangeMock;
}

function renderEditor({
  column = COL,
  fieldType = STRING_TYPE,
  initialRule,
  onChange = vi.fn<(rule: FilterRule | null) => void>(),
}: RenderOptions = {}) {
  render(
    <FilterValueEditor
      column={column}
      fieldType={fieldType}
      initialRule={initialRule}
      onChange={onChange}
    />
  );
  return { onChange };
}

/** Returns the arg of the most recent onChange call. */
function lastCall(onChange: OnChangeMock): FilterRule | null | undefined {
  const calls = onChange.mock.calls;
  if (calls.length === 0) return undefined;
  return calls[calls.length - 1][0];
}

/** Returns the condition <select> element (first select in the DOM). */
function getConditionSelect() {
  return screen.getAllByTestId('select')[0];
}

/** Returns the second select element (preset select for relative_date). */
function getPresetSelect() {
  return screen.getAllByTestId('select')[1];
}

// ---------------------------------------------------------------------------
// Group 1 — onChange on mount
// ---------------------------------------------------------------------------

describe('FilterValueEditor — onChange on mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits null on mount when no initialRule (default op is scalar, value empty)', () => {
    const onChange = vi.fn();
    act(() => {
      render(<FilterValueEditor column={COL} fieldType={STRING_TYPE} onChange={onChange} />);
    });

    // Default operator for STRING is 'eq' — scalar op, empty value → null
    expect(lastCall(onChange)).toBeNull();
  });

  it('emits the initialRule on mount when initialRule is provided', () => {
    const initialRule: FilterRule = { column: COL, operator: 'eq', value: 'hello' };
    const onChange = vi.fn();
    act(() => {
      render(
        <FilterValueEditor
          column={COL}
          fieldType={STRING_TYPE}
          initialRule={initialRule}
          onChange={onChange}
        />
      );
    });

    expect(lastCall(onChange)).toEqual(initialRule);
  });

  it('emits a no-value rule on mount when initialRule has a no-value operator', () => {
    const initialRule: FilterRule = { column: COL, operator: 'is_empty' };
    const onChange = vi.fn();
    act(() => {
      render(
        <FilterValueEditor
          column={COL}
          fieldType={STRING_TYPE}
          initialRule={initialRule}
          onChange={onChange}
        />
      );
    });

    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'is_empty' });
  });
});

// ---------------------------------------------------------------------------
// Group 2 — Scalar operators
// ---------------------------------------------------------------------------

describe('FilterValueEditor — scalar operators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('typing a value emits the rule with that value (STRING eq)', () => {
    const { onChange } = renderEditor({ fieldType: STRING_TYPE });

    const input = screen.getByPlaceholderText('');
    fireEvent.change(input, { target: { value: 'foo' } });

    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'eq', value: 'foo' });
  });

  it('typing a value emits the rule for "contains" operator', () => {
    const { onChange } = renderEditor({
      fieldType: STRING_TYPE,
      initialRule: { column: COL, operator: 'contains', value: '' },
    });

    // Switch to contains first
    fireEvent.change(getConditionSelect(), { target: { value: 'contains' } });
    const input = screen.getByPlaceholderText('');
    fireEvent.change(input, { target: { value: 'bar' } });

    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'contains', value: 'bar' });
  });

  it('emits null when scalar value is cleared', () => {
    const { onChange } = renderEditor({
      fieldType: STRING_TYPE,
      initialRule: { column: COL, operator: 'eq', value: 'abc' },
    });

    const input = screen.getByDisplayValue('abc');
    fireEvent.change(input, { target: { value: '' } });

    expect(lastCall(onChange)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group 3 — Number coercion
// ---------------------------------------------------------------------------

describe('FilterValueEditor — number coercion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('typing 123 for INTEGER type emits value: 123 (number, not string)', () => {
    const { onChange } = renderEditor({ fieldType: INT_TYPE });

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '123' } });

    const rule = lastCall(onChange) as { operator: string; column: string; value: number };
    expect(rule).not.toBeNull();
    expect(rule.value).toBe(123);
    expect(typeof rule.value).toBe('number');
  });

  it('typing 45.6 for FLOAT type emits value: 45.6 (number)', () => {
    const { onChange } = renderEditor({ column: COL, fieldType: 'FLOAT' });

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '45.6' } });

    const rule = lastCall(onChange) as { operator: string; column: string; value: number };
    expect(rule.value).toBe(45.6);
    expect(typeof rule.value).toBe('number');
  });

  // Regression: Athena numeric types must coerce to JS numbers too, else the value
  // ships as a string and the backend quotes it ("bigint > '10'" → Athena rejects).
  it.each(['BIGINT', 'SMALLINT', 'TINYINT', 'REAL', 'DOUBLE', 'DECIMAL'])(
    'typing 10 for Athena %s type emits value: 10 (number, not string)',
    fieldType => {
      const { onChange } = renderEditor({ fieldType });

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '10' } });

      const rule = lastCall(onChange) as { value: number };
      expect(rule.value).toBe(10);
      expect(typeof rule.value).toBe('number');
    }
  );

  it('typing a non-numeric value for INTEGER type emits null', () => {
    const { onChange } = renderEditor({ fieldType: INT_TYPE });

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: 'abc' } });

    expect(lastCall(onChange)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group 4 — No-value operators (is_empty, is_null, is_true, etc.)
// ---------------------------------------------------------------------------

describe('FilterValueEditor — no-value operators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switching to is_empty emits { column, operator: "is_empty" } (no value) and hides value input', () => {
    const { onChange } = renderEditor({ fieldType: STRING_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'is_empty' } });

    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'is_empty' });
    // Value input should be hidden
    expect(screen.queryByPlaceholderText('')).toBeNull();
  });

  it('switching to is_null emits { column, operator: "is_null" } and hides value input', () => {
    const { onChange } = renderEditor({ fieldType: STRING_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'is_null' } });

    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'is_null' });
    expect(screen.queryByPlaceholderText('')).toBeNull();
  });

  it('switching to is_true emits { column, operator: "is_true" } and hides value input (BOOLEAN)', () => {
    const { onChange } = renderEditor({ fieldType: 'BOOLEAN' });

    // Default for BOOLEAN is 'is_true' (first operator)
    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'is_true' });
    // No value input visible
    expect(screen.queryByPlaceholderText('')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group 5 — "between" operator
// ---------------------------------------------------------------------------

describe('FilterValueEditor — between operator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switching to between reveals From and To inputs', () => {
    renderEditor({ fieldType: INT_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'between' } });

    expect(screen.getByPlaceholderText('from')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('to')).toBeInTheDocument();
  });

  it('both From+To filled → emits rule with { from, to }', () => {
    const { onChange } = renderEditor({ fieldType: INT_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'between' } });

    fireEvent.change(screen.getByPlaceholderText('from'), { target: { value: '10' } });
    fireEvent.change(screen.getByPlaceholderText('to'), { target: { value: '20' } });

    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'between',
      value: { from: 10, to: 20 },
    });
  });

  it('only From filled → emits null (incomplete)', () => {
    const { onChange } = renderEditor({ fieldType: INT_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'between' } });
    fireEvent.change(screen.getByPlaceholderText('from'), { target: { value: '10' } });

    expect(lastCall(onChange)).toBeNull();
  });

  it('only To filled → emits null (incomplete)', () => {
    const { onChange } = renderEditor({ fieldType: INT_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'between' } });
    fireEvent.change(screen.getByPlaceholderText('to'), { target: { value: '20' } });

    expect(lastCall(onChange)).toBeNull();
  });

  it('between with string values (STRING type) emits string from/to', () => {
    // STRING doesn't have 'between' but DATE does — use DATE for string between
    const { onChange } = renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'between' } });
    fireEvent.change(screen.getByPlaceholderText('from'), { target: { value: '2024-01-01' } });
    fireEvent.change(screen.getByPlaceholderText('to'), { target: { value: '2024-12-31' } });

    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'between',
      value: { from: '2024-01-01', to: '2024-12-31' },
    });
  });
});

// ---------------------------------------------------------------------------
// Group 6 — "relative_date" operator
// ---------------------------------------------------------------------------

describe('FilterValueEditor — in / not_in operators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switching to in reveals the comma-separated values input and emits the parsed list', () => {
    const { onChange } = renderEditor({ fieldType: STRING_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'in' } });
    const input = screen.getByPlaceholderText('value1, value2');
    fireEvent.change(input, { target: { value: ' fb, google , ,tiktok ' } });

    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'in',
      value: ['fb', 'google', 'tiktok'],
    });
  });

  it('not_in on a number column parses each entry as a number', () => {
    const { onChange } = renderEditor({ fieldType: INT_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'not_in' } });
    const input = screen.getByPlaceholderText('10, 20, 30');
    fireEvent.change(input, { target: { value: '1, 2,3' } });

    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'not_in', value: [1, 2, 3] });
  });

  it('emits null while the list is empty or contains a non-numeric entry for a number column', () => {
    const { onChange } = renderEditor({ fieldType: INT_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'in' } });
    expect(lastCall(onChange)).toBeNull();

    const input = screen.getByPlaceholderText('10, 20, 30');
    fireEvent.change(input, { target: { value: '1, x' } });
    expect(lastCall(onChange)).toBeNull();
  });

  it('initialRule with in pre-fills the list input', () => {
    const { onChange } = renderEditor({
      fieldType: STRING_TYPE,
      initialRule: { column: COL, operator: 'in', value: ['a', 'b'] },
    });

    expect(screen.getByDisplayValue('a, b')).toBeInTheDocument();
    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'in', value: ['a', 'b'] });
  });

  it('preserves comma-containing and non-string values of an untouched existing rule', () => {
    const { onChange } = renderEditor({
      fieldType: STRING_TYPE,
      initialRule: { column: COL, operator: 'in', value: ['Acme, Inc.', 5, true] },
    });

    // The lossy comma-text display must NOT leak into the emitted rule.
    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'in',
      value: ['Acme, Inc.', 5, true],
    });
  });

  it('keeps the pristine values when only the operator flips in↔not_in', () => {
    const { onChange } = renderEditor({
      fieldType: STRING_TYPE,
      initialRule: { column: COL, operator: 'in', value: ['Acme, Inc.'] },
    });

    fireEvent.change(getConditionSelect(), { target: { value: 'not_in' } });

    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'not_in', value: ['Acme, Inc.'] });
  });

  it('editing the text drops the pristine array and re-parses the comma list', () => {
    const { onChange } = renderEditor({
      fieldType: STRING_TYPE,
      initialRule: { column: COL, operator: 'in', value: ['a', 'b'] },
    });

    const input = screen.getByDisplayValue('a, b');
    fireEvent.change(input, { target: { value: 'a, b, c' } });

    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'in', value: ['a', 'b', 'c'] });
  });

  it('creates comma-containing values via double-quote wrapping', () => {
    const { onChange } = renderEditor({ fieldType: STRING_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'in' } });
    const input = screen.getByPlaceholderText('value1, value2');
    fireEvent.change(input, { target: { value: 'alpha, "Acme, Inc.", beta' } });

    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'in',
      value: ['alpha', 'Acme, Inc.', 'beta'],
    });
  });

  it('round-trips a comma-containing value through EDIT (quoted display, comma survives)', () => {
    const { onChange } = renderEditor({
      fieldType: STRING_TYPE,
      initialRule: { column: COL, operator: 'in', value: ['Acme, Inc.'] },
    });

    // The display quotes the comma-containing value so re-parsing cannot split it.
    const input = screen.getByDisplayValue('"Acme, Inc."');
    fireEvent.change(input, { target: { value: '"Acme, Inc.", Beta' } });

    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'in',
      value: ['Acme, Inc.', 'Beta'],
    });
  });

  it('supports literal double quotes via "" escaping', () => {
    const { onChange } = renderEditor({ fieldType: STRING_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'in' } });
    const input = screen.getByPlaceholderText('value1, value2');
    fireEvent.change(input, { target: { value: '"He said ""hi"""' } });

    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'in', value: ['He said "hi"'] });
  });

  it('preserves edge whitespace inside quotes but drops stray whitespace around them', () => {
    const { onChange } = renderEditor({ fieldType: STRING_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'in' } });
    const input = screen.getByPlaceholderText('value1, value2');
    // Quoted edges preserved; whitespace outside the quotes is not part of the value.
    fireEvent.change(input, { target: { value: '" x " , "a" , plain' } });

    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'in',
      value: [' x ', 'a', 'plain'],
    });
  });

  it('round-trips an edge-whitespace value through EDIT (quoted display)', () => {
    const { onChange } = renderEditor({
      fieldType: STRING_TYPE,
      initialRule: { column: COL, operator: 'in', value: [' x '] },
    });

    // formatListValue quotes edge-whitespace values so re-parsing preserves them.
    const input = screen.getByDisplayValue('" x "');
    fireEvent.change(input, { target: { value: '" x ", y' } });

    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'in', value: [' x ', 'y'] });
  });
});

// ---------------------------------------------------------------------------
// Group — relative_date
// ---------------------------------------------------------------------------

describe('FilterValueEditor — relative_date operator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switching to relative_date reveals preset select', () => {
    renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });

    // Preset select should now be in DOM (second select)
    expect(screen.getAllByTestId('select')).toHaveLength(2);
  });

  it('default preset "today" emits rule with { kind: "today" } and no N input', () => {
    const { onChange } = renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });

    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'relative_date',
      value: { kind: 'today' },
    });
    // No number input for N
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('selecting "last_n_days" shows N input', () => {
    renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });
    fireEvent.change(getPresetSelect(), { target: { value: 'last_n_days' } });

    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('last_n_days with valid N emits rule with { kind: "last_n_days", n }', () => {
    const { onChange } = renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });
    fireEvent.change(getPresetSelect(), { target: { value: 'last_n_days' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '14' } });

    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'relative_date',
      value: { kind: 'last_n_days', n: 14 },
    });
  });

  it('last_n_months with valid N emits rule with { kind: "last_n_months", n }', () => {
    const { onChange } = renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });
    fireEvent.change(getPresetSelect(), { target: { value: 'last_n_months' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });

    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'relative_date',
      value: { kind: 'last_n_months', n: 3 },
    });
  });

  it('next_n_days shows the N input and emits { kind: "next_n_days", n }', () => {
    const { onChange } = renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });
    fireEvent.change(getPresetSelect(), { target: { value: 'next_n_days' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } });

    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'relative_date',
      value: { kind: 'next_n_days', n: 7 },
    });
  });

  it('week and quarter presets emit no-N rules', () => {
    const { onChange } = renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });
    for (const kind of ['this_week', 'last_week', 'this_quarter', 'last_quarter'] as const) {
      fireEvent.change(getPresetSelect(), { target: { value: kind } });
      expect(lastCall(onChange)).toEqual({
        column: COL,
        operator: 'relative_date',
        value: { kind },
      });
      expect(screen.queryByRole('spinbutton')).toBeNull();
    }
  });

  it('selecting "this_month" does NOT show N input', () => {
    renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });
    fireEvent.change(getPresetSelect(), { target: { value: 'this_month' } });

    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('relative_date with invalid N (zero) → onChange(null)', () => {
    const { onChange } = renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });
    fireEvent.change(getPresetSelect(), { target: { value: 'last_n_days' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });

    expect(lastCall(onChange)).toBeNull();
  });

  it('relative_date with invalid N (negative) → onChange(null)', () => {
    const { onChange } = renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });
    fireEvent.change(getPresetSelect(), { target: { value: 'last_n_days' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-5' } });

    expect(lastCall(onChange)).toBeNull();
  });

  it('rejects a Last-N value above 3650 with a friendly message', () => {
    const { onChange } = renderEditor({ fieldType: DATE_TYPE });

    fireEvent.change(getConditionSelect(), { target: { value: 'relative_date' } });
    fireEvent.change(getPresetSelect(), { target: { value: 'last_n_days' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4000' } });

    expect(lastCall(onChange)).toBeNull();
  });

  it('clearing the Last-N input leaves it empty instead of snapping back to 0 (Backspace bug)', () => {
    // Regression: the field coerced '' → 0 and re-rendered "0", so Backspace could
    // never empty it. It must stay empty so the user can type a fresh value.
    const { onChange } = renderEditor({
      fieldType: DATE_TYPE,
      initialRule: {
        column: COL,
        operator: 'relative_date',
        value: { kind: 'last_n_days', n: 30 },
      },
    });

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '' } });

    expect((input as HTMLInputElement).value).toBe('');
    // An empty N is invalid → no rule emitted.
    expect(lastCall(onChange)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group 7 — initialRule pre-fills inputs
// ---------------------------------------------------------------------------

describe('FilterValueEditor — initialRule pre-fills inputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scalar: initialRule with value "foo" shows "foo" in the input', () => {
    renderEditor({
      fieldType: STRING_TYPE,
      initialRule: { column: COL, operator: 'eq', value: 'foo' },
    });

    expect(screen.getByDisplayValue('foo')).toBeInTheDocument();
  });

  it('between: From and To inputs show the initialRule from/to values', () => {
    renderEditor({
      fieldType: INT_TYPE,
      initialRule: { column: COL, operator: 'between', value: { from: 5, to: 15 } },
    });

    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('15')).toBeInTheDocument();
  });

  it('relative_date with last_n_days: preset select shows kind + N input shows n', () => {
    renderEditor({
      fieldType: DATE_TYPE,
      initialRule: {
        column: COL,
        operator: 'relative_date',
        value: { kind: 'last_n_days', n: 30 },
      },
    });

    // Preset select should show last_n_days
    const presetSelect = getPresetSelect();
    expect((presetSelect as HTMLSelectElement).value).toBe('last_n_days');

    // N input should show 30
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
  });

  it('relative_date with today: preset select shows "today" + no N input', () => {
    renderEditor({
      fieldType: DATE_TYPE,
      initialRule: {
        column: COL,
        operator: 'relative_date',
        value: { kind: 'today' },
      },
    });

    const presetSelect = getPresetSelect();
    expect((presetSelect as HTMLSelectElement).value).toBe('today');
    // No N input
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('no-value initialRule: no value input visible', () => {
    renderEditor({
      fieldType: STRING_TYPE,
      initialRule: { column: COL, operator: 'is_null' },
    });

    expect(screen.queryByPlaceholderText('')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group 8 — Switching operator clears invalid state
// ---------------------------------------------------------------------------

describe('FilterValueEditor — switching operator clears invalid state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('typing scalar then switching to between → onChange(null) until both bounds filled', () => {
    const { onChange } = renderEditor({ fieldType: INT_TYPE });

    // Type a scalar value — rule becomes valid
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '42' } });
    expect(lastCall(onChange)).not.toBeNull();

    // Switch to between — state resets, both bounds empty → null
    fireEvent.change(getConditionSelect(), { target: { value: 'between' } });
    expect(lastCall(onChange)).toBeNull();

    // Fill from only — still null
    fireEvent.change(screen.getByPlaceholderText('from'), { target: { value: '1' } });
    expect(lastCall(onChange)).toBeNull();

    // Fill to — now valid
    fireEvent.change(screen.getByPlaceholderText('to'), { target: { value: '10' } });
    expect(lastCall(onChange)).toEqual({
      column: COL,
      operator: 'between',
      value: { from: 1, to: 10 },
    });
  });

  it('filling between then switching to scalar → onChange(null) until value is typed', () => {
    const { onChange } = renderEditor({ fieldType: INT_TYPE });

    // Switch to between and fill both bounds
    fireEvent.change(getConditionSelect(), { target: { value: 'between' } });
    fireEvent.change(screen.getByPlaceholderText('from'), { target: { value: '5' } });
    fireEvent.change(screen.getByPlaceholderText('to'), { target: { value: '50' } });
    expect(lastCall(onChange)).not.toBeNull();

    // Switch back to eq (scalar) — scalar is empty → null
    fireEvent.change(getConditionSelect(), { target: { value: 'eq' } });
    expect(lastCall(onChange)).toBeNull();
  });

  it('switching to a no-value operator immediately emits a valid rule', () => {
    const { onChange } = renderEditor({ fieldType: STRING_TYPE });

    // Initially: scalar op, empty value → null
    expect(lastCall(onChange)).toBeNull();

    // Switch to is_empty — immediately valid
    fireEvent.change(getConditionSelect(), { target: { value: 'is_empty' } });
    expect(lastCall(onChange)).toEqual({ column: COL, operator: 'is_empty' });
  });
});

// ---------------------------------------------------------------------------
// Group 9 — Time-of-day types (regression: TIME must not behave like a date)
// ---------------------------------------------------------------------------

describe('FilterValueEditor — time-of-day types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a time input (not date) for a TIME column and offers no relative_date', () => {
    const { container } = render(
      <FilterValueEditor column={COL} fieldType='TIME WITH TIME ZONE' onChange={vi.fn()} />
    );

    expect(container.querySelector('input[type="time"]')).toBeInTheDocument();
    expect(container.querySelector('input[type="date"]')).toBeNull();

    const options = Array.from(getConditionSelect().querySelectorAll('option')).map(o => o.value);
    expect(options).not.toContain('relative_date');
    expect(options).toContain('between');
  });

  it('keeps a date input for a zoned TIMESTAMP column', () => {
    const { container } = render(
      <FilterValueEditor column={COL} fieldType='TIMESTAMP WITH TIME ZONE' onChange={vi.fn()} />
    );

    expect(container.querySelector('input[type="date"]')).toBeInTheDocument();
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });
});
