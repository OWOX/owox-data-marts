import { useSyncExternalStore, type ReactNode } from 'react';
import { isApiLoading, subscribeToApiLoading } from '../../../app/api/api-loading';
import { LoadingContext } from './context';

interface LoadingProviderProps {
  children: ReactNode;
}

export function LoadingProvider({ children }: LoadingProviderProps) {
  const isLoading = useSyncExternalStore(subscribeToApiLoading, isApiLoading);

  return <LoadingContext.Provider value={{ isLoading }}>{children}</LoadingContext.Provider>;
}
