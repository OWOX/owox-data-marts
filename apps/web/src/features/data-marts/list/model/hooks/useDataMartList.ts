import { useCallback, useRef } from 'react';
import { useDataMartListContext } from '../context';
import { mapDataMartListFromDto } from '../mappers/data-mart-list.mapper.ts';
import { dataMartService } from '../../../shared';
import { trackEvent } from '../../../../../utils/data-layer';

const SILENT_REQUEST_OPTIONS = {
  skipLoadingIndicator: true,
  skipErrorToast: true,
} as const;

export function useDataMartList() {
  const { state, dispatch } = useDataMartListContext();
  const requestGenerationRef = useRef(0);

  const loadDataMarts = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const requestGeneration = ++requestGenerationRef.current;
      if (!options.silent) dispatch({ type: 'SET_LOADING' });

      try {
        const response = await dataMartService.getDataMarts(
          options.silent ? SILENT_REQUEST_OPTIONS : undefined
        );
        if (requestGeneration !== requestGenerationRef.current) return;
        const listItems = mapDataMartListFromDto(response);
        dispatch({ type: 'SET_ITEMS', payload: listItems });
      } catch (error) {
        if (options.silent || requestGeneration !== requestGenerationRef.current) return;
        dispatch({
          type: 'SET_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to load data marts',
        });
      }
    },
    [dispatch]
  );

  const deleteDataMart = useCallback(
    async (id: string) => {
      requestGenerationRef.current += 1;
      dispatch({ type: 'SET_LOADING' });

      try {
        await dataMartService.deleteDataMart(id);
        trackEvent({
          event: 'data_mart_deleted',
          category: 'DataMart',
          action: 'Delete',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete data mart';
        dispatch({
          type: 'SET_ERROR',
          payload: message,
        });
        trackEvent({
          event: 'data_mart_error',
          category: 'DataMart',
          action: 'DeleteError',
          label: message,
        });
        throw error;
      }
    },
    [dispatch]
  );

  const publishDataMart = useCallback(async (id: string) => {
    try {
      await dataMartService.publishDataMart(id);
      await dataMartService.createSchemaActualizeTrigger(id);
      trackEvent({
        event: 'data_mart_published',
        category: 'DataMart',
        action: 'Publish',
        context: id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish data mart';
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'PublishError',
        label: message,
      });
      throw error;
    }
  }, []);

  const refreshList = useCallback(() => {
    return loadDataMarts();
  }, [loadDataMarts]);

  return {
    items: state.items,
    loading: state.loading,
    error: state.error,
    loadDataMarts,
    refreshList,
    deleteDataMart,
    publishDataMart,
  };
}
