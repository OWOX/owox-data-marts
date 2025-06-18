import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';

export interface CollapsibleCardHeaderProps {
  icon: LucideIcon | React.ComponentType<{ className?: string }>; // Required card icon
  title: string; // Required card title
  subtitle?: ReactNode; // Optional subtitle
  help?: string; // Optional tooltip text
  actions?: ReactNode; // Optional header actions
}

export interface CollapsibleCardFooterProps {
  buttons?: ReactNode; // Primary actions (e.g. Save, Discard, etc.)
  statuses?: ReactNode; // Statuses (e.g. Valid, Invalid, etc.)
  info?: ReactNode; // Additional content (Last updated, etc.)
}

export interface CollapsibleCardProps {
  // Main props
  header: CollapsibleCardHeaderProps;
  children: ReactNode;
  footer?: CollapsibleCardFooterProps;
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
