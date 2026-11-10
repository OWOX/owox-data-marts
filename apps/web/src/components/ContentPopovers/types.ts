import type React from 'react';

export interface PopoverConfig {
  width?: number;
  /** `auto` fits the content, up to the viewport height. */
  height?: number | 'auto';
  position?: 'center' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  title?: React.ReactNode;
  content: React.ComponentType<{ onClose?: () => void }>;
  /** Runs when the user closes the popover with its × button. */
  onDismiss?: () => void;
}

export type PopoverId = string;
