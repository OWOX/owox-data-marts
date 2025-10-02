import { createContext } from 'react';

interface LoadingContextType {
  isLoading: boolean;
}

export const LoadingContext = createContext<LoadingContextType>({ isLoading: false });
