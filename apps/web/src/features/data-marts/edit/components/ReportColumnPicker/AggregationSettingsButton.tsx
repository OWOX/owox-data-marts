import { useId, useState } from 'react';
import { Sigma } from 'lucide-react';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';

interface AggregationSettingsButtonProps {
  active: boolean;
  open: boolean;
  onClick: () => void;
  count?: number;
  /** The columns the product aggregated automatically; empty or absent draws nothing. */
  autoAppliedColumns?: readonly string[];
}

export function AggregationSettingsButton({
  active,
  open,
  onClick,
  count,
  autoAppliedColumns,
}: AggregationSettingsButtonProps) {
  // Dismissed on the first hover and never redrawn for this mount: it advertises that something
  // happened, and repeating that after the eye has been there is noise.
  const [dotSeen, setDotSeen] = useState(false);
  // Every report edit form mounts its own picker, and a duplicated DOM id would resolve
  // `aria-describedby` to whichever copy rendered first.
  const noteId = useId();
  const announced = autoAppliedColumns?.length
    ? `Automatic aggregations applied for fields: ${autoAppliedColumns.join(', ')}`
    : null;

  return (
    // Radix's Tooltip.Root takes a trigger and content only, so the hidden sentence below is a
    // sibling of <Tooltip> rather than a child.
    <div className='relative'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant={open ? 'secondary' : 'ghost'}
            size='sm'
            aria-label='Aggregations'
            aria-expanded={open}
            aria-describedby={announced ? noteId : undefined}
            onClick={onClick}
            onMouseEnter={() => {
              setDotSeen(true);
            }}
            className='relative h-7 w-7 gap-1'
          >
            <Sigma className={cn('h-3.5 w-3.5', active && 'text-blue-500')} />
            {announced && !dotSeen && (
              <span
                data-testid='auto-aggregation-dot'
                aria-hidden='true'
                // The warning token rather than the aggregation blue: blue already means "an
                // aggregation is set", and this says nobody set one. A dot rather than a shape —
                // at badge size anything with internal detail turns to mud over the glyph.
                className='bg-warning pointer-events-none absolute top-1 left-1 h-1.5 w-1.5 rounded-full'
              />
            )}
            {typeof count === 'number' && count > 0 && (
              <Badge
                variant='default'
                aria-label='Aggregations count'
                className='pointer-events-none absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full p-0 text-[8px] leading-none'
              >
                {count}
              </Badge>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {/* The note is added to the control's own name, never substituted for it. */}
          {announced ? `Aggregations & grouping — ${announced}` : 'Aggregations & grouping'}
        </TooltipContent>
      </Tooltip>
      {/* TooltipContent mounts only on hover/focus, so assistive tech needs the sentence here
          too. */}
      {announced && (
        <span id={noteId} className='sr-only'>
          {announced}
        </span>
      )}
    </div>
  );
}
