import { Info } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';

interface FieldInfoTooltipProps {
  text: string | undefined;
  compact?: boolean;
  dataMartHeader?: boolean;
  label?: string;
}

export function FieldInfoTooltip({ text, compact, dataMartHeader, label }: FieldInfoTooltipProps) {
  if (!text) return null;
  const className = cn(
    'text-muted-foreground hover:text-foreground inline-flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 transition-opacity',
    dataMartHeader
      ? 'group-hover/data-mart:opacity-100 focus-visible:opacity-100'
      : 'group-hover/row:opacity-100'
  );
  const stopParentToggle = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const icon = (
    <Info className={cn('shrink-0', compact ? 'size-3.5' : 'size-4')} aria-hidden='true' />
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {dataMartHeader ? (
          <button
            type='button'
            aria-label={`Data Mart details for ${label ?? 'data mart'}`}
            className={className}
          >
            {icon}
          </button>
        ) : (
          <span className={className} onClick={stopParentToggle}>
            {icon}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent
        side='top'
        collisionPadding={8}
        className='max-h-64 max-w-64 overflow-y-auto whitespace-pre-wrap'
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
