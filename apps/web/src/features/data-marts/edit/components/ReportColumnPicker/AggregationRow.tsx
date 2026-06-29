import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { Pencil, X, AlertTriangle } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import type { AggregationRule } from '../../../shared/types/output-config';
import type { ReportAggregateFunction } from '../../../shared/types/relationship.types';
import { aggregateFunctionLabel } from '../../../shared/utils/aggregation-labels';
import { AggregationEditorPopover, type AggregationDraft } from './AggregationEditorPopover';

interface AggregationRowProps {
  rule: AggregationRule;
  /** Field type — drives the popover shape when editing the column. */
  fieldType: string;
  /** Functions the column may be aggregated by; empty → column is orphaned/ungovernable. */
  allowedAggregations: readonly ReportAggregateFunction[];
  /** All functions currently assigned to this column (popover edits them together). */
  columnFunctions: readonly ReportAggregateFunction[];
  /** Business-readable label; falls back to the raw column when absent. */
  displayLabel?: string;
  /** Joined data mart name (muted second line); absent for home-mart fields. */
  dataMartName?: string;
  /** Edit the whole column's aggregation/bucket selection at once. */
  onApplyDraft: (draft: AggregationDraft) => void;
  onRemove: () => void;
}

export function AggregationRow({
  rule,
  fieldType,
  allowedAggregations,
  columnFunctions,
  displayLabel,
  dataMartName,
  onApplyDraft,
  onRemove,
}: AggregationRowProps) {
  const [editing, setEditing] = useState(false);
  const isOrphaned = allowedAggregations.length === 0;

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
              title='This column can no longer be aggregated. Remove this rule or restore the column.'
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
          <span className='text-muted-foreground'>aggregated by </span>
          <span className='text-foreground/70 font-medium'>
            {aggregateFunctionLabel(rule.function)}
          </span>
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
              aria-label='Edit aggregation'
            >
              <Pencil className='h-4 w-4' />
            </Button>
          }
          column={rule.column}
          fieldType={fieldType}
          displayLabel={displayLabel}
          dataMartName={dataMartName}
          allowedAggregations={allowedAggregations}
          initialFunctions={columnFunctions}
          onApply={onApplyDraft}
        />
      )}
      <Button
        variant='ghost'
        size='sm'
        className='text-muted-foreground hover:text-foreground h-6 w-6 p-0'
        onClick={onRemove}
        aria-label='Remove aggregation'
      >
        <X className='h-4 w-4' />
      </Button>
    </div>
  );
}
