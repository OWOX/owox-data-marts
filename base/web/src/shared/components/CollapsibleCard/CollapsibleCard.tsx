import { useState, useEffect, Children, isValidElement } from 'react';
import { cn } from '@owox/ui/lib/utils';
import { storageService } from '../../../services/localstorage.service';
import { Card } from '@owox/ui/components/card';
import { CollapsibleCardHeader } from './CollapsibleCardHeader';
import { CollapsibleCardContent } from './CollapsibleCardContent';
import { CollapsibleCardFooter } from './CollapsibleCardFooter';
import { CollapsibleCardContext } from './CollapsibleCardContext';
import type { ReactElement } from 'react';
import type { CollapsibleCardProps } from './types';

const STORAGE_KEY_PREFIX = 'collapsed-card-';

export type CollapsibleCardAllowedChild =
  | ReactElement<typeof CollapsibleCardHeader>
  | ReactElement<typeof CollapsibleCardContent>
  | ReactElement<typeof CollapsibleCardFooter>;

export interface StrictCollapsibleCardProps extends Omit<CollapsibleCardProps, 'children'> {
  children: CollapsibleCardAllowedChild | CollapsibleCardAllowedChild[];
}

export function CollapsibleCard({
  children,
  className,
  variant = 'default',
  collapsible = false,
  defaultCollapsed = false,
  onCollapsedChange,
  name,
}: CollapsibleCardProps) {
  const initialCollapsed = name
    ? (storageService.get(`${STORAGE_KEY_PREFIX}${name}`, 'boolean') ?? defaultCollapsed)
    : defaultCollapsed;

  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

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

  let header, content, footer;
  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    switch (child.type) {
      case CollapsibleCardHeader:
        header = child;
        break;
      case CollapsibleCardContent:
        content = child;
        break;
      case CollapsibleCardFooter:
        footer = child;
        break;
      default:
        break;
    }
  });

  const cardVariants = {
    default:
      'rounded-md p-0 gap-0 bg-muted/50 dark:bg-white/4 border-0 border-b border-gray-200 dark:border-white/8 shadow-none',
    dense:
      'rounded-md p-0 gap-0 bg-muted/50 dark:bg-white/4 border-0 border-b border-gray-200 dark:border-white/8 shadow-none text-sm',
    flat: 'rounded-md p-0 gap-0 border-0 border-b-0 shadow-none',
  };

  return (
    <CollapsibleCardContext.Provider value={{ isCollapsed, collapsible, handleCollapse }}>
      <Card className={cn(cardVariants[variant], className)}>
        {header}
        <div
          className={cn(
            'grid transition-all duration-200',
            isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
          )}
        >
          <div className='overflow-hidden'>
            {content}
            {footer}
          </div>
        </div>
      </Card>
    </CollapsibleCardContext.Provider>
  );
}
