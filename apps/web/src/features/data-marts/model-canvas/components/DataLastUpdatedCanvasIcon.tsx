import { History } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DataLastUpdatedDetails } from '../../shared/components/DataLastUpdatedValue';
import type { DataLastUpdatedDto } from '../../shared/types/api/response/data-mart-data-last-updated.dto';
import { formatDataLastUpdatedLabel } from '../../shared/utils/data-last-updated.utils';

interface DataLastUpdatedCanvasIconProps {
  dataMartTitle: string;
  block: DataLastUpdatedDto | null;
}

/**
 * Canvas-node indicator for Data Last Updated, shaped like its Data Quality neighbour: a small
 * icon whose detail lives in the hover card, instead of a text value competing with the node's
 * title and field count. A never-measured or unknown snapshot dims the icon rather than
 * spelling out "Unknown" on every node.
 */
export function DataLastUpdatedCanvasIcon({
  dataMartTitle,
  block,
}: DataLastUpdatedCanvasIconProps) {
  const label = formatDataLastUpdatedLabel(block);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          className={`nodrag inline-flex cursor-default items-center rounded p-0.5 transition-colors ${
            block?.dataLastUpdatedAt
              ? 'text-muted-foreground hover:text-foreground'
              : 'text-muted-foreground/50 hover:text-muted-foreground'
          }`}
          aria-label={`Data Last Updated for ${dataMartTitle}: ${label}`}
          onPointerDown={e => {
            e.stopPropagation();
          }}
        >
          <History className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
      </TooltipTrigger>
      <TooltipContent side='top' align='start' role='tooltip' className='max-w-xs'>
        {block ? (
          <DataLastUpdatedDetails block={block} />
        ) : (
          <div className='text-xs'>
            Data Last Updated has not been checked yet. Use the toolbar button to measure the
            visible Data Marts.
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
