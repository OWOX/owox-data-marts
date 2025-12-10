import { createContext } from 'react';
import { popoverItems } from '../../../components/ContentPopovers/items';

export type PopoverId = keyof typeof popoverItems;

export interface FloatingPopoverContextType {
  activePopoverId: PopoverId | null;
  openPopover: (id: PopoverId) => void;
  closePopover: (id: PopoverId) => void;
}

export const FloatingPopoverContext = createContext<FloatingPopoverContextType | null>(null);
