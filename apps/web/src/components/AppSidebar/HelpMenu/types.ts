import type { LucideIcon } from 'lucide-react';

export type VisibilityConfig =
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
      visible: VisibilityConfig;
    }
  | {
      type: 'separator';
    }
  | {
      type: 'submenu';
      title: string;
      icon: LucideIcon;
      visible: VisibilityConfig;
      submenu: {
        options: {
          label: string;
          icon?: LucideIcon;
          href?: string;
          onClick?: () => void;
        }[];
      };
    };
