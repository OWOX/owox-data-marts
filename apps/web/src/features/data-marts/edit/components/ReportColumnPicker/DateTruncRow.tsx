import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { Pencil, X, AlertTriangle } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import type { DateTruncRule } from '../../../shared/types/output-config';
import type { ReportAggregateFunction } from '../../../shared/types/relationship.types';
import { AggregationEditorPopover, type AggregationDraft } from './AggregationEditorPopover';

interface DateTruncRowProps {
  rule: DateTruncRule;
  /** `true` when the column is no longer a selectable date/timestamp column. */
  isOrphaned: boolean;
  /** Field type — drives the popover shape when editing the column. */
  fieldType: string;
  /** Aggregate functions the column may carry (so the popover can switch to aggregate). */
  allowedAggregations: readonly ReportAggregateFunction[];
  displayLabel?: string;
  dataMartName?: string;
  /** Edit the whole column's bucket/aggregation selection at once. */
  onApplyDraft: (draft: AggregationDraft) => void;
  onRemove: () => void;
}

export function DateTruncRow({
  rule,
  isOrphaned,
  fieldType,
  allowedAggregations,
  displayLabel,
  dataMartName,
  onApplyDraft,
  onRemove,
}: DateTruncRowProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 rounded px-2 py-1.5',
        isOrphaned ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted/40'
      )}
    >
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-1 truncate font-mono text-xs' title={rule.column}>
          {isOrphaned && (
            <span
              className='inline-flex items-center text-red-600'
              title='This column is no longer a date/timestamp column. Remove this rule or restore the column.'
              aria-label='Column not found in schema'
            >
              <AlertTriangle className='h-3 w-3' />
            </span>
          )}
          <span className={cn(isOrphaned && 'text-red-700 line-through dark:text-red-300')}>
            {displayLabel ?? rule.column}
          </span>
        </div>
        {!isOrphaned && dataMartName && (
          <div className='text-muted-foreground truncate text-[11px]'>{dataMartName}</div>
        )}
        <div className='truncate font-mono text-[11px]'>
          <span className='text-muted-foreground'>grouped by </span>
          <span className='text-foreground/70 font-medium'>{rule.unit}</span>
          {rule.timeZone && <span className='text-muted-foreground'> · {rule.timeZone}</span>}
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
        <AggregationEditorPopover
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
              aria-label='Edit date bucket'
            >
              <Pencil className='h-4 w-4' />
            </Button>
          }
          column={rule.column}
          fieldType={fieldType}
          displayLabel={displayLabel}
          dataMartName={dataMartName}
          allowedAggregations={allowedAggregations}
          initialBucket={rule.unit}
          initialTimeZone={rule.timeZone ?? null}
          onApply={onApplyDraft}
        />
      )}
      <Button
        variant='ghost'
        size='sm'
        className='text-muted-foreground hover:text-foreground h-6 w-6 p-0'
        onClick={onRemove}
        aria-label='Remove date bucket'
      >
        <X className='h-4 w-4' />
      </Button>
    </div>
  );
}
