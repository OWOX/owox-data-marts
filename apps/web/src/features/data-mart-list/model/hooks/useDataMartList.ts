import { useCallback } from 'react';
import { useDataMartListContext } from '../context';
import type { DataMartListItem } from '../types';
import { dataMartService } from '../../api';

export function useDataMartList() {
  const { state, dispatch } = useDataMartListContext();

  const mapToListItems = (data: DataMartListItem[]): DataMartListItem[] => {
    return data.map(dmart => ({
      id: dmart.id,
      title: dmart.title,
      storageType: dmart.storageType,
      createdAt: new Date(dmart.createdAt),
      modifiedAt: new Date(dmart.modifiedAt),
    }));
  };

  const loadDataMarts = useCallback(async () => {
    dispatch({ type: 'SET_LOADING' });

    try {
      const response = await dataMartService.getDataMarts();
      const listItems = mapToListItems(response);
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
