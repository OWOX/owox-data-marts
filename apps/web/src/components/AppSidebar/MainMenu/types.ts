import type { LucideIcon } from 'lucide-react';

export interface MainMenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  external?: boolean;
  badge?: string;
}
