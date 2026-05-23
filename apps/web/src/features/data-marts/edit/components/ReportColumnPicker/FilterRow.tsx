import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { Pencil, X, Layers } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import type { FilterRule } from '../../../shared/types/output-config';
import { FilterEditorPopover } from './FilterEditorPopover';
import { summarizeFilterRule } from './filter-rule-summary';
import { operatorLabelFor } from './output-controls-operators';

interface FilterRowProps {
  rule: FilterRule;
  fieldType: string;
  onChange: (next: FilterRule) => void;
  onRemove: () => void;
}

export function FilterRow({ rule, fieldType, onChange, onRemove }: FilterRowProps) {
  const [editing, setEditing] = useState(false);
  const opLabel = operatorLabelFor(rule.operator, fieldType);
  const valueText = summarizeFilterRule(rule);
  const isPreJoin = rule.placement === 'pre-join' && !!rule.aliasPath;

  return (
    <div className='group bg-muted/40 flex items-center gap-1.5 rounded px-2 py-1.5'>
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-1 truncate font-mono text-xs' title={rule.column}>
          {isPreJoin && (
            <span
              className='inline-flex items-center gap-1 text-blue-600'
              title='Pre-join filter (slice)'
            >
              <Layers className='h-3 w-3' />
              <span>{rule.aliasPath}.</span>
            </span>
          )}
          <span>{rule.column}</span>
        </div>
        <div className='truncate font-mono text-[11px]'>
          <span className='text-foreground/70 font-medium'>{opLabel}</span>
          {valueText && <span className='text-muted-foreground'> {valueText}</span>}
        </div>
      </div>
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
        fieldType={fieldType}
        initialRule={rule}
        onApply={onChange}
      />
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
