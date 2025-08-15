import { CardTitle, CardDescription } from '@owox/ui/components/card';
import { Info } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { useContext } from 'react';
import { CollapsibleCardContext } from './CollapsibleCardContext';
import { type AppIcon } from '../../icons';

export interface CollapsibleCardHeaderTitleProps {
  icon: AppIcon;
  tooltip?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function CollapsibleCardHeaderTitle({
  icon: Icon,
  tooltip,
  subtitle,
  children,
}: CollapsibleCardHeaderTitleProps) {
  const { isCollapsed } = useContext(CollapsibleCardContext);

  return (
    <div className='flex items-center gap-2 self-center'>
      <div className='flex items-center gap-2'>
        {/* Card icon */}
        <div className='text-foreground flex h-7 w-7 items-center justify-center rounded-sm bg-gray-200/50 transition-colors duration-200 group-hover:bg-gray-200/75 dark:bg-white/8 dark:group-hover:bg-white/10'>
          <Icon size={18} />
        </div>
        <CardTitle className='text-md text-foreground leading-none font-medium'>
          {children}
        </CardTitle>
      </div>

      {/* Subtitle, shown only when collapsed */}
      {subtitle && (
        <CardDescription
          className={cn('text-md text-muted-foreground/50', !isCollapsed && 'hidden')}
        >
          {subtitle}
        </CardDescription>
      )}

      {/* Help icon with tooltip, visible only on header hover */}
      {tooltip && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='pointer-events-none ml-2 flex items-center opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100'>
                <Info className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors' />
                {/* Visually hidden help text for accessibility */}
                <span className='sr-only'>{tooltip}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

CollapsibleCardHeaderTitle.displayName = 'CollapsibleCardHeaderTitle';
