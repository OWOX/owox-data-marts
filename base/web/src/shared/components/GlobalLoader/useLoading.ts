import { useContext } from 'react';
import { LoadingContext } from './context';

export function useLoading() {
  return useContext(LoadingContext);
}
