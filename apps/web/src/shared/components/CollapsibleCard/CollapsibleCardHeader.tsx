import { CardHeader, CardTitle, CardDescription } from '@owox/ui/components/card';
import { ChevronDown, CircleHelp } from 'lucide-react';
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

export interface CollapsibleCardHeaderProps {
  icon: AppIcon;
  title: string;
  subtitle?: string;
  help?: string;
  actions?: React.ReactNode;
}

export function CollapsibleCardHeader({
  icon: Icon,
  title,
  subtitle,
  help,
  actions,
}: CollapsibleCardHeaderProps) {
  const { collapsible, isCollapsed, handleCollapse } = useContext(CollapsibleCardContext);
  return (
    <CardHeader
      className={cn(
        'group flex items-start justify-between gap-4 px-4 py-4',
        collapsible && 'cursor-pointer'
      )}
      onClick={collapsible ? handleCollapse : undefined}
    >
      {/* Left side of the header */}
      <div className='flex items-center gap-3'>
        <div className='flex items-center gap-2'>
          {/* Card icon */}
          <div className='text-foreground flex h-7 w-7 items-center justify-center rounded-sm bg-gray-200/50 transition-colors duration-200 group-hover:bg-gray-200/75 dark:bg-white/8 dark:group-hover:bg-white/10'>
            <Icon className='h-4 w-4' strokeWidth={2.25} />
          </div>
          <CardTitle className='text-md text-foreground leading-none font-medium'>
            {title}
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
        {help && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className='pointer-events-none ml-2 flex items-center opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100'>
                  <CircleHelp className='text-muted-foreground/50 h-4 w-4' />
                  {/* Visually hidden help text for accessibility */}
                  <span className='sr-only'>{help}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{help}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {/* Right side of the header */}
      <div className='flex items-center gap-2'>
        {actions}
        {/* Collapse chevron icon */}
        {collapsible && (
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-gray-200/50 dark:group-hover:bg-gray-700/25'
            )}
          >
            <div
              className={cn(
                'transform transition-transform duration-200',
                isCollapsed ? 'rotate-0' : 'rotate-180'
              )}
            >
              <ChevronDown className='text-muted-foreground/75 dark:text-muted-foreground/50 h-4 w-4' />
            </div>
          </div>
        )}
      </div>
    </CardHeader>
  );
}
CollapsibleCardHeader.displayName = 'CollapsibleCardHeader';
