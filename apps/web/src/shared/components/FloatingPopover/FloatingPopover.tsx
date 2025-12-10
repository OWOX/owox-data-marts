'use client';
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { useFloatingPopover } from './useFloatingPopover';

export type FloatingPopoverPosition =
  | 'center'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-left'
  | 'top-right';

interface FloatingPopoverProps {
  width?: number;
  height?: number;
  position?: FloatingPopoverPosition;
  children: React.ReactNode;
}

const positionClasses: Record<FloatingPopoverPosition, string> = {
  center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
};

export function FloatingPopover({
  width = 500,
  height = 500,
  position = 'center',
  children,
}: FloatingPopoverProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      className={cn(
        'fixed z-[999] rounded-2xl border bg-white dark:bg-neutral-900',
        'border-neutral-200 dark:border-neutral-800',
        'shadow-2xl dark:shadow-none',
        'hover:shadow-3xl transform transition-all duration-200 ease-out',
        positionClasses[position],
        mounted ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      )}
      style={{ width, height }}
      data-slot='floating-popover'
    >
      <div className='flex h-full flex-col'>{children}</div>
    </div>
  );
}

/* ───────────────────────────────────────────── */
/* Header */
/* ───────────────────────────────────────────── */

export function FloatingPopoverHeader({ children }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className='relative flex items-center rounded-tl-2xl rounded-tr-2xl border-b bg-neutral-50 px-4 py-3 dark:bg-neutral-800/40'
      data-slot='floating-popover-header'
    >
      {children}
      <CloseButton />
    </div>
  );
}

function CloseButton() {
  const { closePopover, activePopoverId } = useFloatingPopover();

  return (
    <button
      onClick={() => {
        if (activePopoverId) {
          closePopover(activePopoverId);
        }
      }}
      className={cn(
        'absolute top-1/2 right-3 -translate-y-1/2 rounded-sm p-1.5 transition-all',
        'text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800',
        'focus:ring-brand-blue-500 focus:ring-2 focus:ring-offset-1 focus:outline-none active:scale-95'
      )}
      aria-label='Close popover'
    >
      <X className='size-4' />
    </button>
  );
}

/* ───────────────────────────────────────────── */
/* Title */
/* ───────────────────────────────────────────── */

export function FloatingPopoverTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className='text-md font-semibold' data-slot='floating-popover-title'>
      {children}
    </h2>
  );
}

/* ───────────────────────────────────────────── */
/* Content */
/* ───────────────────────────────────────────── */

export function FloatingPopoverContent({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex-1 space-y-4 overflow-auto p-4' data-slot='floating-popover-content'>
      {children}
    </div>
  );
}
