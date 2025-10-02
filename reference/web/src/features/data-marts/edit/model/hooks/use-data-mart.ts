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
    updateDataMartSchema,
    actualizeDataMartSchema,
    publishDataMart,
    runDataMart,
    cancelDataMartRun,
    getDataMartRuns,
    loadMoreDataMartRuns,
    reset,
    dataMart,
    isLoading,
    error,
    getErrorMessage,
    runs,
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
    getErrorMessage,
    deleteDataMart,
    updateDataMartTitle,
    updateDataMartDescription,
    updateDataMartDefinition,
    updateDataMartSchema,
    actualizeDataMartSchema,
    publishDataMart,
    runDataMart,
    cancelDataMartRun,
    getDataMartRuns,
    loadMoreDataMartRuns,
    runs,
  };
}
