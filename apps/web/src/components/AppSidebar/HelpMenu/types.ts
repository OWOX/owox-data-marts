import type { LucideIcon } from 'lucide-react';

export type Visibility =
  | {
      flagKey: string;
      expectedValue?: boolean | string;
    }
  | boolean;

export type HelpMenuItem =
  | {
      type: 'menu-item';
      title: string;
      icon: React.ComponentType<{ className?: string }>;
      href?: string;
      onClick?: () => void;
      visible: Visibility;
    }
  | {
      type: 'separator';
    }
  | {
      type: 'submenu';
      title: string;
      icon: LucideIcon;
      visible: Visibility;
      submenu: {
        options: {
          label: string;
          icon?: LucideIcon;
          href?: string;
          onClick?: () => void;
        }[];
      };
    };
