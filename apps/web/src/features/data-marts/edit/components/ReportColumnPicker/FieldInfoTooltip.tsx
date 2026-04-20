import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';

interface FieldInfoTooltipProps {
  text: string | undefined;
  compact?: boolean;
}

export function FieldInfoTooltip({ text, compact }: FieldInfoTooltipProps) {
  if (!text) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className='text-muted-foreground/50 hover:text-muted-foreground inline-flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100'
          onClick={e => {
            // Prevent parent <label>/<button> from toggling the checkbox or
            // collapsing the group when the user clicks the info icon.
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Info className={cn('shrink-0', compact ? 'size-3.5' : 'size-4')} aria-hidden='true' />
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs whitespace-pre-wrap'>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
