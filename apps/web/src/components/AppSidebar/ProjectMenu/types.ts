import React from 'react';

export type VisibilityConfig =
  | {
      flagKey: string;
      expectedValue?: boolean | string | (boolean | string)[];
    }
  | boolean;

export interface ProjectMenuItem {
  type: 'menu-item' | 'separator';
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: VisibilityConfig;
  group: string;
  internal?: boolean;
}
