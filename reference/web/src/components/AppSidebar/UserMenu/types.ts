import type { LucideIcon } from 'lucide-react';

export type UserMenuItem =
  | {
      title: string;
      icon: LucideIcon;
      onClick: () => void;
      className?: string;
      type?: never;
    }
  | {
      type: 'separator';
      title?: never;
      icon?: never;
      onClick?: never;
      className?: never;
    };
