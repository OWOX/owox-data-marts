import type { LucideIcon } from 'lucide-react';

export interface MainMenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  children?: MainMenuItem[];
  external?: boolean;
  badge?: string;
}
