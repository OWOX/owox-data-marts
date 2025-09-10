import React from 'react';

export type ProjectMenuItem =
  | {
      title: string;
      href: string;
      icon: React.ComponentType<{ className?: string }>;
      visible: boolean;
      type?: never;
    }
  | {
      type: 'separator';
      title?: never;
      href?: never;
      icon?: never;
      visible: boolean;
    }
  | {
      type: 'switcher';
      title: string;
      href?: never;
      icon: React.ComponentType<{ className?: string }>;
      visible: boolean;
    };
