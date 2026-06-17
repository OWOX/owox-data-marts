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
import type { FilterRule, RelativeDatePreset } from '../../../shared/types/output-config';
import {
  type FilterOperator,
  operatorsForType,
  defaultOperatorForType,
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
  betweenFrom: string;
  betweenTo: string;
  relativeKind: RelativeDatePreset['kind'];
  relativeN: number;
}

const RELATIVE_KINDS: { value: RelativeDatePreset['kind']; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_n_days', label: 'Last N days' },
  { value: 'last_n_months', label: 'Last N months' },
];

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
    betweenFrom: '',
    betweenTo: '',
    relativeKind: 'today',
    relativeN: 7,
  };
  if (!rule) return state;
  state.op = rule.operator as FilterOperator;
  if (rule.operator === 'between') {
    state.betweenFrom = String(rule.value.from);
    state.betweenTo = String(rule.value.to);
  } else if (rule.operator === 'relative_date') {
    state.relativeKind = rule.value.kind;
    if ('n' in rule.value) state.relativeN = rule.value.n;
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

  if (op === 'relative_date') {
    if (state.relativeKind === 'last_n_days' || state.relativeKind === 'last_n_months') {
      if (!Number.isInteger(state.relativeN) || state.relativeN <= 0 || state.relativeN > 3650) {
        throw new Error('N must be between 1 and 3650');
      }
      return {
        column,
        operator: 'relative_date',
        value: { kind: state.relativeKind, n: state.relativeN },
      };
    }
    return { column, operator: 'relative_date', value: { kind: state.relativeKind } };
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
  const fallbackOp = defaultOperatorForType(fieldType);

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
          {(state.relativeKind === 'last_n_days' || state.relativeKind === 'last_n_months') && (
            <Input
              type='number'
              min={1}
              max={3650}
              value={state.relativeN}
              onChange={e => {
                setState(s => ({ ...s, relativeN: Number(e.target.value) || 0 }));
              }}
            />
          )}
        </div>
      )}

      {!NO_VALUE_OPS.has(state.op) && state.op !== 'between' && state.op !== 'relative_date' && (
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
