import { useState } from 'react';
import { Filter } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { FilterEditorPopover } from './FilterEditorPopover';
import type { FilterRule } from '../../../shared/types/output-config';

interface RowFilterIconProps {
  column: string;
  fieldType: string;
  activeRules: readonly FilterRule[];
  onAdd: (rule: FilterRule) => void;
  onRemoveAt: (index: number) => void;
}

export function RowFilterIcon({
  column,
  fieldType,
  activeRules,
  onAdd,
  onRemoveAt,
}: RowFilterIconProps) {
  const [open, setOpen] = useState(false);
  const isActive = activeRules.length > 0;

  return (
    <FilterEditorPopover
      open={open}
      onOpenChange={setOpen}
      column={column}
      fieldType={fieldType}
      onApply={onAdd}
      existingRules={activeRules}
      onRemoveExistingAt={onRemoveAt}
      trigger={
        <button
          type='button'
          aria-label={isActive ? 'Manage filters' : 'Add filter'}
          className={cn(
            'ml-auto flex h-6 w-6 items-center justify-center gap-0.5 rounded transition-opacity',
            isActive
              ? 'text-blue-500 opacity-100'
              : 'text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100'
          )}
        >
          <Filter className='h-4 w-4' />
          {activeRules.length > 1 && (
            <span className='text-[10px] leading-none font-semibold tabular-nums'>
              {activeRules.length}
            </span>
          )}
        </button>
      }
    />
  );
}
