import { DataStorageActionType, useDataStorageContext } from '../context';
import { useCallback } from 'react';
import { dataStorageApiService } from '../../api';
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
      const response = await dataStorageApiService.getDataStorages();
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
        const response = await dataStorageApiService.getDataStorageById(id);
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
        const request = mapToCreateDataStorageRequest(data);
        const response = await dataStorageApiService.createDataStorage(request);
        dispatch({
          type: DataStorageActionType.CREATE_STORAGE_SUCCESS,
          payload: mapDataStorageFromDto(response),
        });
      } catch (error) {}
    },
    [dispatch]
  );

  const deleteDataStorage = useCallback(async (id: DataStorage['id']) => {
    dispatch({ type: DataStorageActionType.DELETE_STORAGE_START });
    try {
      await dataStorageApiService.deleteDataStorage(id);
      dispatch({ type: DataStorageActionType.DELETE_STORAGE_SUCCESS, payload: id });
    } catch (error) {
      dispatch({
        type: DataStorageActionType.DELETE_STORAGE_ERROR,
        payload: error instanceof Error ? error.message : 'Failed to delete data storage',
      });
    }
  }, []);

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
