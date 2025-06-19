import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { LocalIcon } from '../../icons';

export interface ListItemCardProps extends ComponentPropsWithoutRef<'div'> {
  icon?: LucideIcon | LocalIcon; // Left icon (optional)
  title: string; // Main title
  subtitle?: string; // Optional subtitle
  rightContent?: ReactNode; // Additional content to the right of the chevron
  variant?: 'default'; // Display variant (default, dense, flat)
  onClick?: () => void; // Click handler
}
