import React from 'react';

export type VisibilityConfig =
  | {
      flagKey: string;
      expectedValue?: boolean | string | (boolean | string)[];
    }
  | boolean;

export interface ProjectMenuItem {
  type: 'menu-item' | 'separator' | 'project-settings-submenu';
  title: string;
  href: string;
  /** Builds a project-scoped external URL when the current project id is known. */
  buildHref?: (projectId: string) => string;
  icon: React.ComponentType<{ className?: string }>;
  visible: VisibilityConfig;
  group: string;
  internal?: boolean;
}
