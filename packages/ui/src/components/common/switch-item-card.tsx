import * as React from 'react';
import { cn } from '@owox/ui/lib/utils';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Loader2, ChevronRight } from 'lucide-react';

//
// Base container
//
export interface SwitchItemCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SwitchItemCard({ children, className, ...props }: SwitchItemCardProps) {
  return (
    <div
      className={cn(
        'group flex items-start justify-center gap-3 rounded-md border-b border-gray-200 bg-white transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

//
// Content block
//
export interface SwitchItemCardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SwitchItemCardContent({
  children,
  className,
  ...props
}: SwitchItemCardContentProps) {
  return (
    <div className={cn('flex flex-grow flex-col gap-1 py-4', className)} {...props}>
      {children}
    </div>
  );
}

//
// Title
//
export interface SwitchItemCardTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SwitchItemCardTitle({ children, className, ...props }: SwitchItemCardTitleProps) {
  return (
    <div className={cn('text-md font-medium', className)} {...props}>
      {children}
    </div>
  );
}

//
// Description
//
export interface SwitchItemCardDescriptionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SwitchItemCardDescription({
  children,
  className,
  ...props
}: SwitchItemCardDescriptionProps) {
  return (
    <div className={cn('text-muted-foreground text-sm', className)} {...props}>
      {children}
    </div>
  );
}

//
// Toggle (Switch + Tooltip + Loader)
//
export interface SwitchItemCardToggleProps {
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  onCheckedChange: (checked: boolean) => void;
  tooltipTextSwitchOn: string;
  tooltipTextSwitchOff: string;
  tooltipTextSwitchDisabled?: string;
}

/**
 * Switch Item Card Toggle component with tooltip and loading state
 * @param checked - Whether the switch is checked
 * @param disabled - Whether the switch is disabled
 * @param loading - Whether the switch is loading
 * @param onCheckedChange - Function to handle the switch change
 * @param tooltipTextSwitchOn - Tooltip text when the switch is on
 * @param tooltipTextSwitchOff - Tooltip text when the switch is off
 * @param tooltipTextSwitchDisabled - Tooltip text when the switch is disabled
 */
export function SwitchItemCardToggle({
  checked,
  disabled,
  loading,
  onCheckedChange,
  tooltipTextSwitchOn,
  tooltipTextSwitchOff,
  tooltipTextSwitchDisabled,
}: SwitchItemCardToggleProps) {
  const tooltipText = disabled
    ? (tooltipTextSwitchDisabled ?? 'Disabled')
    : checked
      ? tooltipTextSwitchOn
      : tooltipTextSwitchOff;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className='flex items-center justify-center py-5 pl-6'
          onClick={e => e.stopPropagation()}
        >
          {loading ? (
            <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
          ) : (
            <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

//
// Chevron Right
//
export interface SwitchItemCardChevronRightProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
}

export function SwitchItemCardChevronRight({
  icon,
  className,
  ...props
}: SwitchItemCardChevronRightProps) {
  return (
    <div
      className={cn('flex flex-shrink-0 items-center justify-center self-center p-4', className)}
      {...props}
    >
      <div className='flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-gray-200/50 dark:group-hover:bg-white/4'>
        {icon ?? (
          <ChevronRight className='text-muted-foreground/75 dark:text-muted-foreground/50 h-4 w-4' />
        )}
      </div>
    </div>
  );
}
