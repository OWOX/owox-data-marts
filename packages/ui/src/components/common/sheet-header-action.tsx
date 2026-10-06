import type { ComponentProps } from 'react';
import { cn } from '@owox/ui/lib/utils';

/**
 * A muted text action in a sheet header (Copy link, Preview SQL), set off from the
 * description by a leading divider. Shared so header actions cannot drift apart in style.
 *
 * The divider sits on a wrapper, so the button itself stays usable as a Radix `asChild`
 * trigger: pass the trigger as `children` of `SheetHeaderAction` around a `SheetHeaderActionButton`.
 */
export function SheetHeaderAction({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('border-border border-l pl-2', className)} {...props} />;
}

export function SheetHeaderActionButton({
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={cn(
        'text-muted-foreground hover:bg-muted hover:text-foreground -my-1.5 flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors',
        className
      )}
      {...props}
    />
  );
}
