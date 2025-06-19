import type { ReactNode } from 'react';

export interface CollapsibleCardActionsProps {
  children: ReactNode;
}

export function CollapsibleCardActions({ children }: CollapsibleCardActionsProps) {
  return <div className='flex gap-2'>{children}</div>;
}

CollapsibleCardActions.displayName = 'CollapsibleCardActions';
