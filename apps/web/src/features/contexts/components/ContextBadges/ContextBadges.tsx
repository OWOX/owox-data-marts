import { Badge } from '@owox/ui/components/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';

interface ContextBadgeData {
  id: string;
  name: string;
}

export function ContextBadges({ contexts }: { contexts?: ContextBadgeData[] }) {
  if (!contexts || contexts.length === 0) return null;

  return (
    <div className='flex max-w-full flex-wrap gap-1'>
      {contexts.map(ctx => (
        <Tooltip key={ctx.id}>
          <TooltipTrigger asChild>
            <Badge
              variant='secondary'
              // Cap badge width so a single very long context name doesn't
              // overflow the cell; full name is exposed via tooltip below.
              className='max-w-[220px]'
            >
              <span className='truncate text-xs'>{ctx.name}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side='top' align='start'>
            {ctx.name}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
