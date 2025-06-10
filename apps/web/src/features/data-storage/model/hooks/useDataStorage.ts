import { DataStorageActionType, useDataStorageContext } from '../context';
import { useCallback } from 'react';
import {
  mapDataStorageFromDto,
  mapDataStorageListFromDto,
  mapToCreateDataStorageRequest,
} from '../mappers';
import type { DataStorage } from '../types/data-storage.ts';

export function useDataStorage() {
  const { state, dispatch } = useDataStorageContext();

  const fetchDataStorages = useCallback(async () => {
    dispatch({ type: DataStorageActionType.FETCH_STORAGES_START });
    try {
      // Use mock API service instead of real one
      const { mockDataStorageApiService } = await import('../../api/mock/mockDataStorageService');
      const response = await mockDataStorageApiService.getDataStorages();
      dispatch({
        type: DataStorageActionType.FETCH_STORAGES_SUCCESS,
        payload: response.map(mapDataStorageListFromDto),
      });
    } catch (error) {
      dispatch({
        type: DataStorageActionType.FETCH_STORAGES_ERROR,
        payload: error instanceof Error ? error.message : 'Failed to load data storages',
      });
    }
  }, [dispatch]);

  const getDataStorageById = useCallback(
    async (id: string) => {
      dispatch({ type: DataStorageActionType.FETCH_STORAGE_START });
      try {
        // Use mock API service instead of real one
        const { mockDataStorageApiService } = await import('../../api/mock/mockDataStorageService');
        const response = await mockDataStorageApiService.getDataStorageById(id);
        const dataStorage = mapDataStorageFromDto(response);
        dispatch({ type: DataStorageActionType.FETCH_STORAGE_SUCCESS, payload: dataStorage });
      } catch (error) {
        dispatch({
          type: DataStorageActionType.FETCH_STORAGE_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to load data storage',
        });
      }
    },
    [dispatch]
  );

  const createDataStorage = useCallback(
    async (data: Omit<DataStorage, 'id' | 'createdAt' | 'modifiedAt'>) => {
      dispatch({ type: DataStorageActionType.CREATE_STORAGE_START });
      try {
        // Use mock API service instead of real one
        const { mockDataStorageApiService } = await import('../../api/mock/mockDataStorageService');
        const request = mapToCreateDataStorageRequest(data);
        const response = await mockDataStorageApiService.createDataStorage(request);
        dispatch({
          type: DataStorageActionType.CREATE_STORAGE_SUCCESS,
          payload: mapDataStorageFromDto(response),
        });
      } catch (error) {
        dispatch({
          type: DataStorageActionType.CREATE_STORAGE_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to create data storage',
        });
      }
    },
    [dispatch]
  );

  const deleteDataStorage = useCallback(
    async (id: DataStorage['id']) => {
      dispatch({ type: DataStorageActionType.DELETE_STORAGE_START });
      try {
        // Use mock API service instead of real one
        const { mockDataStorageApiService } = await import('../../api/mock/mockDataStorageService');
        await mockDataStorageApiService.deleteDataStorage(id);
        dispatch({ type: DataStorageActionType.DELETE_STORAGE_SUCCESS, payload: id });
      } catch (error) {
        dispatch({
          type: DataStorageActionType.DELETE_STORAGE_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to delete data storage',
        });
      }
    },
    [dispatch]
  );

  return {
    dataStorages: state.dataStorages,
    loading: state.loading,
    error: state.error,
    fetchDataStorages,
    getDataStorageById,
    createDataStorage,
    deleteDataStorage,
  };
}
