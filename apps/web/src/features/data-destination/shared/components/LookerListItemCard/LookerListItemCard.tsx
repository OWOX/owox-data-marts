import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { Switch } from '@owox/ui/components/switch';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

// Main container component
interface LookerListItemCardProps extends ComponentPropsWithoutRef<'div'> {
  title?: string; // Made optional since we'll generate it dynamically
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
  className?: string;
}

export function LookerListItemCard({
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  isLoading = false,
  onClick,
  className,
  ...props
}: LookerListItemCardProps) {
  // Generate title based on switch state
  const dynamicTitle =
    title ?? (checked ? 'Available in Looker Studio' : 'Not available in Looker Studio');

  // Handle card click to toggle switch state
  const handleCardClick = () => {
    if (disabled || isLoading) return;

    onCheckedChange(!checked);
    onClick?.();
  };

  return (
    <div
      className={cn(
        'group flex items-start justify-center gap-3 rounded-md border-b border-gray-200 bg-white transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2',
        !disabled && !isLoading && 'cursor-pointer dark:hover:bg-white/5',
        className
      )}
      onClick={handleCardClick}
      {...props}
    >
      {/* Left action area - Switch */}
      <LookerListItemCardActionLeft>
        {isLoading ? (
          <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
        ) : (
          <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
        )}
      </LookerListItemCardActionLeft>

      {/* Content area */}
      <LookerListItemCardContent>
        <LookerListItemCardTitle>{dynamicTitle}</LookerListItemCardTitle>
        {description && (
          <LookerListItemCardDescription>{description}</LookerListItemCardDescription>
        )}
      </LookerListItemCardContent>

      {/* Right action area - Chevron */}
      {onClick && (
        <LookerListItemCardActionRight>
          <div className='flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-gray-200/50 dark:group-hover:bg-gray-700/25'>
            <ChevronRight className='text-muted-foreground/75 dark:text-muted-foreground/50 h-4 w-4' />
          </div>
        </LookerListItemCardActionRight>
      )}
    </div>
  );
}

// Sub-components for composition
interface LookerListItemCardActionLeftProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

export function LookerListItemCardActionLeft({
  children,
  className,
  ...props
}: LookerListItemCardActionLeftProps) {
  return (
    <div
      className={cn('flex flex-shrink-0 items-start justify-center py-5 pl-6', className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface LookerListItemCardContentProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

export function LookerListItemCardContent({
  children,
  className,
  ...props
}: LookerListItemCardContentProps) {
  return (
    <div className={cn('flex flex-grow flex-col gap-1 px-0 py-4', className)} {...props}>
      {children}
    </div>
  );
}

interface LookerListItemCardTitleProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

export function LookerListItemCardTitle({
  children,
  className,
  ...props
}: LookerListItemCardTitleProps) {
  return (
    <div className={cn('text-md font-medium', className)} {...props}>
      {children}
    </div>
  );
}

interface LookerListItemCardDescriptionProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

export function LookerListItemCardDescription({
  children,
  className,
  ...props
}: LookerListItemCardDescriptionProps) {
  return (
    <div className={cn('text-muted-foreground/60 text-sm', className)} {...props}>
      {children}
    </div>
  );
}

interface LookerListItemCardActionRightProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

export function LookerListItemCardActionRight({
  children,
  className,
  ...props
}: LookerListItemCardActionRightProps) {
  return (
    <div
      className={cn('flex flex-shrink-0 items-center justify-center self-center p-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}
