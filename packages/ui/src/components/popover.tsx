'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

import { cn } from '@owox/ui/lib/utils';

/* -----------------------------------------------------------------------------
 * Root
 * -------------------------------------------------------------------------- */

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot='popover' {...props} />;
}

/* -----------------------------------------------------------------------------
 * Trigger
 * -------------------------------------------------------------------------- */

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot='popover-trigger' {...props} />;
}

/* -----------------------------------------------------------------------------
 * Content
 * -------------------------------------------------------------------------- */

type PopoverContentVariant = 'default' | 'light';

interface PopoverContentProps extends React.ComponentProps<typeof PopoverPrimitive.Content> {
  variant?: PopoverContentVariant;
}

const popoverVariantClasses: Record<PopoverContentVariant, string> = {
  default: 'w-72 rounded-md border p-4 shadow-md',
  light: 'w-[280px] md:w-[720px] rounded-lg border p-0 shadow-lg',
};

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  variant = 'default',
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot='popover-content'
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // base
          'bg-popover text-popover-foreground z-50 outline-hidden',
          'origin-(--radix-popover-content-transform-origin)',
          // animation
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[side=bottom]:slide-in-from-top-2',
          'data-[side=left]:slide-in-from-right-2',
          'data-[side=right]:slide-in-from-left-2',
          'data-[side=top]:slide-in-from-bottom-2',
          // variant
          popoverVariantClasses[variant],
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/* -----------------------------------------------------------------------------
 * Header (Sheet-like)
 * -------------------------------------------------------------------------- */

function PopoverHeader(props: React.ComponentProps<'div'>) {
  const { className, ...rest } = props;
  return (
    <div
      data-slot='popover-header'
      className={cn('flex flex-col gap-1 border-b p-4', className)}
      {...rest}
    />
  );
}

/* -----------------------------------------------------------------------------
 * Title
 * -------------------------------------------------------------------------- */

function PopoverTitle(props: React.ComponentProps<'h3'>) {
  const { className, ...rest } = props;
  return (
    <h3
      data-slot='popover-title'
      className={cn('text-foreground font-semibold', className)}
      {...rest}
    />
  );
}

/* -----------------------------------------------------------------------------
 * Description
 * -------------------------------------------------------------------------- */

function PopoverDescription(props: React.ComponentProps<'p'>) {
  const { className, ...rest } = props;
  return (
    <p
      data-slot='popover-description'
      className={cn('text-muted-foreground text-sm', className)}
      {...rest}
    />
  );
}

/* -----------------------------------------------------------------------------
 * Anchor
 * -------------------------------------------------------------------------- */

function PopoverAnchor(props: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot='popover-anchor' {...props} />;
}

/* -----------------------------------------------------------------------------
 * Exports
 * -------------------------------------------------------------------------- */

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  PopoverAnchor,
};
