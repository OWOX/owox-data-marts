import type React from 'react';

export interface PopoverConfig {
  width?: number;
  height?: number;
  position?: 'center' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  title?: string;
  content: React.ComponentType<{ onClose?: () => void }>;
}

export type PopoverId = string;
