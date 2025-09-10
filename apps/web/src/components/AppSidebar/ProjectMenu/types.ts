import React from 'react';

export type ProjectMenuItem =
  | {
      title: string;
      href: string;
      icon: React.ComponentType<{ className?: string }>;
      type?: never;
    }
  | {
      type: 'separator';
      title?: never;
      href?: never;
      icon?: never;
    };
