import { Label } from '@owox/ui/components/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Info } from 'lucide-react';

interface SheetLabelProps {
  htmlFor?: string;
  children: React.ReactNode;
  tooltip?: React.ReactNode;
}

export function SheetLabel({ htmlFor, children, tooltip }: SheetLabelProps) {
  return (
    <Label
      htmlFor={htmlFor}
      className='text-foreground flex items-center justify-between gap-2 text-sm font-medium'
    >
      <span>{children}</span>
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type='button'
              tabIndex={-1}
              className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
              aria-label='Help information'
            >
              <Info
                className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                aria-hidden='true'
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side='top' align='center' role='tooltip'>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </Label>
  );
}
