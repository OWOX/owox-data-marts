import { type ReactNode } from 'react';

// Types for CollapsibleCard compound components
export type { CollapsibleCardHeaderProps } from './CollapsibleCardHeader';
export type { CollapsibleCardFooterProps } from './CollapsibleCardFooter';

export interface CollapsibleCardProps {
  // Main props
  children: ReactNode;
  className?: string;

  // Display settings
  variant?: 'default' | 'dense' | 'flat';

  // Collapse settings
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;

  // Persistence settings
  name?: string; // Unique identifier for localStorage persistence
}
