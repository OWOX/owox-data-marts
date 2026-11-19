import { CardHeader } from '@owox/ui/components/card';
import { ChevronDown } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { useContext, Children, isValidElement, type ReactElement } from 'react';
import { CollapsibleCardContext } from './CollapsibleCardContext';
import { CollapsibleCardHeaderTitle } from './CollapsibleCardHeaderTitle';
import { CollapsibleCardHeaderActions } from './CollapsibleCardHeaderActions';

export interface CollapsibleCardHeaderProps {
  children: React.ReactNode;
}

export function CollapsibleCardHeader({ children }: CollapsibleCardHeaderProps) {
  const { collapsible, isCollapsed, handleCollapse, titleId } = useContext(CollapsibleCardContext);

  let title: ReactElement | undefined, actions;

  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    switch (child.type) {
      case CollapsibleCardHeaderTitle:
        title = child;
        break;
      case CollapsibleCardHeaderActions:
        actions = child;
        break;
      default:
        break;
    }
  });

  return (
    <CardHeader
      className={cn(
        'group flex items-start justify-between gap-4 px-4 py-4',
        collapsible && 'cursor-pointer'
      )}
      onClick={collapsible ? handleCollapse : undefined}
    >
      {/* Left side - Title */}
      {title}

      {/* Right side - Actions and Collapse Icon */}
      <div className='flex items-center gap-2'>
        {actions}
        {/* Collapse chevron icon */}
        {collapsible && (
          <button
            type='button'
            aria-expanded={!isCollapsed}
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : 'Show or hide'}
            className='focus-visible:ring-ring flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 outline-none hover:bg-gray-200/50 focus-visible:ring-2 dark:hover:bg-white/4'
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
  );
}

CollapsibleCardHeader.displayName = 'CollapsibleCardHeader';
