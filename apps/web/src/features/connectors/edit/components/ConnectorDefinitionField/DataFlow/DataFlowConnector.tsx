import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * The decorative direction mark between two `DataFlowNode`s: a chevron pointing right,
 * centred on the row height, in a wide `@container`; pointing down, under the node icon,
 * when the nodes stack.
 */
export function DataFlowConnector() {
  return (
    // The grid cell stretches to the row height, so a flex box centres the mark vertically.
    <div
      aria-hidden='true'
      className='text-muted-foreground/50 @2xl:flex @2xl:items-center @2xl:justify-center'
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
