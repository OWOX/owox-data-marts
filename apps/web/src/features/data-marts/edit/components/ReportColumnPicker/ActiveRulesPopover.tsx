import { type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Button } from '@owox/ui/components/button';
import { Label } from '@owox/ui/components/label';
import { X } from 'lucide-react';
import type { FilterRule } from '../../../shared/types/output-config';
import { operatorLabelFor } from './output-controls-operators';
import { summarizeFilterRule } from './filter-rule-summary';

interface RuleListProps {
  rules: readonly FilterRule[];
  onRemoveAt: (index: number) => void;
}

export interface ActiveRulesPopoverProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trigger: ReactNode;
  column: string;
  fieldType: string;
  /** Business-readable field name shown in the header; falls back to `column`. */
  displayLabel?: string;
  /** Joined data mart name shown under the field name; absent for home-mart fields. */
  dataMartName?: string;
  /** Unified blended-field name for display when showing slices. */
  sliceColumn?: string;
  filters?: RuleListProps;
  slices?: RuleListProps;
}

export function ActiveRulesPopover({
  open,
  onOpenChange,
  trigger,
  column,
  fieldType,
  displayLabel,
  dataMartName,
  sliceColumn,
  filters,
  slices,
}: ActiveRulesPopoverProps) {
  const slicesOnly = !filters?.rules.length && !!slices?.rules.length && sliceColumn != null;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className='w-72 space-y-3'>
        <div>
          <div className='text-sm font-medium'>
            {displayLabel ?? (slicesOnly ? sliceColumn : column)}
          </div>
          {dataMartName && <div className='text-muted-foreground text-[11px]'>{dataMartName}</div>}
        </div>

        {!!filters?.rules.length && (
          <RuleSection
            label='Active filters'
            removeLabel='Remove filter'
            fieldType={fieldType}
            rules={filters.rules}
            onRemoveAt={filters.onRemoveAt}
          />
        )}
        {!!slices?.rules.length && (
          <RuleSection
            label='Active slices'
            removeLabel='Remove slice'
            fieldType={fieldType}
            rules={slices.rules}
            onRemoveAt={slices.onRemoveAt}
          />
        )}

        <div className='flex justify-end'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Close
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface RuleSectionProps extends RuleListProps {
  label: string;
  removeLabel: string;
  fieldType: string;
}

function RuleSection({ label, removeLabel, fieldType, rules, onRemoveAt }: RuleSectionProps) {
  return (
    <div className='space-y-1'>
      <Label>{label}</Label>
      <div className='space-y-1'>
        {rules.map((rule, idx) => {
          const valueStr = summarizeFilterRule(rule);
          return (
            <div
              key={idx}
              className='bg-muted/40 flex items-center gap-2 rounded px-2 py-1 text-xs'
            >
              <span className='flex-1 truncate font-mono' title={valueStr}>
                <b>{operatorLabelFor(rule.operator, fieldType)}</b>
                {valueStr && <>: {valueStr}</>}
              </span>
              <Button
                variant='ghost'
                size='sm'
                className='h-6 w-6 p-0'
                onClick={() => {
                  onRemoveAt(idx);
                }}
                aria-label={removeLabel}
              >
                <X className='h-3 w-3' />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
