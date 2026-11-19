import { createContext } from 'react';

export interface CollapsibleCardContextType {
  isCollapsed: boolean;
  collapsible: boolean;
  handleCollapse: () => void;
  /** The id of the header title; it names the collapse button. */
  titleId?: string;
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
