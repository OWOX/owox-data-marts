import { Badge } from '@owox/ui/components/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { ContextSummary } from '../../types/context.types';
import { ContextIconGlyph } from '../ContextIcon';

export function ContextBadges({ contexts }: { contexts?: ContextSummary[] }) {
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
              <ContextIconGlyph icon={ctx.icon} className='shrink-0' aria-hidden='true' />
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
