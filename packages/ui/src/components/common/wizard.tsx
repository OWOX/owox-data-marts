'use client';

import * as React from 'react';
import { cn } from '@owox/ui/lib/utils';

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

// Re-export for unified import
export { AppWizard, AppWizardLayout, AppWizardActions };
