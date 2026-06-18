import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { Pencil, X, Layers, AlertTriangle } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import type { FilterRule } from '../../../shared/types/output-config';
import { FilterEditorPopover } from './FilterEditorPopover';
import { summarizeFilterRule } from './filter-rule-summary';
import { operatorLabelFor } from './output-controls-operators';

interface FilterRowProps {
  rule: FilterRule;
  /** `null` → column missing from current schema; row renders as orphaned. */
  fieldType: string | null;
  onChange: (next: FilterRule) => void;
  onRemove: () => void;
  /** Business-readable label; falls back to the raw column when absent. */
  displayLabel?: string;
  /** Joined data mart name (muted second line); absent for home-mart fields. */
  dataMartName?: string;
}

export function FilterRow({
  rule,
  fieldType,
  onChange,
  onRemove,
  displayLabel,
  dataMartName,
}: FilterRowProps) {
  const [editing, setEditing] = useState(false);
  const isOrphaned = fieldType === null;
  const resolvedType = fieldType ?? 'STRING';
  const opLabel = operatorLabelFor(rule.operator, resolvedType);
  const valueText = summarizeFilterRule(rule);
  const isPreJoin = rule.placement === 'pre-join';
  const displayColumn = rule.column;

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 rounded px-2 py-1.5',
        isOrphaned ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted/40'
      )}
    >
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-1 truncate font-mono text-xs' title={displayColumn}>
          {isOrphaned && (
            <span
              className='inline-flex items-center text-red-600'
              title='This column is no longer available in the data mart schema. Remove this rule or restore the column.'
              aria-label='Column not found in schema'
            >
              <AlertTriangle className='h-3 w-3' />
            </span>
          )}
          {isPreJoin ? (
            <span
              className={cn(
                'inline-flex items-center gap-1',
                isOrphaned ? 'text-red-700 dark:text-red-300' : 'text-blue-600'
              )}
              title='Pre-join filter (slice)'
            >
              <Layers className='h-3 w-3' />
              <span className={cn(isOrphaned && 'line-through')}>
                {displayLabel ?? rule.column}
              </span>
            </span>
          ) : (
            <span className={cn(isOrphaned && 'text-red-700 line-through dark:text-red-300')}>
              {displayLabel ?? rule.column}
            </span>
          )}
        </div>
        {!isOrphaned && dataMartName && (
          <div className='text-muted-foreground truncate text-[11px]'>{dataMartName}</div>
        )}
        <div className='truncate font-mono text-[11px]'>
          <span className='text-foreground/70 font-medium'>{opLabel}</span>
          {valueText && <span className='text-muted-foreground'> {valueText}</span>}
        </div>
      </div>
      {isOrphaned ? (
        <Button
          variant='ghost'
          size='sm'
          disabled
          className='text-muted-foreground h-6 w-6 p-0 opacity-40'
          aria-label='Edit disabled — column missing from schema'
          title='Edit disabled — column missing from schema'
        >
          <Pencil className='h-4 w-4' />
        </Button>
      ) : (
        <FilterEditorPopover
          open={editing}
          onOpenChange={setEditing}
          trigger={
            <Button
              variant='ghost'
              size='sm'
              className={cn(
                'text-muted-foreground hover:text-foreground h-6 w-6 p-0 transition-opacity group-hover:opacity-100',
                editing ? 'opacity-100' : 'opacity-0'
              )}
              aria-label={isPreJoin ? 'Edit slice' : 'Edit filter'}
            >
              <Pencil className='h-4 w-4' />
            </Button>
          }
          column={rule.column}
          fieldType={resolvedType}
          displayLabel={displayLabel}
          dataMartName={dataMartName}
          initialRule={rule}
          onApply={onChange}
        />
      )}
      <Button
        variant='ghost'
        size='sm'
        className='text-muted-foreground hover:text-foreground h-6 w-6 p-0'
        onClick={onRemove}
        aria-label={isPreJoin ? 'Remove slice' : 'Remove filter'}
      >
        <X className='h-4 w-4' />
      </Button>
    </div>
  );
}
