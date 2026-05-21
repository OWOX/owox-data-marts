import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { TriangleAlert } from 'lucide-react';

const ICON_CLASS = 'text-muted-foreground/70 shrink-0';
const TOOLTIP_TEXT = "You don't have access to this data mart";
const ARIA_LABEL = 'You do not have access to this data mart';

export function NoAccessIndicator() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TriangleAlert className={`${ICON_CLASS} size-4`} aria-label={ARIA_LABEL} />
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs'>
        {TOOLTIP_TEXT}
      </TooltipContent>
    </Tooltip>
  );
}

export function NoAccessIndicatorNative() {
  return (
    <span className={`${ICON_CLASS} inline-flex`} title={TOOLTIP_TEXT} aria-label={ARIA_LABEL}>
      <TriangleAlert style={{ width: 14, height: 14 }} />
    </span>
  );
}
