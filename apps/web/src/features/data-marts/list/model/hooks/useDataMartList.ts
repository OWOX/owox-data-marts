import { useCallback } from 'react';
import { useDataMartListContext } from '../context';
import { dataMartService } from '../../../shared';
import { mapDataMartListFromDto } from '../mappers/data-mart-list.mapper.ts';
export function useDataMartList() {
  const { state, dispatch } = useDataMartListContext();

  const loadDataMarts = useCallback(async () => {
    dispatch({ type: 'SET_LOADING' });

    try {
      const response = await dataMartService.getDataMarts();
      const listItems = mapDataMartListFromDto(response);
      dispatch({ type: 'SET_ITEMS', payload: listItems });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to load data marts',
      });
    }
  }, [dispatch]);

  const refreshList = useCallback(() => {
    return loadDataMarts();
  }, [loadDataMarts]);

  return {
    items: state.items,
    loading: state.loading,
    error: state.error,
    loadDataMarts,
    refreshList,
  };
}
