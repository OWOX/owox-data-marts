import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';

/**
 * The decorative direction mark between two `DataFlowNode`s: a chevron pointing right,
 * centred on the row height, in a wide `@container`; pointing down, under the node icon,
 * when the nodes stack. `withHeadings` tells it the nodes show their role headings.
 */
export function DataFlowConnector({ withHeadings = true }: { withHeadings?: boolean }) {
  return (
    // The grid cell stretches to the row height, so a flex box centres the mark vertically;
    // with headings, the top padding skips their row (24px + 4px gap) to centre on the cards.
    <div
      aria-hidden='true'
      className={cn(
        'text-muted-foreground/50 @2xl:flex @2xl:items-center @2xl:justify-center',
        withHeadings && '@2xl:pt-7'
      )}
    >
      {/* Stacked: under the node icon (node padding 14px + icon centre 14px - icon half 16px). */}
      <div className='ml-3 flex h-8 items-center @2xl:hidden'>
        <ChevronDown className='size-8' strokeWidth={1.5} />
      </div>
      <div className='hidden @2xl:flex'>
        <ChevronRight className='size-8' strokeWidth={1.25} />
      </div>
    </div>
  );
}
