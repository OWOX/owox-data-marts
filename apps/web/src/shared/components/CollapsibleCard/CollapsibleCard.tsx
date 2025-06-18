import { useState, useEffect } from 'react';
import { ChevronDown, CircleHelp } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { storageService } from '../../../services/localstorage.service';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from '@owox/ui/components/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import type { CollapsibleCardProps } from './types';

const baseCard =
  'rounded-xl bg-muted/50 p-0 gap-0 border-0 border-b border-gray-200 dark:border-white/10 shadow-none';

const cardVariants = {
  default: baseCard,
  dense: `${baseCard} text-sm`,
  flat: `${baseCard} border-b-0`,
};

const STORAGE_KEY_PREFIX = 'data-card-collapsed-';

export function CollapsibleCard({
  header,
  children,
  footer,
  className,
  variant = 'default',
  collapsible = false,
  defaultCollapsed = false,
  onCollapsedChange,
  name,
}: CollapsibleCardProps) {
  // Initialize collapsed state from localStorage if name is provided
  const initialCollapsed = name
    ? (storageService.get(`${STORAGE_KEY_PREFIX}${name}`, 'boolean') ?? defaultCollapsed)
    : defaultCollapsed;

  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  // Persist collapsed state to localStorage when it changes
  useEffect(() => {
    if (name) {
      storageService.set(`${STORAGE_KEY_PREFIX}${name}`, isCollapsed);
    }
  }, [isCollapsed, name]);

  const handleCollapse = () => {
    const newValue = !isCollapsed;
    setIsCollapsed(newValue);
    onCollapsedChange?.(newValue);
  };

  const Icon = header.icon;

  return (
    <Card className={cn(cardVariants[variant], className)}>
      <CardHeader
        className={cn(
          'group flex items-start justify-between gap-4 px-4 py-4',
          collapsible && 'cursor-pointer'
        )}
        onClick={collapsible ? handleCollapse : undefined}
      >
        {/* Left side of header */}
        <div className='flex items-center gap-3'>
          <div className='flex items-center gap-2'>
            {/* Card icon */}
            <div className='text-foreground flex h-7 w-7 items-center justify-center rounded-sm bg-gray-200/50 transition-colors duration-200 group-hover:bg-gray-200/75 dark:bg-gray-700/50 dark:group-hover:bg-gray-700/75'>
              <Icon className='h-4 w-4' strokeWidth={2.25} />
            </div>

            {/* Title section */}
            <CardTitle className='text-md text-foreground leading-none font-medium'>
              {header.title}
            </CardTitle>
          </div>

          {/* Subtitle */}
          {header.subtitle && (
            <CardDescription
              className={cn('text-md text-muted-foreground/50', !isCollapsed && 'hidden')}
            >
              {header.subtitle}
            </CardDescription>
          )}

          {/* Help icon */}
          {header.help && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className='text-muted-foreground/50 hover:text-muted-foreground pointer-events-none flex h-4 w-4 items-center justify-center rounded-full opacity-0 transition-colors duration-200 group-hover:pointer-events-auto group-hover:opacity-100'>
                    <CircleHelp className='h-4 w-4' />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{header.help}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Right side of header */}
        <div className='flex items-center gap-2'>
          {/* Additional actions */}
          {header.actions}

          {/* Collapse button with animation */}
          {collapsible && (
            <button
              onClick={handleCollapse}
              className='flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-gray-200/50 dark:group-hover:bg-gray-700/25'
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            >
              <div
                className={cn(
                  'transform transition-transform duration-200',
                  isCollapsed ? 'rotate-0' : 'rotate-180'
                )}
              >
                <ChevronDown className='text-muted-foreground/75 dark:text-muted-foreground/50 h-4 w-4' />
              </div>
            </button>
          )}
        </div>
      </CardHeader>

      {/* Animated content section */}
      <div
        className={cn(
          'grid transition-all duration-200',
          isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
        )}
      >
        <div className='overflow-hidden'>
          {/* Main Content */}
          <CardContent className='px-4 pt-1'>{children}</CardContent>

          {/* Footer */}
          {footer && (
            <CardFooter className='flex items-center gap-2 px-4 py-4'>
              {/* Left content */}
              <div className='flex flex-grow items-center gap-2'>
                {/* Example buttons: <div className='flex items-center gap-2'><Button variant="default" className="bg-brand-blue-500 hover:bg-brand-blue-600 text-white">Save</Button><Button variant="outline">Discard</Button></div>, */}
                {footer.buttons}
                {/* Example statuses: <div className="flex items-center gap-1 text-sm text-green-500 dark:text-green-400"><BadgeCheck className='h-5 w-5 text-green-500 dark:text-green-400' /> Access confirmed — you're all set to work with this Data Mart</div>, */}
                {footer.statuses}
              </div>

              {/* Right content */}
              {/* Example info: <div className="flex items-center text-sm text-muted-foreground/50">Last updated: 17.06.2025</div>, */}
              {footer.info && <div className='flex items-center'>{footer.info}</div>}
            </CardFooter>
          )}
        </div>
      </div>
    </Card>
  );
}
