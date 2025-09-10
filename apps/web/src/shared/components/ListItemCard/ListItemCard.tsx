import { ChevronRight } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { type ListItemCardProps } from './types';
import { type ElementType } from 'react';

export function ListItemCard({
  icon,
  title,
  subtitle,
  rightContent,
  onClick,
  className,
}: ListItemCardProps) {
  const Icon = icon as ElementType;
  return (
    <div
      className={cn(
        'group flex items-center gap-4 rounded-md border-b border-gray-200 bg-white transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2',
        onClick && 'cursor-pointer dark:hover:bg-white/5',
        className
      )}
      onClick={onClick}
    >
      {/* Left content */}
      <div className='flex flex-grow items-start justify-center gap-3 px-6 py-5'>
        {/* Icon */}
        {icon && (
          <div className='flex items-center justify-center'>
            <Icon className='h-6 w-6' />
          </div>
        )}
        {/* Text content */}
        <div className='flex flex-grow flex-col gap-1'>
          <div className='text-md font-medium'>{title}</div>
          {subtitle && <div className='text-muted-foreground/60 text-sm'>{subtitle}</div>}
        </div>
      </div>

      {/* Right content */}
      <div className='flex items-center justify-center gap-2 p-4'>
        {rightContent}
        {onClick && (
          <div className='flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-gray-200/50 dark:group-hover:bg-white/4'>
            <ChevronRight className='text-muted-foreground/75 dark:text-muted-foreground/50 h-4 w-4' />
          </div>
        )}
      </div>
    </div>
  );
}
