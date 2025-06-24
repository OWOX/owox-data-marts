import { useEffect } from 'react';
import { useDataMartContext } from '../context';

/**
 * Hook for loading and managing a single data mart
 * @param id Optional data mart ID
 */
export function useDataMart(id?: string) {
  const {
    getDataMart,
    deleteDataMart,
    updateDataMartTitle,
    updateDataMartDescription,
    updateDataMartDefinition,
    publishDataMart,
    runDataMart,
    reset,
    dataMart,
    isLoading,
    error,
  } = useDataMartContext();

  useEffect(() => {
    if (id) {
      void getDataMart(id);
    } else {
      reset();
    }

    return () => {
      reset();
    };
  }, [id, getDataMart, reset]);

  return {
    dataMart,
    isLoading,
    error,
    deleteDataMart,
    updateDataMartTitle,
    updateDataMartDescription,
    updateDataMartDefinition,
    publishDataMart,
    runDataMart,
  };
}
