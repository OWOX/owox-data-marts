import type { ReactNode } from 'react';

interface DataFlowNodeProps {
  /** Role of the node in the flow, rendered as an overline (e.g. "Source", "Storage"). */
  role: string;
  /** Optional inline control next to the role, e.g. an info hint. */
  roleAddon?: ReactNode;
  /** A 28px icon or logo. */
  icon: ReactNode;
  title: ReactNode;
  /** Node details, usually `DataFlowParams`. */
  children?: ReactNode;
}

/**
 * One end of a data flow (where data comes from or where it is loaded to):
 * a tinted panel with a role overline, an icon, a title and details.
 * The icon sits at a fixed offset so `DataFlowConnector` points straight at it.
 */
export function DataFlowNode({ role, roleAddon, icon, title, children }: DataFlowNodeProps) {
  return (
    <section
      aria-label={role}
      className='border-border min-w-0 rounded-md border-b bg-white px-3.5 py-3 dark:border-white/4 dark:bg-white/4'
    >
      {/* Fixed height keeps the icon at the offset DataFlowConnector expects, addon or not. */}
      <div className='text-muted-foreground mb-2 flex h-4 items-center gap-0.5 text-xs font-semibold tracking-wider uppercase'>
        {role}
        {roleAddon}
      </div>
      <div className='flex min-w-0 items-start gap-3'>
        <div className='flex size-7 shrink-0 items-center justify-center'>{icon}</div>
        <div className='min-w-0 flex-1'>
          <div className='pt-1 text-base leading-5 font-medium'>{title}</div>
          {children}
        </div>
      </div>
    </section>
  );
}
