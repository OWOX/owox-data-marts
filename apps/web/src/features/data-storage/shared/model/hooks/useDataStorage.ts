import { DataStorageActionType, useDataStorageContext } from '../context';
import { useCallback } from 'react';
import {
  mapDataStorageFromDto,
  mapDataStorageListFromDto,
  mapToCreateDataStorageRequest,
  mapToUpdateDataStorageRequest,
} from '../mappers';
import type { DataStorage } from '../types/data-storage.ts';
import { dataStorageApiService } from '../../api';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';
import { DataStorageType } from '../types';
import { extractApiError } from '../../../../../app/api';
import toast from 'react-hot-toast';
import { trackEvent } from '../../../../../utils/data-layer';

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
        payload: extractApiError(error),
      });
      throw error;
    }
  }, [dispatch]);

  const getDataStorageById = useCallback(
    async (id: string) => {
      try {
        const response = await dataStorageApiService.getDataStorageById(id);
        const dataStorage = mapDataStorageFromDto(response);
        dispatch({ type: DataStorageActionType.FETCH_STORAGE_SUCCESS, payload: dataStorage });
      } catch (error) {
        dispatch({
          type: DataStorageActionType.FETCH_STORAGE_ERROR,
          payload: extractApiError(error),
        });
        throw error;
      }
    },
    [dispatch]
  );

  const createDataStorage = useCallback(
    async (type: DataStorageType) => {
      dispatch({ type: DataStorageActionType.CREATE_STORAGE_START });
      try {
        const request = mapToCreateDataStorageRequest(type);
        const response = await dataStorageApiService.createDataStorage(request);
        const newStorage = mapDataStorageFromDto(response);
        dispatch({
          type: DataStorageActionType.CREATE_STORAGE_SUCCESS,
          payload: newStorage,
        });

        trackEvent({
          event: 'data_storage_created',
          category: 'DataStorage',
          action: 'Create',
          label: newStorage.type,
        });

        toast.success('Storage created');
        return newStorage;
      } catch (error) {
        dispatch({
          type: DataStorageActionType.CREATE_STORAGE_ERROR,
          payload: extractApiError(error),
        });
        return null;
      }
    },
    [dispatch]
  );

  const updateDataStorage = useCallback(
    async (id: DataStorage['id'], data: DataStorageFormData) => {
      dispatch({ type: DataStorageActionType.UPDATE_STORAGE_START });
      try {
        const request = mapToUpdateDataStorageRequest(data);
        const response = await dataStorageApiService.updateDataStorage(id, request);
        const updatedStorage = mapDataStorageFromDto(response);
        dispatch({
          type: DataStorageActionType.UPDATE_STORAGE_SUCCESS,
          payload: updatedStorage,
        });
        trackEvent({
          event: 'data_storage_updated',
          category: 'DataStorage',
          action: 'Update',
          label: updatedStorage.type,
        });
        toast.success('Storage updated');
        return updatedStorage;
      } catch (error) {
        dispatch({
          type: DataStorageActionType.UPDATE_STORAGE_ERROR,
          payload: extractApiError(error),
        });
        return null;
      }
    },
    [dispatch]
  );

  const deleteDataStorage = useCallback(
    async (id: DataStorage['id']) => {
      dispatch({ type: DataStorageActionType.DELETE_STORAGE_START });
      try {
        await dataStorageApiService.deleteDataStorage(id);
        dispatch({ type: DataStorageActionType.DELETE_STORAGE_SUCCESS, payload: id });
        trackEvent({
          event: 'data_storage_deleted',
          category: 'DataStorage',
          action: 'Delete',
          label: id,
        });
        toast.success('Storage deleted');
      } catch (error) {
        dispatch({
          type: DataStorageActionType.DELETE_STORAGE_ERROR,
          payload: extractApiError(error),
        });
        throw error;
      }
    },
    [dispatch]
  );

  const clearCurrentDataStorage = useCallback(() => {
    dispatch({ type: DataStorageActionType.CLEAR_CURRENT_STORAGE });
  }, [dispatch]);

  return {
    dataStorages: state.dataStorages,
    currentDataStorage: state.currentDataStorage,
    loading: state.loading,
    error: state.error,
    fetchDataStorages,
    getDataStorageById,
    createDataStorage,
    updateDataStorage,
    deleteDataStorage,
    clearCurrentDataStorage,
  };
}
