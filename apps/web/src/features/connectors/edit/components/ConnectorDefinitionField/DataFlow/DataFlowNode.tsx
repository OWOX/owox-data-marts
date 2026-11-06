import type { ReactNode } from 'react';
import { cn } from '@owox/ui/lib/utils';

interface DataFlowNodeProps {
  /** Role of the node in the flow, rendered as a heading above the card (e.g. "Source", "Storage"). */
  role: string;
  /** Optional inline control right after the role heading, e.g. an info hint. */
  roleAddon?: ReactNode;
  /** Whether to show the role heading; the role still names the node for assistive tech. */
  showRole?: boolean;
  /**
   * Control at the right end of the heading row, shown only in a narrow `@container`
   * (stacked layout). Keeps the row there even when `showRole` is off.
   */
  narrowHeaderAction?: ReactNode;
  /** A 28px icon or logo. */
  icon: ReactNode;
  title: ReactNode;
  /** Node details and actions, e.g. `DataFlowParams` and an edit button. */
  children?: ReactNode;
}

/**
 * One end of a data flow (where data comes from or where it is loaded to):
 * a role heading with an optional action above a card holding an icon, a title and details.
 */
export function DataFlowNode({
  role,
  roleAddon,
  showRole = true,
  narrowHeaderAction,
  icon,
  title,
  children,
}: DataFlowNodeProps) {
  return (
    // Stretched by the parent grid row; the card grows to fill it, so side-by-side nodes match in height.
    <section aria-label={role} className='flex min-w-0 flex-col'>
      {(showRole || narrowHeaderAction) && (
        <div
          className={cn(
            'mb-1 flex h-6 items-center justify-between gap-2 pl-1',
            // Without a role heading the row exists only for the narrow-layout action.
            !showRole && '@2xl:hidden'
          )}
        >
          {showRole && (
            <div className='flex items-center'>
              {/* Capitals sit above the line box centre; the 1px nudge levels them with the addon icon. */}
              <span className='text-muted-foreground translate-y-px text-xs leading-none font-semibold tracking-wider uppercase'>
                {role}
              </span>
              {roleAddon}
            </div>
          )}
          {narrowHeaderAction && <div className='ml-auto @2xl:hidden'>{narrowHeaderAction}</div>}
        </div>
      )}
      <div className='border-border flex min-w-0 flex-1 items-start gap-3 rounded-md border-b bg-white px-3.5 py-3 dark:border-white/4 dark:bg-white/4'>
        <div className='flex size-7 shrink-0 items-center justify-center'>{icon}</div>
        <div className='min-w-0 flex-1'>
          <div className='pt-1 text-base leading-5 font-medium'>{title}</div>
          {children}
        </div>
      </div>
    </section>
  );
}
