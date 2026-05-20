import type { MouseEventHandler } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@owox/ui/lib/utils';

export interface TableSelectionCheckboxProps {
  checked: boolean;
  /** Ignored when `presentationOnly` is true */
  ariaLabel?: string | undefined;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  className?: string;
  checkIconClassName?: string;
  /** Decorative checkbox inside another interactive element (e.g. tree row button). */
  presentationOnly?: boolean;
  /** Extend the hit area of the checkbox to the parent element. */
  extendedHitArea?: boolean;
}

const indicatorClassName =
  'pointer-events-none flex items-center justify-center text-current transition-none';

/**
 * Button-style checkbox used in tables (row selection, column visibility toggles).
 * Use `presentationOnly` when embedding the visual inside another interactive element.
 */
export function TableSelectionCheckbox({
  checked,
  ariaLabel,
  onClick,
  disabled,
  className,
  presentationOnly = false,
  extendedHitArea = false,
  checkIconClassName = 'size-3.5 text-white',
}: TableSelectionCheckboxProps) {
  const boxClassName = cn(
    'border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary size-4 shrink-0 rounded-[4px] border bg-white shadow-xs dark:bg-white/8',
    'flex items-center justify-center',
    !presentationOnly && 'pointer-events-none',
    className
  );
  const buttonClassName = cn(
    'inline-flex items-center justify-center rounded-md',
    extendedHitArea ? 'size-8' : 'size-5',
    'transition-colors focus-visible:outline-none',
    'hover:bg-black/4 dark:hover:bg-white/4',
    'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
    'disabled:cursor-not-allowed disabled:opacity-50'
  );

  const indicator = checked ? (
    <span data-slot='checkbox-indicator' className={indicatorClassName}>
      <Check className={checkIconClassName} />
    </span>
  ) : null;

  if (presentationOnly) {
    return (
      <span aria-hidden data-state={checked ? 'checked' : 'unchecked'} className={boxClassName}>
        {indicator}
      </span>
    );
  }

  return (
    <button
      type='button'
      role='checkbox'
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      aria-label={ariaLabel}
      className={buttonClassName}
      onClick={onClick}
      disabled={disabled}
    >
      <span data-state={checked ? 'checked' : 'unchecked'} className={boxClassName}>
        {indicator}
      </span>
    </button>
  );
}
