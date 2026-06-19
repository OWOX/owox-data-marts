import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Button } from '@owox/ui/components/button';
import { Label } from '@owox/ui/components/label';
import { X } from 'lucide-react';
import type { FilterRule } from '../../../shared/types/output-config';
import { operatorLabelFor } from './output-controls-operators';
import { summarizeFilterRule } from './filter-rule-summary';
import { FilterValueEditor } from './FilterValueEditor';

export interface FilterEditorPopoverProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trigger: ReactNode;
  column: string;
  fieldType: string;
  /** Business-readable field name shown in the header; falls back to `column`. */
  displayLabel?: string;
  /** Joined data mart name shown under the field name; absent for home-mart fields. */
  dataMartName?: string;
  initialRule?: FilterRule;
  onApply: (rule: FilterRule) => void;
  onCancel?: () => void;
  existingRules?: readonly FilterRule[];
  onRemoveExistingAt?: (index: number) => void;
}

export function FilterEditorPopover(props: FilterEditorPopoverProps) {
  const [draftRule, setDraftRule] = useState<FilterRule | null>(props.initialRule ?? null);
  const [error, setError] = useState<string | null>(null);

  // Reset draft and error ONLY on the closed→open transition. The bare
  // `if (props.open)` check would fire on every render-while-open whenever the
  // parent passes a new `initialRule` object identity (typical for derived
  // values), wiping the user's in-progress edits. `openInstanceId` also keys
  // the inner editor so it remounts on each open without remounting on
  // unrelated parent re-renders.
  const [openInstanceId, setOpenInstanceId] = useState(0);
  const prevOpen = useRef(false);
  useEffect(() => {
    if (props.open && !prevOpen.current) {
      setOpenInstanceId(id => id + 1);
      setDraftRule(props.initialRule ?? null);
      setError(null);
    }
    prevOpen.current = props.open;
  }, [props.open, props.initialRule]);

  const handleChange = useCallback((rule: FilterRule | null) => {
    setDraftRule(rule);
    setError(null);
  }, []);

  function handleApply() {
    if (!draftRule) {
      setError('Value is required');
      return;
    }
    props.onApply(draftRule);
    props.onOpenChange(false);
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
          <div className='text-sm font-medium'>{props.displayLabel ?? props.column}</div>
          {props.dataMartName && (
            <div className='text-muted-foreground text-[11px]'>{props.dataMartName}</div>
          )}
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
                  <span className='flex-1 truncate font-mono' title={summarizeFilterRule(rule)}>
                    <b>{operatorLabelFor(rule.operator, props.fieldType)}</b>
                    {summarizeFilterRule(rule) && <>: {summarizeFilterRule(rule)}</>}
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

        <FilterValueEditor
          key={String(openInstanceId)}
          column={props.column}
          fieldType={props.fieldType}
          initialRule={props.initialRule}
          onChange={handleChange}
        />

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
