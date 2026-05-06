import { type ReactNode, useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Label } from '@owox/ui/components/label';
import { X } from 'lucide-react';
import type { FilterRule, RelativeDatePreset } from '../../../shared/types/output-config';
import {
  type FilterOperator,
  operatorLabelFor,
  operatorsForType,
} from './output-controls-operators';

export interface FilterEditorPopoverProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trigger: ReactNode;
  column: string;
  fieldType: string;
  initialRule?: FilterRule;
  onApply: (rule: FilterRule) => void;
  onCancel?: () => void;
  existingRules?: readonly FilterRule[];
  onRemoveExistingAt?: (index: number) => void;
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

const NO_VALUE_OPS = new Set<FilterOperator>(['is_empty', 'is_not_empty', 'is_true', 'is_false']);

const NUMBER_TYPES = new Set(['INTEGER', 'FLOAT', 'NUMERIC', 'BIGNUMERIC']);
const DATE_TYPES = new Set(['DATE', 'DATETIME', 'TIMESTAMP', 'TIME']);

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
  if (NUMBER_TYPES.has(fieldType)) {
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
    if (typeof from === 'number' && typeof to === 'number' && from > to) {
      throw new Error('"From" must be ≤ "To"');
    }
    return { column, operator: 'between', value: { from, to } };
  }

  if (op === 'relative_date') {
    if (state.relativeKind === 'last_n_days' || state.relativeKind === 'last_n_months') {
      if (!Number.isInteger(state.relativeN) || state.relativeN <= 0) {
        throw new Error('N must be a positive integer');
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

export function FilterEditorPopover(props: FilterEditorPopoverProps) {
  const operators = operatorsForType(props.fieldType);
  const fallbackOp = operators[0]?.value ?? 'eq';

  const [state, setState] = useState<EditorState>(() =>
    getInitialState(props.initialRule, fallbackOp)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.open) {
      setState(getInitialState(props.initialRule, fallbackOp));
      setError(null);
    }
  }, [props.open, props.initialRule, fallbackOp]);

  const isDateType = DATE_TYPES.has(props.fieldType);

  function handleApply() {
    try {
      const rule = buildRule({
        column: props.column,
        fieldType: props.fieldType,
        state,
      });
      props.onApply(rule);
      props.onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid value');
    }
  }

  function handleCancel() {
    props.onCancel?.();
    props.onOpenChange(false);
  }

  const hasExisting = !!props.existingRules?.length;
  const applyLabel = hasExisting ? 'Add' : 'Apply';

  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
      <PopoverContent className='w-72 space-y-3'>
        <div>
          <Label>Column</Label>
          <div className='font-mono text-xs'>
            {props.column} <span className='text-muted-foreground'>({props.fieldType})</span>
          </div>
        </div>

        {hasExisting && (
          <div className='space-y-1'>
            <Label>Active filters</Label>
            <div className='space-y-1'>
              {(props.existingRules ?? []).map((rule, idx) => (
                <div
                  key={idx}
                  className='bg-muted/40 flex items-center gap-2 rounded px-2 py-1 text-xs'
                >
                  <span className='flex-1 truncate font-mono' title={summarize(rule)}>
                    <b>{operatorLabelFor(rule.operator, props.fieldType)}</b>
                    {summarize(rule) && <>: {summarize(rule)}</>}
                  </span>
                  {props.onRemoveExistingAt && (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-6 w-6 p-0'
                      onClick={() => {
                        props.onRemoveExistingAt?.(idx);
                      }}
                      aria-label='Remove filter'
                    >
                      <X className='h-3 w-3' />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
                type={NUMBER_TYPES.has(props.fieldType) ? 'number' : isDateType ? 'date' : 'text'}
                value={state.betweenFrom}
                onChange={e => {
                  setState(s => ({ ...s, betweenFrom: e.target.value }));
                }}
                placeholder='from'
              />
              <Input
                type={NUMBER_TYPES.has(props.fieldType) ? 'number' : isDateType ? 'date' : 'text'}
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
              type={NUMBER_TYPES.has(props.fieldType) ? 'number' : isDateType ? 'date' : 'text'}
              value={state.scalar}
              onChange={e => {
                setState(s => ({ ...s, scalar: e.target.value }));
              }}
              placeholder={state.op === 'regex' ? 'pattern' : ''}
            />
          </div>
        )}

        {error && <div className='text-destructive text-xs'>{error}</div>}

        <div className='flex justify-end gap-2'>
          <Button variant='outline' size='sm' onClick={handleCancel}>
            Cancel
          </Button>
          <Button size='sm' onClick={handleApply}>
            {applyLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function summarize(rule: FilterRule): string {
  switch (rule.operator) {
    case 'is_empty':
    case 'is_not_empty':
    case 'is_true':
    case 'is_false':
      return '';
    case 'between':
      return `${String(rule.value.from)} … ${String(rule.value.to)}`;
    case 'relative_date': {
      const v = rule.value;
      if ('n' in v) return v.kind.replace('_n_', ` ${String(v.n)} `);
      return v.kind;
    }
    default:
      return JSON.stringify(rule.value);
  }
}
