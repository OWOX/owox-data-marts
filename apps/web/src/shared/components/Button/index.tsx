import * as React from 'react';
import { Button as ShadcnButton } from '@owox/ui/components/button';
import { cn } from '@owox/ui/lib/utils';
import { cva } from 'class-variance-authority';

// Define additional button variants without modifying the original
const extendedButtonVariants = cva('', {
  variants: {
    variant: {
      brand:
        'bg-brand-blue-500 text-white shadow-xs hover:bg-brand-blue-600 focus-visible:ring-brand-blue-200 dark:focus-visible:ring-brand-blue-400',
    },
  },
});

// Create a union type of all the original button variants plus our custom ones
type OriginalVariantType = React.ComponentProps<typeof ShadcnButton>['variant'];
type ExtendedVariantType = 'brand';
type CombinedVariantType = OriginalVariantType | ExtendedVariantType;

type ExtendedButtonProps = Omit<React.ComponentProps<typeof ShadcnButton>, 'variant'> & {
  variant?: CombinedVariantType;
};

export function Button({ className, variant, ...props }: ExtendedButtonProps) {
  // If using an extended variant, apply those classes through className
  if (variant === 'brand') {
    return (
      <ShadcnButton
        variant='default' // Use default as base for extended variants
        className={cn(extendedButtonVariants({ variant }), className)}
        {...props}
      />
    );
  }

  // Otherwise, pass through to the original button
  return <ShadcnButton variant={variant} className={className} {...props} />;
}
