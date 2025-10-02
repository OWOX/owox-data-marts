import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { AppIcon } from '../../icons';

export interface FeatureLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
  icon?: AppIcon;
  iconPosition?: 'left' | 'right';
  className?: string;
  target?: string; // default: '_blank'
  rel?: string; // default: 'noopener noreferrer'
}
