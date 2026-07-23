import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Label } from '@owox/ui/components/label';
import {
  IN_LIST_MAX_VALUES,
  type FilterRule,
  type RelativeDatePreset,
} from '../../../shared/types/output-config';
import {
  type FilterOperator,
  operatorsForType,
  isNumberType,
  isDateType,
  isTimeType,
} from './output-controls-operators';

export interface FilterValueEditorProps {
  column: string;
  fieldType: string;
  initialRule?: FilterRule;
  /** Called every time the user edits. Returns `null` while the input is invalid. */
  onChange: (rule: FilterRule | null) => void;
}

interface EditorState {
  op: FilterOperator;
  scalar: string;
  /** Raw comma-separated text for in/not_in; split/parsed in buildRule. */
  list: string;
  /**
   * The untouched value array of an existing in/not_in rule. The comma-text display
   * is lossy (a value containing a comma splits; numbers/booleans stringify), so as
   * long as the user has not edited the text, buildRule returns THIS array verbatim
   * instead of re-parsing the display string. Cleared to null on the first edit.
   */
  listValues: (string | number | boolean)[] | null;
  betweenFrom: string;
  betweenTo: string;
  relativeKind: RelativeDatePreset['kind'];
  /** Raw text so the field can be emptied while editing; parsed/validated in buildRule. */
  relativeN: string;
}

const RELATIVE_KINDS: { value: RelativeDatePreset['kind']; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'last_quarter', label: 'Last quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_n_days', label: 'Last N days' },
  { value: 'last_n_months', label: 'Last N months' },
  { value: 'next_n_days', label: 'Next N days' },
];

/** Presets that take the numeric N input. */
type NKind = 'last_n_days' | 'last_n_months' | 'next_n_days';
const N_KINDS = new Set<RelativeDatePreset['kind']>([
  'last_n_days',
  'last_n_months',
  'next_n_days',
]);
function isNKind(kind: RelativeDatePreset['kind']): kind is NKind {
  return N_KINDS.has(kind);
}

const NO_VALUE_OPS = new Set<FilterOperator>([
  'is_empty',
  'is_not_empty',
  'is_null',
  'is_not_null',
  'is_true',
  'is_false',
]);

function getInitialState(rule: FilterRule | undefined, fallbackOp: FilterOperator): EditorState {
  const state: EditorState = {
    op: fallbackOp,
    scalar: '',
    list: '',
    listValues: null,
    betweenFrom: '',
    betweenTo: '',
    relativeKind: 'today',
    relativeN: '7',
  };
  if (!rule) return state;
  state.op = rule.operator as FilterOperator;
  if (rule.operator === 'between') {
    state.betweenFrom = String(rule.value.from);
    state.betweenTo = String(rule.value.to);
  } else if (rule.operator === 'in' || rule.operator === 'not_in') {
    state.list = rule.value.map(formatListValue).join(', ');
    state.listValues = [...rule.value];
  } else if (rule.operator === 'relative_date') {
    state.relativeKind = rule.value.kind;
    if ('n' in rule.value) state.relativeN = String(rule.value.n);
  } else if (!NO_VALUE_OPS.has(rule.operator as FilterOperator)) {
    const value = (rule as { value: string | number | boolean }).value;
    state.scalar = String(value);
  }
  return state;
}

function parseScalar(raw: string, fieldType: string): string | number | boolean {
  if (isNumberType(fieldType)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error('Invalid number');
    return n;
  }
  return raw;
}

/**
 * Serializes one in/not_in value for the comma-separated text input. A value that
 * contains a comma, a double quote, or a newline is wrapped in double quotes with
 * `""` escaping the quote — the CSV-style grammar parseListText understands — so
 * comma-containing values round-trip through create and edit.
 */
function formatListValue(value: string | number | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Splits the comma-separated list text into values. Double-quoted sections keep
 * commas/newlines literal and use `""` for a literal quote; unquoted content is
 * split on commas and newlines. Assembled tokens are trimmed; empties dropped.
 */
function parseListText(text: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  const push = () => {
    const token = current.trim();
    if (token !== '') values.push(token);
    current = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === '\n') {
      push();
    } else {
      current += ch;
    }
  }
  push();
  return values;
}

