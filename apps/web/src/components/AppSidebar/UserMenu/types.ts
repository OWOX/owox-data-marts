import type { LucideIcon } from 'lucide-react';

export type UserMenuItem =
  | {
      type: 'item';
      title: string;
      icon: LucideIcon;
      onClick: () => void;
      className?: string;
    }
  | {
      type: 'separator';
    }
  | {
      type: 'submenu';
      title: string;
      icon: LucideIcon;
      submenu: {
        value: string | undefined;
        onChange: (value: string) => void;
        options: {
          value: string;
          label: string;
          icon?: LucideIcon;
        }[];
      };
    };
