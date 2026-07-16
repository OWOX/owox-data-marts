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
    updateDataMartOwners,
    runDataMart,
    cancelDataMartRun,
    getDataMartRuns,
    getDataMartRunById,
    loadMoreDataMartRuns,
    reset,
    dataMart,
    isLoading,
    isLoadingMoreRuns,
    hasMoreRunsToLoad,
    hasActiveRuns,
    error,
    getErrorMessage,
    runs,
    isManualRunTriggered,
    manualRunId,
    resetManualRunTriggered,
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
    isLoadingMoreRuns,
    hasMoreRunsToLoad,
    hasActiveRuns,
    error,
    getErrorMessage,
    deleteDataMart,
    updateDataMartTitle,
    updateDataMartDescription,
    updateDataMartDefinition,
    updateDataMartSchema,
    actualizeDataMartSchema,
    publishDataMart,
    updateDataMartOwners,
    runDataMart,
    cancelDataMartRun,
    getDataMartRuns,
    getDataMartRunById,
    loadMoreDataMartRuns,
    runs,
    getDataMart,
    isManualRunTriggered,
    manualRunId,
    resetManualRunTriggered,
  };
}