function buildRule(args: { column: string; fieldType: string; state: EditorState }): FilterRule {
  const { column, fieldType, state } = args;
  const { op } = state;

  if (op === 'between') {
    if (state.betweenFrom === '' || state.betweenTo === '') {
      throw new Error('Both bounds are required');
    }
    const from = parseScalar(state.betweenFrom, fieldType);
    const to = parseScalar(state.betweenTo, fieldType);
    const numericOutOfOrder = typeof from === 'number' && typeof to === 'number' && from > to;
    const dateOutOfOrder =
      typeof from === 'string' &&
      typeof to === 'string' &&
      (isDateType(fieldType) || isTimeType(fieldType)) &&
      from > to;
    if (numericOutOfOrder || dateOutOfOrder) {
      throw new Error('"From" must be ≤ "To"');
    }
    return { column, operator: 'between', value: { from, to } };
  }

  if (op === 'in' || op === 'not_in') {
    // Untouched existing rule: return the original array verbatim — the comma-text
    // display cannot round-trip values containing commas or non-string types.
    if (state.listValues !== null && state.listValues.length > 0) {
      return { column, operator: op, value: state.listValues };
    }
    // CSV-style grammar: double quotes keep commas literal ("" escapes a quote);
    // unquoted entries are trimmed and empties dropped. Mirrors the backend
    // schema bounds (1..IN_LIST_MAX_VALUES values).
    const entries = parseListText(state.list);
    if (entries.length === 0) {
      throw new Error('At least one value is required');
    }
    if (entries.length > IN_LIST_MAX_VALUES) {
      throw new Error(`At most ${IN_LIST_MAX_VALUES} values are allowed`);
    }
    return { column, operator: op, value: entries.map(e => parseScalar(e, fieldType)) };
  }

  if (op === 'relative_date') {
    const kind = state.relativeKind;
    if (isNKind(kind)) {
      const trimmed = state.relativeN.trim();
      const n = Number(trimmed);
      if (trimmed === '' || !Number.isInteger(n) || n <= 0 || n > 3650) {
        throw new Error('N must be between 1 and 3650');
      }
      return { column, operator: 'relative_date', value: { kind, n } };
    }
    return { column, operator: 'relative_date', value: { kind } };
  }

  if (NO_VALUE_OPS.has(op)) {
    return { column, operator: op } as FilterRule;
  }

  if (state.scalar === '') {
    throw new Error('Value is required');
  }

  if (op === 'regex' || op === 'not_regex') {
    try {
      new RegExp(state.scalar);
    } catch {
      throw new Error('Invalid regex pattern');
    }
  }

  return { column, operator: op, value: parseScalar(state.scalar, fieldType) } as FilterRule;
}

export function FilterValueEditor({
  column,
  fieldType,
  initialRule,
  onChange,
}: FilterValueEditorProps) {
  const operators = operatorsForType(fieldType);
  const fallbackOp = operators[0]?.value ?? 'eq';

  const [state, setState] = useState<EditorState>(() => getInitialState(initialRule, fallbackOp));

  useEffect(() => {
    setState(getInitialState(initialRule, fallbackOp));
  }, [initialRule, fallbackOp]);

  const rule = useMemo<FilterRule | null>(() => {
    try {
      return buildRule({ column, fieldType, state });
    } catch {
      return null;
    }
  }, [state, column, fieldType]);

  // Emit only on actual content change. `onChange` identity flips per parent
  // render, so we read the latest via ref to keep this effect deps minimal.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const lastEmittedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = rule === null ? '__null__' : JSON.stringify(rule);
    if (lastEmittedKeyRef.current === key) return;
    lastEmittedKeyRef.current = key;
    onChangeRef.current(rule);
  }, [rule]);

  const dateField = isDateType(fieldType);
  const timeField = isTimeType(fieldType);
  const inputType = isNumberType(fieldType)
    ? 'number'
    : timeField
      ? 'time'
      : dateField
        ? 'date'
        : 'text';

  return (
    <>
      <div>
        <Label>Condition</Label>
        <Select
          value={state.op}
          onValueChange={v => {
            setState(s => ({ ...s, op: v as FilterOperator }));
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {state.op === 'between' && (
        <div className='space-y-2'>
          <Label>From / To</Label>
          <div className='flex gap-2'>
            <Input
              type={inputType}
              value={state.betweenFrom}
              onChange={e => {
                setState(s => ({ ...s, betweenFrom: e.target.value }));
              }}
              placeholder='from'
            />
            <Input
              type={inputType}
              value={state.betweenTo}
              onChange={e => {
                setState(s => ({ ...s, betweenTo: e.target.value }));
              }}
              placeholder='to'
            />
          </div>
        </div>
      )}

      {(state.op === 'in' || state.op === 'not_in') && (
        <div className='space-y-1'>
          <Label>
            Values (comma-separated; wrap a value in "double quotes" if it contains a comma)
          </Label>
          {/* Plain text even for number/date columns — the field holds a comma list, not one value. */}
          <Input
            type='text'
            value={state.list}
            onChange={e => {
              // First edit invalidates the pristine array — from here on the (lossy)
              // text is the source of truth.
              setState(s => ({ ...s, list: e.target.value, listValues: null }));
            }}
            placeholder={
              isNumberType(fieldType)
                ? '10, 20, 30'
                : dateField
                  ? '2026-01-01, 2026-01-15'
                  : 'value1, value2'
            }
          />
        </div>
      )}

      {state.op === 'relative_date' && (
        <div className='space-y-2'>
          <Label>Preset</Label>
          <Select
            value={state.relativeKind}
            onValueChange={v => {
              setState(s => ({ ...s, relativeKind: v as RelativeDatePreset['kind'] }));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RELATIVE_KINDS.map(p => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {N_KINDS.has(state.relativeKind) && (
            <Input
              type='number'
              min={1}
              max={3650}
              value={state.relativeN}
              onChange={e => {
                setState(s => ({ ...s, relativeN: e.target.value }));
              }}
            />
          )}
        </div>
      )}

      {!NO_VALUE_OPS.has(state.op) &&
        state.op !== 'between' &&
        state.op !== 'relative_date' &&
        state.op !== 'in' &&
        state.op !== 'not_in' && (
          <div className='space-y-1'>
            <Label>Value</Label>
            <Input
              type={inputType}
              value={state.scalar}
              onChange={e => {
                setState(s => ({ ...s, scalar: e.target.value }));
              }}
              placeholder={state.op === 'regex' ? 'pattern' : ''}
            />
          </div>
        )}
    </>
  );
}
