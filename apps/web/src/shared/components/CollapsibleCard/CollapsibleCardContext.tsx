import { createContext } from 'react';

export interface CollapsibleCardContextType {
  isCollapsed: boolean;
  collapsible: boolean;
  handleCollapse: () => void;
  /** Reveal for navigation without changing the saved layout; returns a cleanup. */
  revealTemporarily?: () => () => void;
}

export const CollapsibleCardContext = createContext<CollapsibleCardContextType>({
  isCollapsed: false,
  collapsible: false,
  handleCollapse: () => {
    throw new Error('CollapsibleCardContext: handleCollapse not implemented');
  },
});
