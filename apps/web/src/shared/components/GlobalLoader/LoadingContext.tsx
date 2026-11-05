import { useSyncExternalStore, type ReactNode } from 'react';
import {
  getLoadingProgress,
  isApiLoading,
  subscribeToApiLoading,
} from '../../../app/api/api-loading';
import { LoadingContext } from './context';

interface LoadingProviderProps {
  children: ReactNode;
}

export function LoadingProvider({ children }: LoadingProviderProps) {
  const isLoading = useSyncExternalStore(subscribeToApiLoading, isApiLoading);
  const progress = useSyncExternalStore(subscribeToApiLoading, getLoadingProgress);

  return (
    <LoadingContext.Provider value={{ isLoading, progress }}>{children}</LoadingContext.Provider>
  );
}
