'use client';

import * as React from 'react';
import { cn } from '@owox/ui/lib/utils';
import { Label } from '@owox/ui/components/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Info, ExternalLinkIcon } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Link } from 'react-router-dom';

/**
 * AppWizard — base wrapper for multi-step wizard flows.
 * Provides the outer flex container and ensures full-height layout.
 *
 * Example:
 * <AppWizard>
 *   <AppWizardLayout> ...steps... </AppWizardLayout>
 *   <AppWizardActions variant="horizontal"> ... </AppWizardActions>
 * </AppWizard>
 */
function AppWizard({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-1 flex-col overflow-hidden', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * AppWizardLayout — scrollable content area for wizard steps.
 * Applies background, padding, and spacing between steps.
 *
 * Example:
 * <AppWizardLayout>
 *   {renderCurrentStep()}
 * </AppWizardLayout>
 */
function AppWizardLayout({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-muted dark:bg-sidebar flex-1 overflow-y-auto p-4', className)}
      {...props}
    >
      <div className='flex min-h-full flex-col gap-4'>{children}</div>
    </div>
  );
}

/**
 * AppWizardActions — standardized container for wizard action buttons.
 * Supports horizontal (footer-style) or vertical (stacked) layout.
 *
 * Example:
 * <AppWizardActions variant="horizontal">
 *   <StepNavigation ... />
 * </AppWizardActions>
 *
 * <AppWizardActions variant="vertical">
 *   <Button>Back</Button>
 *   <Button>Next</Button>
 * </AppWizardActions>
 */
function AppWizardActions({
  children,
  className = '',
  variant = 'horizontal',
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  variant?: 'horizontal' | 'vertical';
} & React.HTMLAttributes<HTMLDivElement>) {
  const wrapperClass =
    variant === 'vertical'
      ? 'flex flex-col gap-1.5 pt-4'
      : 'flex items-center justify-between border-t px-4 py-3';

  return (
    <div className={cn(wrapperClass, className)} {...props}>
      {children}
    </div>
  );
}

/**
 * AppWizardStepItem — wrapper for a single step field.
 * Provides consistent spacing & container styles.
 */
function AppWizardStepItem({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot='wizard-step-item'
      className={cn(
        'group border-border flex flex-col gap-2 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-transparent dark:bg-white/4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Props for AppWizardStepLabel
 */
interface AppWizardStepLabelProps extends React.ComponentProps<typeof Label> {
  required?: boolean;
  tooltip?: React.ReactNode | string;
  tooltipProps?: React.ComponentProps<typeof Tooltip>;
}

/**
 * AppWizardStepLabel — standardized label for wizard step fields.
 * Supports required marker and optional tooltip.
 */
function AppWizardStepLabel({
  children,
  required = false,
  tooltip,
  tooltipProps,
  className = '',
  ...props
}: AppWizardStepLabelProps) {
  return (
    <Label
      data-slot='wizard-step-label'
      className={cn(
        'text-foreground flex items-center justify-between gap-2 text-sm font-medium',
        className
      )}
      {...props}
    >
      {required ? (
        <Tooltip {...tooltipProps}>
          <TooltipTrigger asChild>
            <span className='flex items-center gap-1'>
              {children}
              <span className='ml-1 text-red-500'>*</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side='top' align='center' role='tooltip'>
            Required
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className='flex items-center gap-1'>{children}</span>
      )}

      {tooltip && (
        <Tooltip {...tooltipProps}>
          <TooltipTrigger asChild>
            <button
              type='button'
              tabIndex={-1}
              className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
              aria-label='Help information'
            >
              <Info
                className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                aria-hidden='true'
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side='top' align='center' role='tooltip'>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </Label>
  );
}

/**
 * Section for grouping wizard step fields with optional title.
 * Styled consistently with FormSection.
 */
function AppWizardStepSection({
  title,
  children,
  className = '',
  ...props
}: {
  title?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section data-slot='wizard-step-section' className={cn('mb-4', className)} {...props}>
      {title && (
        <h3 className='text-muted-foreground/75 mb-2 text-xs font-semibold tracking-wide uppercase'>
          {title}
        </h3>
      )}
      <div className='flex flex-col gap-2'>{children}</div>
    </section>
  );
}

/**
 * AppWizardStepHero — Hero-style header block for a wizard step.
 * Shows a centered logo, prominent title, and optional documentation link.
 */
function AppWizardStepHero({
  icon,
  title,
  docUrl,
  className,
  ...props
}: {
  icon?: React.ReactNode;
  title: string;
  docUrl?: string | null;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot='wizard-step-hero'
      className={cn('mb-6 flex flex-col items-center justify-center text-center', className)}
      {...props}
    >
      {icon && <div className='mt-6 mb-3'>{icon}</div>}

      <h2 className='text-xl font-medium'>{title}</h2>

      {docUrl != null && (
        <Button variant={'outline'} className='mt-3 mb-6' asChild>
          <Link to={docUrl} target='_blank' rel='noopener noreferrer'>
            View connector documentation
            <ExternalLinkIcon className='h-4 w-4' />
          </Link>
        </Button>
      )}
    </div>
  );
}

/**
 * AppWizardStep — Wrapper for a single wizard step.
 * Adds consistent vertical spacing between step elements.
 */
function AppWizardStep({
  children,
  className = '',
  ...props
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot='wizard-step' className={cn('space-y-4', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Generic grid wrapper for wizard entities (connectors, storages, etc.).
 */
function AppWizardGrid({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Selectable item in AppWizardGrid (connector, storage, etc.).
 * Uses styles similar to AppWizardStepItem for consistency.
 */
type AppWizardGridItemProps = {
  icon?: React.ReactNode;
  title: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
} & React.HTMLAttributes<HTMLDivElement>;

function AppWizardGridItem({
  icon,
  title,
  selected = false,
  disabled = false,
  onClick,
  onDoubleClick,
  className = '',
  ...props
}: AppWizardGridItemProps) {
  return (
    <div
      className={cn(
        'border-border flex items-center gap-4 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-transparent dark:bg-white/4',
        disabled
          ? 'cursor-not-allowed opacity-50 hover:shadow-none'
          : 'cursor-pointer hover:shadow-sm dark:hover:bg-white/8',
        selected && !disabled ? 'ring-primary border-transparent ring-2 dark:bg-white/8' : '',
        className
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      {...props}
    >
      {icon && <span className='shrink-0'>{icon}</span>}
      {disabled ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className='cursor-not-allowed text-sm font-medium opacity-70'>{title}</span>
          </TooltipTrigger>
          <TooltipContent side='top' align='center'>
            Coming soon
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className='text-sm font-medium'>{title}</span>
      )}
    </div>
  );
}

// Re-export for unified import
export {
  AppWizard,
  AppWizardLayout,
  AppWizardActions,
  AppWizardStepItem,
  AppWizardStepLabel,
  AppWizardStepSection,
  AppWizardStepHero,
  AppWizardStep,
  AppWizardGrid,
  AppWizardGridItem,
};
