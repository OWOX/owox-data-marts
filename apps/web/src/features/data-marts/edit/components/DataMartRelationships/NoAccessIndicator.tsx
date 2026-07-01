import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { TriangleAlert } from 'lucide-react';

type Variant = 'muted' | 'destructive';

const VARIANT_COLOR: Record<Variant, string> = {
  muted: 'text-muted-foreground/70',
  destructive: 'text-destructive',
};

const TOOLTIP_TEXT = "You don't have access to this data mart";
const ARIA_LABEL = 'You do not have access to this data mart';

interface NoAccessIndicatorProps {
  variant?: Variant;
  className?: string;
}

export function NoAccessIndicator({ variant = 'muted', className }: NoAccessIndicatorProps = {}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TriangleAlert
          className={cn(VARIANT_COLOR[variant], 'size-4 shrink-0', className)}
          aria-label={ARIA_LABEL}
        />
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs'>
        {TOOLTIP_TEXT}
      </TooltipContent>
    </Tooltip>
  );
}

export function NoAccessIndicatorNative() {
  return (
    <span
      className={cn(VARIANT_COLOR.muted, 'inline-flex shrink-0')}
      title={TOOLTIP_TEXT}
      aria-label={ARIA_LABEL}
    >
      <TriangleAlert style={{ width: 14, height: 14 }} />
    </span>
  );
}
