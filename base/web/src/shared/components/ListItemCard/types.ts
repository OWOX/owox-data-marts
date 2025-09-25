import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { AppIcon } from '../../icons';

export interface ListItemCardProps extends ComponentPropsWithoutRef<'div'> {
  icon?: AppIcon; // Left icon (optional)
  title: string; // Main title
  subtitle?: string | ReactNode; // Optional subtitle
  rightContent?: ReactNode; // Additional content to the right of the chevron
  variant?: 'default'; // Display variant (default, dense, flat)
  onClick?: () => void; // Click handler
}
