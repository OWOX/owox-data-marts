import type { LucideIcon } from 'lucide-react';

export type SupportMenuItem =
  | {
      type: 'item';
      title: string;
      icon: LucideIcon;
      href?: string;
      onClick?: () => void;
      className?: string;
      mark?: boolean;
    }
  | {
      type: 'separator';
    }
  | {
      type: 'submenu';
      title: string;
      icon: LucideIcon;
      mark?: boolean;
      submenu: {
        onClick?: () => void;
        options: {
          label: string;
          icon?: LucideIcon;
          mark?: boolean;
        }[];
      };
    };
