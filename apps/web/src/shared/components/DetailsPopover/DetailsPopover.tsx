import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';

interface DetailsPopoverProps {
  /** Tooltip text and accessible name of the info button, e.g. "Report details" */
  label: string;
  /** Card content shown when the button is clicked */
  children: ReactNode;
  /** Extra classes for the info button, e.g. hover-reveal classes of a table cell */
  className?: string;
  /** Controlled open state; omit to let the popover manage it */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * An info (ⓘ) button that opens a details card on click and names itself in a tooltip on hover.
 *
 * Built for table rows that open something on click: clicks on the button and inside the card
 * stop propagating (React bubbles portal events to the row), so they never trigger the row action.
 * The tooltip stays hidden while the card is open so the two never overlap.
 */
export function DetailsPopover({
  label,
  children,
  className,
  open,
  onOpenChange,
}: DetailsPopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <TooltipProvider>
        <Tooltip open={isTooltipOpen && !isOpen} onOpenChange={setIsTooltipOpen}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type='button'
                aria-label={label}
                className={cn(
                  'dm-card-table-body-row-actionbtn inline-flex !h-6 !w-6 shrink-0 items-center justify-center rounded-md',
                  className,
                  // Stay visible while the card is open, even when hover-reveal classes are passed
                  // (aria-expanded, since the tooltip and popover both write data-state)
                  'aria-expanded:pointer-events-auto aria-expanded:opacity-100'
                )}
                onClick={e => {
                  e.stopPropagation();
                }}
              >
                <Info className='dm-card-table-body-row-actionbtn-icon' aria-hidden='true' />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side='bottom' role='tooltip'>
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        className='w-[calc(100vw-1rem)] rounded-lg px-6 py-4 sm:w-110 sm:max-w-110'
        onClick={e => {
          e.stopPropagation();
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
