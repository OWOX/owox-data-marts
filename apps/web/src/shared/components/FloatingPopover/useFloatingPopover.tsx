'use client';

import { useContext } from 'react';
import { FloatingPopoverContext } from './FloatingPopoverContext';

export function useFloatingPopover() {
  const ctx = useContext(FloatingPopoverContext);
  if (!ctx) {
    throw new Error('useFloatingPopover must be used inside <FloatingPopoverProvider>');
  }
  return ctx;
}
