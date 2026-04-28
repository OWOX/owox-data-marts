import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { type ReactNode } from 'react';

interface AdminGuardTooltipProps {
  /** Whether the caller is an admin. When true the tooltip is bypassed. */
  isAdmin: boolean;
  /** Hint shown to non-admins. */
  hint: string;
  /**
   * The disabled menu item / button being wrapped. A `<span>` is interposed
   * so Radix gets a hoverable target — disabled items swallow pointer
   * events on their own.
   */
  children: ReactNode;
  /** Tooltip placement. Defaults to `'left'` to match dropdown action cells. */
  side?: 'left' | 'right' | 'top' | 'bottom';
}

/**
 * Wraps a disabled action so non-admins see a tooltip explaining why the
 * action is unavailable. Replaces the local `withHint` helper that was
 * duplicated in `ContextsActionsCell` and `MembersActionsCell`.
 */
export function AdminGuardTooltip({
  isAdmin,
  hint,
  children,
  side = 'left',
}: AdminGuardTooltipProps) {
  if (isAdmin) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='inline-flex w-full'>{children}</span>
      </TooltipTrigger>
      <TooltipContent side={side}>{hint}</TooltipContent>
    </Tooltip>
  );
}
