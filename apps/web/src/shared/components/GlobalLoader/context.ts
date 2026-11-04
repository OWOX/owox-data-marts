import { createContext } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  /** A fraction from 0 to 1 when the work reports one. */
  progress?: number;
}

export const LoadingContext = createContext<LoadingContextType>({ isLoading: false });
