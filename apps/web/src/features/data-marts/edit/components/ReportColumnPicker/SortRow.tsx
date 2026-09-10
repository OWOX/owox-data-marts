import type { HTMLAttributes } from 'react';
import { Button } from '@owox/ui/components/button';
import { AlertTriangle, ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import type { SortRule } from '../../../shared/types/output-config';

interface SortRowProps {
  rule: SortRule;
  index: number;
  onChange: (next: SortRule) => void;
  onRemove: () => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
  isOrphaned?: boolean;
  /** Business-readable label; falls back to the raw column when absent. */
  displayLabel?: string;
  /** Joined data mart name (muted second line); absent for home-mart fields. */
  dataMartName?: string;
}

export function SortRow({
  rule,
  index,
  onChange,
  onRemove,
  dragHandleProps,
  isOrphaned = false,
  displayLabel,
  dataMartName,
}: SortRowProps) {
  const toggleDirection = () => {
    if (isOrphaned) return;
    onChange({ ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' });
  };
  const ArrowIcon = rule.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1.5',
        isOrphaned ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted/40'
      )}
    >
      <span
        {...dragHandleProps}
        className='text-muted-foreground cursor-grab'
        aria-label='Drag to reorder'
      >
        <GripVertical className='h-4 w-4' />
      </span>
      <span className='text-muted-foreground w-4 text-xs tabular-nums'>{index + 1}</span>
      <span className='flex min-w-0 flex-1 flex-col justify-center truncate font-mono text-xs'>
        <span className='flex items-center gap-1 truncate'>
          {isOrphaned && (
            // Two causes share the marker, so the title names both: the column may be gone from
            // the schema, or right there and merely unselected while the report aggregates (a
            // GROUP BY query only orders by what it prints). The accessible name stays the one
            // every orphaned rule marker carries — filter, aggregation, date bucket — so the
            // markers read alike; the title is where a sort's second cause is spelled out.
            <span
              className='inline-flex items-center text-red-600'
              title="This column cannot be sorted by in the report's current setup: it is missing from the schema, or it is not selected while the report aggregates. Remove this rule, or select or restore the column."
              aria-label='Column not found in schema'
            >
              <AlertTriangle className='h-3 w-3' />
            </span>
          )}
          <span
            className={cn('truncate', isOrphaned && 'text-red-700 line-through dark:text-red-300')}
            title={rule.column}
          >
            {displayLabel ?? rule.column}
          </span>
        </span>
        {!isOrphaned && dataMartName && (
          <span className='text-muted-foreground truncate text-[11px]'>{dataMartName}</span>
        )}
      </span>
      <Button
        variant='ghost'
        size='sm'
        className='text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 text-[11px]'
        onClick={toggleDirection}
        disabled={isOrphaned}
        aria-label={`Toggle direction (currently ${rule.direction})`}
      >
        <ArrowIcon className='h-4 w-4' />
        <span className='inline-block w-7 text-left'>{rule.direction}</span>
      </Button>
      <Button
        variant='ghost'
        size='sm'
        className='text-muted-foreground hover:text-foreground h-6 w-6 p-0'
        onClick={onRemove}
        aria-label='Remove sort'
      >
        <X className='h-4 w-4' />
      </Button>
    </div>
  );
}
